/**
 * Captain Caption job queue in CP's own Postgres (no Redis). Webhooks and buttons enqueue; the captain-worker claims
 * one job at a time with FOR UPDATE SKIP LOCKED, so heavy checks never run inside a web request.
 */
const os = require('os');
const db = require('../../db');

const WORKER_ID = `${os.hostname()}:${process.pid}`;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function enqueue(kind, payload = {}, { dedupeKey = null, delaySec = 0, maxAttempts = 3 } = {}) {
  const { rows } = await db.query(
    `INSERT INTO captain_jobs (kind, payload, dedupe_key, run_after, max_attempts)
     VALUES ($1, $2, $3, NOW() + make_interval(secs => $4), $5)
     ON CONFLICT (dedupe_key) WHERE status IN ('queued', 'running') AND dedupe_key IS NOT NULL DO NOTHING
     RETURNING id`,
    [kind, JSON.stringify(payload), dedupeKey, delaySec, maxAttempts],
  );
  return rows[0]?.id || null;   // null = an identical job is already waiting
}

async function claim() {
  const { rows } = await db.query(
    `UPDATE captain_jobs SET status = 'running', locked_at = NOW(), locked_by = $1, attempts = attempts + 1
      WHERE id = (SELECT id FROM captain_jobs WHERE status = 'queued' AND run_after <= NOW()
                   ORDER BY run_after, id FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING *`,
    [WORKER_ID],
  );
  return rows[0] || null;
}

async function finish(id, result = null) {
  await db.query(`UPDATE captain_jobs SET status = 'done', finished_at = NOW(), result = $2, locked_at = NULL WHERE id = $1`, [id, result ? JSON.stringify(result) : null]);
}

async function fail(job, err) {
  const retry = job.attempts < job.max_attempts && !err?.noRetry;
  const backoff = Math.min(60 * 2 ** (job.attempts - 1), 1800);
  await db.query(
    `UPDATE captain_jobs SET status = $2, last_error = $3, locked_at = NULL,
            run_after = CASE WHEN $2 = 'queued' THEN NOW() + make_interval(secs => $4) ELSE run_after END,
            finished_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE NULL END
      WHERE id = $1`,
    [job.id, retry ? 'queued' : 'failed', String(err?.message || err).slice(0, 2000), backoff],
  );
  return retry;
}

/** Jobs stuck in "running" (worker restarted mid-check) go back to the queue. */
async function recoverStale() {
  await db.query(`UPDATE captain_jobs SET status = 'queued', locked_at = NULL WHERE status = 'running' AND locked_at < NOW() - INTERVAL '30 minutes'`);
}

async function heartbeat(extra = {}) {
  await db.query(`UPDATE settings SET captain_worker = $1 WHERE brand_id = 'particle'`, [JSON.stringify({ at: new Date().toISOString(), id: WORKER_ID, ...extra })]).catch(() => null);
}

/**
 * Run the worker loop forever. handlers = { [kind]: async (payload, job) => result }.
 * concurrency 1 by default — checks are mostly waiting on Frame.io/Gemini, and one at a time keeps the server calm.
 */
function startWorker({ handlers, concurrency = 1, pollMs = 3000 } = {}) {
  let running = 0, stopped = false;
  const lane = async () => {
    while (!stopped) {
      let job = null;
      try { job = await claim(); } catch (e) { console.warn('[captain-worker] claim failed:', e.message); }
      if (!job) { await sleep(pollMs); continue; }
      running++;
      const handler = handlers[job.kind];
      try {
        if (!handler) throw Object.assign(new Error(`No handler for job kind "${job.kind}"`), { noRetry: true });
        const result = await handler(job.payload || {}, job);
        await finish(job.id, result);
      } catch (e) {
        const retried = await fail(job, e).catch(() => false);
        console.warn(`[captain-worker] job ${job.id} (${job.kind}) failed${retried ? ' — will retry' : ''}:`, e.message);
      } finally { running--; }
    }
  };
  for (let i = 0; i < Math.max(1, concurrency); i++) lane();
  const beat = setInterval(() => { heartbeat({ running }); recoverStale().catch(() => null); }, 30000);
  heartbeat({ running: 0, started: true });
  return { stop: () => { stopped = true; clearInterval(beat); } };
}

module.exports = { WORKER_ID, enqueue, claim, finish, fail, recoverStale, heartbeat, startWorker };

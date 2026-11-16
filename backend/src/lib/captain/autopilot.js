/**
 * Captain Caption on autopilot — he works on his own (Tomer, 16 Nov 2026: "once a thing goes to review he does the
 * check; once he finishes he pushes it to the next step. No notifications or updates. After the 2nd review, if all is
 * fixed — or most of it and nothing critical — move it to Approved. A must-change is a must.")
 *
 * The team's real flow (45 days of status changes, 16 Nov 2026):
 *   Working → Review (video) / Quality Check (design)   — 1st review
 *           → Fixes Round (the editor fixes) → For Approval — 2nd review → Approved (or back to Fixes Round)
 *
 * What the Captain does, every time a ticket enters one of his review statuses (Settings → triggers):
 *   1. waits a few minutes (editors often upload right after moving the status), then checks the newest files —
 *      his comments go on the video / design itself (the posting switch), never on Monday: no updates, no @mentions;
 *   2. decides — only must-fixes count ("please check" notes never block, and a finding marked "not a typo" is gone):
 *        must-fixes left            → Fixes Round
 *        no must-fix, 1st review    → Approved (Settings: or For Approval, for a person to approve)
 *        no must-fix, later review  → Approved
 *      after max_rounds reviews that still have must-fixes he stops moving it and leaves it for a person;
 *   3. moves the status as "Captain Caption" (Monday's own board automations stay as they are — none notify).
 * A ticket that moved on before he got to it, is out of scope, has no file, or couldn't be checked is left alone.
 *
 * Off / Test (only the listed test tickets) / Live — HQ → Settings → Autopilot.
 */
const db = require('../../db');
const mondayApi = require('../monday');
const { getConfig, BOARDS, disciplineOfBoard } = require('./config');
const { enqueue } = require('./queue');
const { logEvent } = require('./log');
const captainMonday = require('./monday');

const DEFAULT = { mode: 'off', first_clean_to: 'Approved', fixes_status: 'Fixes Round', approved_status: 'Approved', max_rounds: 3, start_delay_min: 3, wait_new_version_min: 60, test_items: [] };
const settingsOf = (cfg) => ({ ...DEFAULT, ...(cfg.autopilot || {}) });

let ready = null;
function ensureTables() {
  if (!ready) {
    ready = db.query(`CREATE TABLE IF NOT EXISTS captain_autopilot (
        board_id TEXT NOT NULL, item_id TEXT NOT NULL, item_name TEXT, discipline TEXT,
        rounds INT NOT NULL DEFAULT 0, needs_person BOOLEAN NOT NULL DEFAULT false, last JSONB, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (board_id, item_id));
      CREATE TABLE IF NOT EXISTS captain_autopilot_cursor (board_id TEXT PRIMARY KEY, last_ms BIGINT NOT NULL, seen JSONB NOT NULL DEFAULT '[]', updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());`)
      .catch(e => { ready = null; throw e; });
  }
  return ready;
}

// ── the rules (pure — tested) ─────────────────────────────────────────────────
/**
 * { review: 1-based review number for this ticket, mustFix, notes, settings } → { to: status | null, why }
 * to = null → leave the status where it is (a person takes it from here).
 */
function decide({ review, mustFix, notes = 0, settings = DEFAULT }) {
  const s = { ...DEFAULT, ...settings };
  const notesText = notes ? ` (${notes} “please check” note${notes === 1 ? '' : 's'} left for the editor to judge)` : '';
  if (mustFix > 0) {
    if (review >= s.max_rounds) return { to: null, needs_person: true, why: `Review ${review}: still ${mustFix} must-fix${mustFix === 1 ? '' : 'es'} after ${review} rounds — left for a person` };
    return { to: s.fixes_status, why: `Review ${review}: ${mustFix} must-fix${mustFix === 1 ? '' : 'es'} — back to the editor${notesText}` };
  }
  if (review <= 1) return { to: s.first_clean_to, why: `Review 1: nothing that must change${notesText}` };
  return { to: s.approved_status, why: `Review ${review}: every must-fix is fixed${notesText}` };
}

// ── watching the boards ───────────────────────────────────────────────────────
let captainUser = { id: null, at: 0 };
async function captainUserId() {
  if (captainUser.id && Date.now() - captainUser.at < 6 * 3600 * 1000) return captainUser.id;
  const st = await captainMonday.status().catch(() => ({}));
  captainUser = { id: st.user_id ? String(st.user_id) : null, at: Date.now() };
  return captainUser.id;
}

const statusText = (v) => (v == null ? null : typeof v === 'string' ? v : (v.text || v.label?.text || v.label || null));
const norm = (s) => String(s || '').trim().toLowerCase();
const inList = (list, v) => (list || []).some(x => norm(x) === norm(v));
const testIds = (s) => (s.test_items || []).map(x => String(x).match(/(\d{8,})\s*$/)?.[1] || String(x).match(/pulses\/(\d+)/)?.[1] || String(x).trim()).filter(Boolean);

/** Every 2 minutes (captain-worker): a ticket that just entered a review status → a review job (deduped per change). */
async function watch() {
  const cfg = await getConfig();
  const s = settingsOf(cfg);
  if (s.mode === 'off') return { off: true };
  await ensureTables();
  const me = await captainUserId();
  const out = {};
  for (const [discipline, b] of Object.entries(BOARDS)) {
    const t = cfg.triggers?.[discipline] || {};
    const watched = [...(t.first || []), ...(t.second || [])];
    const { rows } = await db.query('SELECT last_ms, seen FROM captain_autopilot_cursor WHERE board_id = $1', [b.board_id]);
    const now = Date.now();
    // first run: start from now (never re-review old tickets when it's switched on); later: a 5-minute overlap
    // (Monday's log can be a little late) — the changes already handled are remembered, so none is reviewed twice
    const since = rows[0] ? Number(rows[0].last_ms) - 5 * 60 * 1000 : now - 2 * 60 * 1000;
    const seen = new Set(rows[0]?.seen || []);
    const { events } = await mondayApi.activityLogs(b.board_id, { fromIso: new Date(since).toISOString(), columnIds: [b.columns.status], limit: 200, maxPages: 3 });
    let queued = 0, last = rows[0] ? Number(rows[0].last_ms) : since;
    const keep = [];
    for (const e of events) {
      last = Math.max(last, e.at_ms || 0);
      if ((e.at_ms || 0) > now - 30 * 60 * 1000) keep.push(e.id);
      if (seen.has(e.id)) continue;
      const to = statusText(e.value);
      if (!to || !inList(watched, to)) continue;
      if (me && String(e.user_id) === me) continue;                                   // his own move
      if (s.mode === 'test' && !testIds(s).includes(String(e.pulse_id))) continue;
      const job = await enqueue('autopilot_review', { discipline, board_id: b.board_id, item_id: String(e.pulse_id), status: to, event_at: e.at_ms },
        { dedupeKey: `ap:${e.id}`, delaySec: Math.max(0, Number(s.start_delay_min) || 0) * 60, maxAttempts: 2, priority: 5 }).catch(() => null);
      if (job) queued++;
    }
    await db.query(`INSERT INTO captain_autopilot_cursor (board_id, last_ms, seen) VALUES ($1, $2, $3)
      ON CONFLICT (board_id) DO UPDATE SET last_ms = GREATEST(captain_autopilot_cursor.last_ms, EXCLUDED.last_ms), seen = EXCLUDED.seen, updated_at = NOW()`,
      [b.board_id, last || now, JSON.stringify([...new Set([...keep, ...[...seen].slice(-300)])].slice(-500))]);
    out[discipline] = queued;
  }
  return out;
}

// ── one review ────────────────────────────────────────────────────────────────
/** The checks that count for a run: a re-check of an unchanged file counts as the earlier check it repeats. */
async function countsFor(results) {
  const ids = (results || []).map(r => r.check_id).filter(Boolean);
  if (!ids.length) return { mustFix: 0, notes: 0, counted: [] };
  const { rows } = await db.query(`SELECT id, status, asset->>'previous_check' AS prev FROM captain_checks WHERE id = ANY($1::uuid[])`, [ids]);
  const counted = [...new Set(rows.map(r => (r.status === 'skipped' && r.prev ? r.prev : r.id)))];
  const { rows: n } = await db.query(
    `SELECT COUNT(*) FILTER (WHERE severity = 'must_fix')::int AS must_fix, COUNT(*) FILTER (WHERE severity <> 'must_fix')::int AS notes
       FROM captain_issues WHERE check_id = ANY($1::uuid[]) AND coalesce(feedback, '') <> 'not_a_typo'`, [counted]);
  return { mustFix: n[0]?.must_fix || 0, notes: n[0]?.notes || 0, counted };
}

async function setStatus(boardId, itemId, label) {
  const token = process.env.CAPTAIN_MONDAY_TOKEN;
  if (!token) throw new Error("The Captain's Monday token isn't set (CAPTAIN_MONDAY_TOKEN)");
  const meta = await mondayApi.boardMeta(boardId);
  const value = mondayApi.statusValue(meta.statusMaps?.status, label);
  if (value.index == null) throw new Error(`The board has no “${label}” status`);
  await mondayApi.mondayQuery('mutation ($b: ID!, $i: ID!, $v: JSON!) { change_column_value(board_id: $b, item_id: $i, column_id: "status", value: $v) { id } }',
    { b: String(boardId), i: String(itemId), v: JSON.stringify(value) }, { token });
}

async function remember(item, discipline, patch) {
  await db.query(`INSERT INTO captain_autopilot (board_id, item_id, item_name, discipline, rounds, needs_person, last, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (board_id, item_id) DO UPDATE SET item_name = EXCLUDED.item_name, rounds = EXCLUDED.rounds, needs_person = EXCLUDED.needs_person, last = EXCLUDED.last, updated_at = NOW()`,
    [item.board_id, item.id, item.name, discipline, patch.rounds, !!patch.needs_person, JSON.stringify(patch.last)]);
}

/** payload: { discipline, board_id, item_id, status, event_at, waited? } */
async function review(payload) {
  const cfg = await getConfig();
  const s = settingsOf(cfg);
  if (s.mode === 'off') return { skipped: 'autopilot is off' };
  await ensureTables();
  const discipline = payload.discipline || disciplineOfBoard(payload.board_id);
  const item = await captainMonday.readItem(payload.item_id);
  if (!item) return { skipped: 'item not found' };
  const base = { discipline, board_id: item.board_id, item_id: item.id };
  if (!inList([payload.status], item.status)) {
    await logEvent({ ...base, kind: 'skip', message: `Autopilot: “${item.name}” moved on to ${item.status || 'another status'} before the review — left alone` });
    return { skipped: 'moved on' };
  }
  if (s.mode === 'test' && !testIds(s).includes(String(item.id))) return { skipped: 'not a test ticket' };

  const { rows } = await db.query('SELECT rounds, last FROM captain_autopilot WHERE board_id = $1 AND item_id = $2', [item.board_id, item.id]);
  const n = (rows[0]?.rounds || 0) + 1;

  const run = discipline === 'design'
    ? await require('./design').runDesignJob({ item_id: item.id, trigger: 'autopilot', actor: 'Captain (autopilot)', quiet: true })
    : await require('./video').runVideoJob({ item_id: item.id, trigger: 'autopilot', actor: 'Captain (autopilot)', quiet: true });

  if (run?.skipped) {
    await logEvent({ ...base, kind: 'skip', message: `Autopilot: couldn’t review “${item.name}” — ${run.reason}. Left for a person.` });
    return { left: run.reason };
  }
  const results = run?.results || [];
  const waiting = results.filter(r => r.status === 'waiting');
  const errors = results.filter(r => r.status === 'error');
  if (waiting.length) {   // Frame.io still processing a new file — look again in 5 minutes (up to an hour)
    const tries = (payload.waited || 0) + 1;
    if (tries <= 12) {
      await enqueue('autopilot_review', { ...payload, waited: tries }, { dedupeKey: `ap:wait:${item.id}:${payload.event_at}:${tries}`, delaySec: 300, maxAttempts: 2, priority: 5 });
      return { waiting: tries };
    }
  }
  if (errors.length || !results.length) {
    await logEvent({ ...base, kind: 'error', message: `Autopilot: “${item.name}” — ${errors.length ? `couldn’t check ${errors.map(r => r.label).join(', ')}` : 'nothing to check'}. Left for a person.` });
    return { left: 'error' };
  }

  // A later review on exactly the files he already saw: give the editor time to upload the fixed version
  const nothingNew = results.every(r => r.status === 'skipped');
  const wasFixes = rows[0]?.last?.to === s.fixes_status;
  if (nothingNew && wasFixes && n > 1) {
    const waitedMin = (payload.waited_new || 0) * 10;
    if (waitedMin < s.wait_new_version_min) {
      await enqueue('autopilot_review', { ...payload, waited_new: (payload.waited_new || 0) + 1 }, { dedupeKey: `ap:new:${item.id}:${payload.event_at}:${payload.waited_new || 0}`, delaySec: 600, maxAttempts: 2, priority: 5 });
      return { waiting_for_new_version: waitedMin };
    }
  }

  const { mustFix, notes, counted } = await countsFor(results);
  const d = decide({ review: n, mustFix, notes, settings: s });
  const why = nothingNew && wasFixes && n > 1 ? `${d.why} — no new version was uploaded` : d.why;
  const last = { at: new Date().toISOString(), from: item.status, to: d.to, must_fix: mustFix, notes, checks: counted, why };
  if (d.to && !inList([d.to], item.status)) {
    try {
      // the status may have changed while he was checking — only move what's still waiting for him
      const fresh = await captainMonday.readItem(item.id);
      if (!inList([payload.status], fresh?.status)) {
        await logEvent({ ...base, kind: 'skip', message: `Autopilot: “${item.name}” was moved to ${fresh?.status} while being reviewed — left alone`, data: last });
        return { skipped: 'moved during review' };
      }
      await setStatus(item.board_id, item.id, d.to);
    } catch (e) {
      await logEvent({ ...base, kind: 'error', message: `Autopilot: couldn’t move “${item.name}” to ${d.to} — ${e.message}`, data: last });
      return { left: e.message };
    }
  }
  await remember(item, discipline, { rounds: n, needs_person: !!d.needs_person, last });
  await logEvent({ ...base, kind: 'move', message: `${item.name}: ${why}${d.to ? ` → ${d.to}` : ''}`, data: last, actor: 'Captain (autopilot)' });
  return { review: n, to: d.to, must_fix: mustFix, notes };
}

/** For HQ: what he decided lately and what's waiting for a person. */
async function overview(limit = 15) {
  await ensureTables();
  const [{ rows: recent }, { rows: stuck }] = await Promise.all([
    db.query(`SELECT board_id, item_id, item_name, discipline, rounds, needs_person, last, updated_at FROM captain_autopilot ORDER BY updated_at DESC LIMIT $1`, [limit]),
    db.query(`SELECT board_id, item_id, item_name, discipline, rounds, last, updated_at FROM captain_autopilot WHERE needs_person ORDER BY updated_at DESC LIMIT 20`),
  ]);
  const url = (r) => `https://particle-for-men.monday.com/boards/${r.board_id}/pulses/${r.item_id}`;
  return { recent: recent.map(r => ({ ...r, url: url(r) })), needs_person: stuck.map(r => ({ ...r, url: url(r) })) };
}

module.exports = { decide, watch, review, overview, countsFor, DEFAULT };

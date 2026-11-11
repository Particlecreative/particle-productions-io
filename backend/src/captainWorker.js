/**
 * captain-worker — the separate process that runs Captain Caption's checks (docker-compose service "captain-worker").
 * The API only receives webhooks/clicks and queues jobs; downloads, Gemini calls and comments happen here, so heavy
 * work never slows CP Panel. One job at a time by default (Settings → worker.concurrency).
 */
require('dotenv').config();

for (const key of ['DATABASE_URL']) {
  if (!process.env[key]) { console.error(`FATAL: Missing required environment variable: ${key}`); process.exit(1); }
}

const { startWorker } = require('./lib/captain/queue');
const { getConfig } = require('./lib/captain/config');
const { runVideoJob } = require('./lib/captain/video');
const { runDesignJob } = require('./lib/captain/design');
const importer = require('./lib/captain/importer');
const brief = require('./lib/captain/brief');
const medium = { corpus: require('./lib/medium/corpus'), writer: require('./lib/medium/writer') };

(async () => {
  const cfg = await getConfig().catch(() => null);
  const concurrency = Math.min(Math.max(Number(cfg?.worker?.concurrency) || 1, 1), 2);
  startWorker({
    concurrency,
    handlers: {
      video_check: runVideoJob,
      design_check: runDesignJob,
      brief_check: brief.rerunBriefCheck,      // HQ → Re-run on a brief check
      brief_batch: brief.runBriefBatch,        // Holiday Builder: up to 200 briefs
      // MEDIUM 🔮 — the creative strategist shares this worker (the spec's "medium-worker")
      medium_ingest: medium.corpus.ingestCorpus,
      medium_generate: medium.writer.runGenerate,
      medium_freeform: medium.writer.runFreeform,
      medium_improve: medium.writer.runImprove,
      medium_market: () => require('./lib/medium/market').runMarket(),
      medium_ranks: () => require('./lib/medium/ranks').refresh(),
      medium_account_read: () => require('./lib/medium/accountRead').syncAccountRead(),
      brand_site_read: (p) => require('./lib/captain/site').readSite(p.brand),
      import_start: (p) => importer.startImport(p),
      import_frameio_item: importer.importFrameioItem,
      import_figma_file: importer.importFigmaFile,
    },
  });
  console.log(`[captain-worker] started (concurrency ${concurrency})`);

  // Adobe refresh tokens lapse after ~14 days unused — keep the Captain's Frame.io sign-in alive
  const keep = () => require('./lib/captain/frameio').keepalive().catch(e => console.warn('[captain-worker] Frame.io keepalive failed:', e.message));
  setInterval(keep, 12 * 3600 * 1000);

  // MEDIUM's clock: daily AfterLife outcomes (free) and, when switched on, the Sunday autopilot
  const mediumTick = () => require('./lib/medium/autopilot').tick()
    .then(r => { if (Object.keys(r).length) console.log('[captain-worker] medium:', JSON.stringify(r).slice(0, 300)); })
    .catch(e => console.warn('[captain-worker] medium tick failed:', e.message));
  setTimeout(mediumTick, 60 * 1000);
  setInterval(mediumTick, 10 * 60 * 1000);
})();

process.on('unhandledRejection', (e) => console.warn('[captain-worker] unhandled:', e?.message || e));

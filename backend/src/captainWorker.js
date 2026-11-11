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
      import_start: (p) => importer.startImport(p),
      import_frameio_item: importer.importFrameioItem,
      import_figma_file: importer.importFigmaFile,
    },
  });
  console.log(`[captain-worker] started (concurrency ${concurrency})`);

  // Adobe refresh tokens lapse after ~14 days unused — keep the Captain's Frame.io sign-in alive
  const keep = () => require('./lib/captain/frameio').keepalive().catch(e => console.warn('[captain-worker] Frame.io keepalive failed:', e.message));
  setInterval(keep, 12 * 3600 * 1000);
})();

process.on('unhandledRejection', (e) => console.warn('[captain-worker] unhandled:', e?.message || e));

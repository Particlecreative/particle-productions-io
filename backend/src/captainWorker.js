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

(async () => {
  const cfg = await getConfig().catch(() => null);
  const concurrency = Math.min(Math.max(Number(cfg?.worker?.concurrency) || 1, 1), 2);
  startWorker({
    concurrency,
    handlers: {
      video_check: runVideoJob,
    },
  });
  console.log(`[captain-worker] started (concurrency ${concurrency})`);

  // Adobe refresh tokens lapse after ~14 days unused — keep the Captain's Frame.io sign-in alive
  const keep = () => require('./lib/captain/frameio').keepalive().catch(e => console.warn('[captain-worker] Frame.io keepalive failed:', e.message));
  setInterval(keep, 12 * 3600 * 1000);
})();

process.on('unhandledRejection', (e) => console.warn('[captain-worker] unhandled:', e?.message || e));

require('dotenv').config();

// Validate required env vars at startup
const REQUIRED_ENV = ['JWT_SECRET', 'DATABASE_URL'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`FATAL: Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const app  = require('./app');
const port = process.env.PORT || 3001;

app.listen(port, () => {
  console.log(`CP Panel API listening on port ${port}`);
  if (!process.env.ALLOWED_ORIGINS) console.warn('WARNING: ALLOWED_ORIGINS not set — CORS allows all origins');
  if (!process.env.GOOGLE_CLIENT_ID) console.warn('WARNING: Google OAuth not configured (GOOGLE_CLIENT_ID missing)');
  if (!process.env.SLACK_WEBHOOK_URL) console.warn('WARNING: Slack notifications disabled (SLACK_WEBHOOK_URL missing)');

  // ── Casting Rights Automation Scheduler ─────────────────────────────────
  // Run casting automations every 24 hours
  setInterval(async () => {
    try {
      const { runCastingAutomations } = require('./routes/castingAutomation');
      await runCastingAutomations();
    } catch (err) {
      console.error('Casting automation scheduled run error:', err);
    }
  }, 24 * 60 * 60 * 1000);

  // Also run once on startup (after 30 sec delay to let DB connect)
  setTimeout(async () => {
    try {
      const { runCastingAutomations } = require('./routes/castingAutomation');
      await runCastingAutomations();
      console.log('Initial casting automation check completed');
    } catch (err) {
      console.error('Casting automation startup error:', err);
    }
  }, 30000);
});

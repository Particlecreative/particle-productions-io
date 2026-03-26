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
});

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const app = express();

// Trust nginx reverse proxy (required for rate-limit + X-Forwarded-For)
app.set('trust proxy', 1);

// ── Security & parsing ──────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: false }));

// CORS — restrict to allowed origins (env var or allow all in dev)
const allowedList = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : null;
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (server-to-server, curl, mobile)
    if (!origin) return cb(null, true);
    // If no allowlist configured, allow only localhost (dev mode)
    if (!allowedList) {
      if (origin && (origin.includes('localhost') || origin.includes('127.0.0.1'))) return cb(null, true);
      return cb(null, false);
    }
    if (allowedList.includes(origin)) return cb(null, origin);
    // Block: return false (no Access-Control-Allow-Origin header)
    cb(null, false);
  },
  credentials: true,
}));

app.use(express.json({ limit: '10mb' }));

// ── Rate limiting on auth ────────────────────────────
const authLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,  // 5 minutes
  max: 30,                   // 30 attempts per 5-min window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later' },
});

// General API rate limiter (500 requests per minute per IP)
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down' },
});
app.use('/api', apiLimiter);

// ── Routes ──────────────────────────────────────────
app.use('/api/auth', authLimiter, require('./routes/auth'));
app.use('/api/productions',   require('./routes/productions'));
app.use('/api/line-items',    require('./routes/lineItems'));
app.use('/api/comments',      require('./routes/comments'));
app.use('/api/links',         require('./routes/links'));
app.use('/api/contracts',     require('./routes/contracts'));
app.use('/api/invoices',      require('./routes/invoices'));
app.use('/api/receipts',      require('./routes/receipts'));
app.use('/api/suppliers',     require('./routes/suppliers'));
app.use('/api/gantt',         require('./routes/gantt'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/change-history',require('./routes/changeHistory'));
app.use('/api/settings',      require('./routes/settings'));
app.use('/api/brands',        require('./routes/brands'));
app.use('/api/users',         require('./routes/users'));
app.use('/api/groups',        require('./routes/groups'));
app.use('/api/lists',         require('./routes/lists'));
app.use('/api/tickets',       require('./routes/improvementTickets'));
app.use('/api/people-on-set', require('./routes/peopleOnSet'));
app.use('/api/form-configs',  require('./routes/formConfigs'));
app.use('/api/casting',        require('./routes/casting'));
app.use('/api/call-sheets',    require('./routes/callSheets'));
app.use('/api/cc-purchases',   require('./routes/ccPurchases'));
app.use('/api/weekly-reports', require('./routes/weeklyReports'));
app.use('/api/scripts',        require('./routes/scripts'));
app.use('/api/admin',          require('./routes/admin'));
app.use('/api/casting-auto',   require('./routes/castingAutomation'));
app.use('/api/drive',          require('./routes/drive'));
app.use('/api/gcal',           require('./routes/gcal'));
app.use('/api/gmail',          require('./routes/gmail'));
app.use('/api/monday',         require('./routes/monday'));
app.use('/api/briefs',         require('./routes/briefs'));

// Google OAuth callback redirect — the callback URL registered with Google
// points to /api/auth/google/callback, so we redirect to the drive router
app.get('/api/auth/google/callback', (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  res.redirect(`/api/drive/callback?${qs}`);
});

// ── Public form endpoints (no auth required) ─────────
app.use('/api/public',           require('./routes/publicForms'));
app.use('/api/calendar',         require('./routes/calendar'));


// ── Health check ─────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ── Nightly Dropbox backup cron (9 PM Israel time) ───
const cron = require('node-cron');
const driveRouter = require('./routes/drive');
cron.schedule('0 21 * * *', async () => {
  console.log('[CRON] Starting nightly Dropbox backup...');
  try {
    const result = await driveRouter.runDropboxBackup();
    console.log('[CRON] Backup done:', result);
  } catch (err) {
    console.error('[CRON] Backup failed:', err.message);
  }
}, { timezone: 'Asia/Jerusalem' });

// ── Casting automation cron (8 AM Israel time) ───
cron.schedule('0 8 * * *', async () => {
  console.log('[CRON] Running casting automation check...');
  try {
    const { runCastingAutomations } = require('./routes/castingAutomation');
    if (runCastingAutomations) {
      const result = await runCastingAutomations();
      console.log('[CRON] Casting automation done:', result);
    }
  } catch (err) {
    console.error('[CRON] Casting automation failed:', err.message);
  }
}, { timezone: 'Asia/Jerusalem' });

// ── Global error handler ─────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

module.exports = app;

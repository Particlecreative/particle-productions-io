const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');

const app = express();

// Trust nginx reverse proxy (required for rate-limit + X-Forwarded-For)
app.set('trust proxy', 1);

// ── Security & parsing ──────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: false, // CSP breaks inline scripts in some cases; enable when ready
  hsts: { maxAge: 31536000, includeSubDomains: true },
}));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

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

app.use(express.json({ limit: '50mb' })); // base64 reference images for AI image gen can exceed 10mb

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
app.use('/api/product-deliveries', require('./routes/productDeliveries'));
app.use('/api/call-sheets',    require('./routes/callSheets'));
app.use('/api/cc-purchases',   require('./routes/ccPurchases'));
app.use('/api/weekly-reports', require('./routes/weeklyReports'));
app.use('/api/scripts',        require('./routes/scripts'));
app.use('/api/admin',          require('./routes/admin'));
app.use('/api/casting-auto',   require('./routes/castingAutomation'));
app.use('/api/drive',          require('./routes/drive'));
app.use('/api/higgsfield',     require('./routes/higgsfield'));
app.use('/api/gcal',           require('./routes/gcal'));
app.use('/api/gmail',          require('./routes/gmail'));
app.use('/api/monday',         require('./routes/monday'));
app.use('/api/briefs',         require('./routes/briefs'));
app.use('/api/tasks',          require('./routes/tasks'));
app.use('/api/finance-sheet',  require('./routes/financeSheet'));
app.use('/api/taxi',           require('./routes/taxi'));
app.use('/api/creative-reports', require('./routes/creativeReports'));
app.use('/api/studio', require('./routes/studio'));
app.use('/api/ticket-share', rateLimit({ windowMs: 15 * 60 * 1000, max: 150, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } }), require('./routes/ticketShare'));   // public request link (no login)
app.use('/api/tracker', require('./routes/tracker'));
app.use('/api/library', require('./routes/library'));
app.use('/api/finance', require('./routes/finance'));
app.use('/api/captain', require('./routes/captain'));   // Captain Caption 🧑‍✈️ (checks run in the separate captain-worker)
app.use('/api/medium', require('./routes/medium'));     // MEDIUM 🔮 creative strategist (writing runs in the captain-worker)
app.use('/api/me', require('./routes/me'));             // your own Monday connection, page views (Team activity)
app.use('/api/growth', require('./routes/growth'));     // Growth Studio: the Ads Library hand-off to AfterLife
app.use('/api/activity', require('./routes/activity')); // (admins) Team activity
app.use('/api/onair', require('./routes/onair'));       // On Air: TV (the agency's daily reports, from Gmail) + Meta (AfterLife)
app.use('/api/passwords', require('./routes/passwords'));
app.use('/api/hr', require('./routes/hr'));
app.use('/api/timetrack', require('./routes/timetrack'));   // Task time tracking: request → delivery, worked (clocked) time            // My HR (own BambooHR: clock, time off) + Team HR panel (admins)   // Studio passwords: the Access Passwords boards on Monday, live

// Google OAuth callback redirect — the callback URL registered with Google
// points to /api/auth/google/callback, so we redirect to the drive router
app.get('/api/auth/google/callback', (req, res) => {
  const qs = new URLSearchParams(req.query).toString();
  res.redirect(`/api/drive/callback?${qs}`);
});

// ── Public form endpoints (no auth required) ─────────
const publicLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 120, standardHeaders: true, legacyHeaders: false, message: { error: 'Too many requests' } });
app.use('/api/public', publicLimiter, require('./routes/publicForms'));
app.use('/api/calendar',         require('./routes/calendar'));


// ── Health check ─────────────────────────────────────
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ── Nightly Dropbox backup cron (9 PM Israel time) ───
const cron = require('node-cron');
const driveRouter = require('./routes/drive');
cron.schedule('0 21 * * *', async () => {
  console.log('[CRON] Starting nightly Dropbox backup...');
  // Retry up to 3 times with 30s delay
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await driveRouter.runDropboxBackup();
      console.log(`[CRON] Backup done (attempt ${attempt}):`, result);
      return; // success — exit
    } catch (err) {
      console.error(`[CRON] Backup attempt ${attempt}/3 failed:`, err.message);
      if (attempt < 3) {
        console.log('[CRON] Retrying in 30 seconds...');
        await new Promise(r => setTimeout(r, 30000));
      } else {
        console.error('[CRON] All 3 backup attempts failed. Check Dropbox connection in Settings.');
      }
    }
  }
}, { timezone: 'Asia/Jerusalem' });

// ── The Library: sync connected Google Sheets every 15 minutes ───
cron.schedule('*/15 * * * *', () => {
  require('./lib/librarySheet').syncAll().catch(err => console.error('[CRON] Library sheet sync failed:', err.message));
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

// ── On Air: read the TV agency's daily reports at 17:00 Israel (they land ~16:00–16:45); catch-ups at 18:30 and 21:00
//    only when a product's report for today is still missing ───
const onAirSync = (why) => require('./lib/onair/tvMail').sync()
  .then((r) => { require('./lib/onair/tv').clearLive(); console.log(`[CRON] On Air TV mail (${why}):`, JSON.stringify(r)); if (r?.ok) { require('./lib/onair/tvMail').backfillOnce(); require('./lib/onair/sheets').ingest().then((f) => { require('./lib/onair/tv').clearLive(); console.log('[CRON] On Air sheets:', JSON.stringify(f)); }).catch(e => console.error('[CRON] On Air sheets failed:', e.message)); } })
  .catch(err => console.error('[CRON] On Air TV mail failed:', err.message));
cron.schedule('0 17 * * *', () => onAirSync('17:00'), { timezone: 'Asia/Jerusalem' });
cron.schedule('30 18 * * *', async () => { if (!(await require('./lib/onair/tvMail').todaysReportsIn().catch(() => false))) onAirSync('18:30 catch-up'); }, { timezone: 'Asia/Jerusalem' });
cron.schedule('0 21 * * *', async () => { if (!(await require('./lib/onair/tvMail').todaysReportsIn().catch(() => false))) onAirSync('21:00 catch-up'); }, { timezone: 'Asia/Jerusalem' });
// ── On Air · Particle Brain (TV numbers): copy the last 10 days every hour at :25 (Brain itself syncs hourly), the last
//    45 days at 04:25, and the whole history (from Jan 2024) once — also a minute after start, so a deploy fills it ───
const brainSync = (opts, why) => require('./lib/onair/brain').sync(opts)
  .then((r) => { require('./lib/onair/tv').clearLive(); if (!r.ok) console.error(`[CRON] On Air Brain (${why}) failed:`, r.error); else return require('./lib/onair/brain').backfillOnce(); })
  .then((r) => { if (r) console.log('[CRON] On Air Brain backfill:', JSON.stringify(r)); })
  .catch(err => console.error(`[CRON] On Air Brain (${why}) failed:`, err.message));
cron.schedule('25 * * * *', () => brainSync({ days: 10 }, 'hourly'), { timezone: 'Asia/Jerusalem' });
cron.schedule('25 4 * * *', () => brainSync({ days: 45, why: 'nightly' }, 'nightly'), { timezone: 'Asia/Jerusalem' });
if (process.env.NODE_ENV === 'production') setTimeout(() => brainSync({ days: 10 }, 'start'), 60 * 1000).unref?.();

// ── Creative Weekly: Sunday auto-generate (opt-in), Frame.io keepalive, media cache prune ───
require('./lib/creative/jobs').schedule(cron);

// ── Finance: emails, sheet sync, reminders, accruals, rates, database backup ───
require('./lib/finance/jobs').schedule(cron);

// ── Contract PDF orphan check (every 10 minutes) ───
// Catches signed contracts where the frontend didn't upload the PDF (user closed tab too early)
const db = require('./db');
cron.schedule('*/10 * * * *', async () => {
  try {
    const { rows } = await db.query(
      `SELECT c.id, c.production_id, c.provider_name, c.provider_email,
              c.fee_amount, c.currency, c.exhibit_a, c.exhibit_b, c.events,
              p.project_name
       FROM contracts c
       LEFT JOIN productions p ON p.id = split_part(c.production_id, '_li_', 1)
       WHERE c.status = 'signed' AND c.drive_url IS NULL AND c.signed_at < NOW() - INTERVAL '5 minutes'`
    );
    if (rows.length === 0) return;
    console.log(`[CRON] Found ${rows.length} signed contract(s) missing PDF — generating fallback PDFs...`);
    for (const c of rows) {
      try {
        // Get signatures
        const { rows: sigs } = await db.query(
          `SELECT signer_role, signer_name, signer_id_number, signature_data, signed_at
           FROM contract_signatures WHERE contract_id = $1 ORDER BY signed_at ASC`, [c.id]
        );
        if (!sigs.length || !sigs.every(s => s.signed_at)) continue;

        // Generate minimal fallback PDF with pdf-lib
        const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
        const pdfDoc = await PDFDocument.create();
        const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
        const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
        const page = pdfDoc.addPage([612, 792]);
        let y = 740;
        const write = (text, size = 10, bold = false) => {
          if (y < 60) { const np = pdfDoc.addPage([612, 792]); y = 740; }
          page.drawText(text.substring(0, 90), { x: 50, y, size, font: bold ? boldFont : font, color: rgb(0.1, 0.1, 0.1) });
          y -= size + 6;
        };
        write('SIGNED CONTRACT', 16, true);
        write(`Production: ${c.project_name || c.production_id}`, 11);
        write(`Provider: ${c.provider_name}`, 11);
        write(`Amount: ${c.fee_amount ? Number(c.fee_amount).toLocaleString() + ' ' + (c.currency || 'USD') : 'N/A'}`, 11);
        y -= 10;
        for (const sig of sigs) {
          write(`${sig.signer_role === 'hocp' ? 'Company' : 'Provider'}: ${sig.signer_name} — Signed ${new Date(sig.signed_at).toLocaleDateString()}`, 10);
        }
        const pdfBytes = await pdfDoc.save();
        const pdfBase64 = Buffer.from(pdfBytes).toString('base64');

        // Upload to Drive
        if (driveRouter.uploadDual) {
          const prdShort = c.production_id ? c.production_id.split('_li_')[0] : c.production_id;
          const year = new Date().getFullYear();
          const result = await driveRouter.uploadDual({
            fileName: `Contract - ${c.provider_name || 'Signed'} (fallback).pdf`,
            fileContent: pdfBase64,
            mimeType: 'application/pdf',
            subfolder: `${year}/${prdShort} ${c.project_name || ''}`.trim(),
            category: 'contracts',
          });
          const url = result.drive?.viewLink;
          if (url) {
            await db.query('UPDATE contracts SET drive_url = $1 WHERE id = $2', [url, c.id]);
            console.log(`[CRON] Fallback PDF uploaded for ${c.provider_name}: ${url}`);
          }
        }
      } catch (err) {
        console.error(`[CRON] Fallback PDF failed for ${c.provider_name}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[CRON] Contract PDF orphan check failed:', err.message);
  }
});

// ── Global error handler ─────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  // Don't expose internal error details in production
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : (err.message || 'Internal server error') });
});

// ── Process-level error handlers ─────────────────────
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] Unhandled Promise Rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[FATAL] Uncaught Exception:', err);
});

module.exports = app;

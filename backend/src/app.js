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
app.use('/api/product-deliveries', require('./routes/productDeliveries'));
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

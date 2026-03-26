const router = require('express').Router();
const { google } = require('googleapis');
const db     = require('../db');
const { verifyJWT } = require('../middleware/auth');

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI  || 'https://particlepdio.particleface.com/api/auth/google/callback';
const DRIVE_FOLDER_ID      = process.env.DRIVE_FOLDER_ID;

function getOAuth2Client() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

// ── GET /api/drive/auth — redirect to Google consent screen ──────────────────
router.get('/auth', verifyJWT, (req, res) => {
  const oauth2 = getOAuth2Client();
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    prompt: 'consent',
    state: String(req.user.id),
  });
  res.json({ url });
});

// ── GET /api/drive/callback — handle OAuth callback ──────────────────────────
router.get('/callback', async (req, res) => {
  const { code } = req.query;
  try {
    const oauth2 = getOAuth2Client();
    const { tokens } = await oauth2.getToken(code);
    // Store tokens in settings table
    await db.query(
      `UPDATE settings SET google_tokens = $1 WHERE brand_id = 'particle'`,
      [JSON.stringify(tokens)]
    );
    // Redirect back to app
    res.redirect('/settings?google=connected');
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.redirect('/settings?google=error');
  }
});

// ── POST /api/drive/upload — upload a file to Google Drive ───────────────────
router.post('/upload', verifyJWT, async (req, res) => {
  const { fileName, fileContent, mimeType, subfolder } = req.body;

  try {
    // Get stored tokens
    const { rows } = await db.query("SELECT google_tokens FROM settings WHERE brand_id = 'particle'");
    if (!rows[0]?.google_tokens) {
      return res.status(401).json({ error: 'Google Drive not connected. Go to Settings to connect.' });
    }

    const tokens = typeof rows[0].google_tokens === 'string'
      ? JSON.parse(rows[0].google_tokens)
      : rows[0].google_tokens;
    const oauth2 = getOAuth2Client();
    oauth2.setCredentials(tokens);

    // Refresh token if expired
    if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
      const { credentials } = await oauth2.refreshAccessToken();
      oauth2.setCredentials(credentials);
      await db.query(
        "UPDATE settings SET google_tokens = $1 WHERE brand_id = 'particle'",
        [JSON.stringify(credentials)]
      );
    }

    const drive = google.drive({ version: 'v3', auth: oauth2 });

    // Create subfolder hierarchy if specified (e.g., "2026/PRD26-01 Production Name")
    let parentId = DRIVE_FOLDER_ID;
    if (subfolder) {
      const parts = subfolder.split('/');
      for (const part of parts) {
        // Check if subfolder already exists
        const existing = await drive.files.list({
          q: `'${parentId}' in parents AND name = '${part.replace(/'/g, "\\'")}' AND mimeType = 'application/vnd.google-apps.folder' AND trashed = false`,
          fields: 'files(id)',
        });
        if (existing.data.files.length > 0) {
          parentId = existing.data.files[0].id;
        } else {
          // Create subfolder
          const folder = await drive.files.create({
            resource: { name: part, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
            fields: 'id',
          });
          parentId = folder.data.id;
        }
      }
    }

    // Upload file
    const buffer = Buffer.from(fileContent, 'base64');
    const { Readable } = require('stream');
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const file = await drive.files.create({
      resource: { name: fileName, parents: [parentId] },
      media: { mimeType: mimeType || 'application/pdf', body: stream },
      fields: 'id, webViewLink, webContentLink',
    });

    // Make file accessible via link
    await drive.permissions.create({
      fileId: file.data.id,
      resource: { role: 'reader', type: 'anyone' },
    });

    res.json({
      fileId: file.data.id,
      viewLink: file.data.webViewLink,
      downloadLink: file.data.webContentLink,
    });
  } catch (err) {
    console.error('Drive upload error:', err);
    if (err.message?.includes('invalid_grant')) {
      return res.status(401).json({ error: 'Google Drive token expired. Reconnect in Settings.' });
    }
    res.status(500).json({ error: 'Upload failed' });
  }
});

// ── GET /api/drive/status — check if Google Drive is connected ───────────────
router.get('/status', verifyJWT, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT google_tokens FROM settings WHERE brand_id = 'particle'");
    res.json({ connected: !!rows[0]?.google_tokens });
  } catch (err) {
    res.json({ connected: false });
  }
});

module.exports = router;

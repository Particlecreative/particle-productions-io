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
    scope: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/gmail.send',
    ],
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

// ── POST /api/drive/upload-dual — upload to BOTH Google Drive AND Dropbox ────
router.post('/upload-dual', verifyJWT, async (req, res) => {
  const { fileName, fileContent, mimeType, subfolder, category } = req.body;
  // category: 'contracts' | 'invoices' | 'payment-proofs' | 'links' | 'cast-photos'

  const results = { drive: null, dropbox: null };

  // 1. Upload to Google Drive (reuse existing /upload logic)
  try {
    const { rows } = await db.query("SELECT google_tokens FROM settings WHERE brand_id = 'particle'");
    if (rows[0]?.google_tokens) {
      const tokens = typeof rows[0].google_tokens === 'string'
        ? JSON.parse(rows[0].google_tokens)
        : rows[0].google_tokens;
      const oauth2 = getOAuth2Client();
      oauth2.setCredentials(tokens);

      if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
        const { credentials } = await oauth2.refreshAccessToken();
        oauth2.setCredentials(credentials);
        await db.query(
          "UPDATE settings SET google_tokens = $1 WHERE brand_id = 'particle'",
          [JSON.stringify(credentials)]
        );
      }

      const drive = google.drive({ version: 'v3', auth: oauth2 });

      // Build subfolder hierarchy: category/subfolder
      const categoryFolders = {
        'contracts': 'Contracts',
        'invoices': 'Invoices',
        'payment-proofs': 'Payment Proofs',
        'links': 'Links',
        'cast-photos': 'Cast Photos',
      };
      const driveSubfolder = [categoryFolders[category] || category, subfolder].filter(Boolean).join('/');

      let parentId = DRIVE_FOLDER_ID;
      if (driveSubfolder) {
        const parts = driveSubfolder.split('/');
        for (const part of parts) {
          const existing = await drive.files.list({
            q: `'${parentId}' in parents AND name = '${part.replace(/'/g, "\\'")}' AND mimeType = 'application/vnd.google-apps.folder' AND trashed = false`,
            fields: 'files(id)',
          });
          if (existing.data.files.length > 0) {
            parentId = existing.data.files[0].id;
          } else {
            const folder = await drive.files.create({
              resource: { name: part, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
              fields: 'id',
            });
            parentId = folder.data.id;
          }
        }
      }

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

      await drive.permissions.create({
        fileId: file.data.id,
        resource: { role: 'reader', type: 'anyone' },
      });

      results.drive = {
        fileId: file.data.id,
        viewLink: file.data.webViewLink,
        downloadLink: file.data.webContentLink,
      };
    }
  } catch (err) {
    console.error('Drive upload (dual):', err.message);
  }

  // 2. Upload to Dropbox
  const DROPBOX_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
  if (DROPBOX_TOKEN) {
    try {
      const categoryPaths = {
        'contracts': 'Contracts',
        'invoices': 'Invoices',
        'payment-proofs': 'Payment Proofs',
        'links': 'Links',
        'cast-photos': 'Cast Photos',
      };
      const catFolder = categoryPaths[category] || category || 'Uploads';
      const dropboxPath = `/CP Panel/${catFolder}${subfolder ? '/' + subfolder : ''}/${fileName}`;
      const buffer = Buffer.from(fileContent, 'base64');
      const dropboxRes = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DROPBOX_TOKEN}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({
            path: dropboxPath,
            mode: 'add',
            autorename: true,
            mute: false,
          }),
        },
        body: buffer,
      });
      if (dropboxRes.ok) {
        const data = await dropboxRes.json();
        // Get shared link
        try {
          const linkRes = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${DROPBOX_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ path: data.path_display, settings: { requested_visibility: 'public' } }),
          });
          const linkData = await linkRes.json();
          results.dropbox = { path: data.path_display, link: linkData.url };
        } catch {
          results.dropbox = { path: data.path_display };
        }
      } else {
        console.error('Dropbox upload failed:', dropboxRes.status, await dropboxRes.text().catch(() => ''));
      }
    } catch (err) {
      console.error('Dropbox upload:', err.message);
    }
  }

  res.json(results);
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

// ── Exported helper: upload file to Drive + Dropbox (for internal use) ────────
async function uploadDual({ fileName, fileContent, mimeType, subfolder, category }) {
  const results = { drive: null, dropbox: null };

  // Drive
  try {
    const { rows } = await db.query("SELECT google_tokens FROM settings WHERE brand_id = 'particle'");
    if (rows[0]?.google_tokens) {
      const tokens = typeof rows[0].google_tokens === 'string' ? JSON.parse(rows[0].google_tokens) : rows[0].google_tokens;
      const oauth2 = getOAuth2Client();
      oauth2.setCredentials(tokens);
      if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
        const { credentials } = await oauth2.refreshAccessToken();
        oauth2.setCredentials(credentials);
        await db.query("UPDATE settings SET google_tokens = $1 WHERE brand_id = 'particle'", [JSON.stringify(credentials)]);
      }
      const drive = google.drive({ version: 'v3', auth: oauth2 });
      const catFolders = { contracts: 'Contracts', invoices: 'Invoices', 'payment-proofs': 'Payment Proofs' };
      const driveSub = [catFolders[category] || category, subfolder].filter(Boolean).join('/');
      let parentId = DRIVE_FOLDER_ID;
      if (driveSub) {
        for (const part of driveSub.split('/')) {
          const existing = await drive.files.list({ q: `'${parentId}' in parents AND name = '${part.replace(/'/g, "\\'")}' AND mimeType = 'application/vnd.google-apps.folder' AND trashed = false`, fields: 'files(id)' });
          if (existing.data.files.length > 0) { parentId = existing.data.files[0].id; }
          else { const f = await drive.files.create({ resource: { name: part, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id' }); parentId = f.data.id; }
        }
      }
      const buffer = Buffer.from(fileContent, 'base64');
      const { Readable } = require('stream');
      const stream = new Readable(); stream.push(buffer); stream.push(null);
      const file = await drive.files.create({ resource: { name: fileName, parents: [parentId] }, media: { mimeType: mimeType || 'application/pdf', body: stream }, fields: 'id, webViewLink' });
      await drive.permissions.create({ fileId: file.data.id, resource: { role: 'reader', type: 'anyone' } });
      results.drive = { fileId: file.data.id, viewLink: file.data.webViewLink };
    }
  } catch (e) { console.error('uploadDual Drive:', e.message); }

  // Dropbox
  const DROPBOX_TOKEN = process.env.DROPBOX_ACCESS_TOKEN;
  if (DROPBOX_TOKEN) {
    try {
      const catPaths = { contracts: 'Contracts', invoices: 'Invoices', 'payment-proofs': 'Payment Proofs' };
      const catFolder = catPaths[category] || category || 'Uploads';
      const dropboxPath = `/CP Panel/${catFolder}${subfolder ? '/' + subfolder : ''}/${fileName}`;
      const buffer = Buffer.from(fileContent, 'base64');
      const dropboxRes = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${DROPBOX_TOKEN}`, 'Content-Type': 'application/octet-stream', 'Dropbox-API-Arg': JSON.stringify({ path: dropboxPath, mode: 'add', autorename: true }) },
        body: buffer,
      });
      if (dropboxRes.ok) {
        const data = await dropboxRes.json();
        try {
          const linkRes = await fetch('https://api.dropboxapi.com/2/sharing/create_shared_link_with_settings', { method: 'POST', headers: { Authorization: `Bearer ${DROPBOX_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ path: data.path_display, settings: { requested_visibility: 'public' } }) });
          const linkData = await linkRes.json();
          results.dropbox = { path: data.path_display, link: linkData.url };
        } catch { results.dropbox = { path: data.path_display }; }
      }
    } catch (e) { console.error('uploadDual Dropbox:', e.message); }
  }

  return results;
}

router.uploadDual = uploadDual;
module.exports = router;

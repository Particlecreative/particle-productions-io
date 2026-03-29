const router = require('express').Router();
const { google } = require('googleapis');
const db     = require('../db');
const { verifyJWT } = require('../middleware/auth');

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI  || 'https://particlepdio.particleface.com/api/auth/google/callback';
const DRIVE_FOLDER_ID      = process.env.DRIVE_FOLDER_ID;

// Dropbox OAuth
const DROPBOX_APP_KEY      = process.env.DROPBOX_APP_KEY;
const DROPBOX_APP_SECRET   = process.env.DROPBOX_APP_SECRET;
const DROPBOX_REDIRECT_URI = process.env.DROPBOX_REDIRECT_URI || 'https://particlepdio.particleface.com/api/drive/dropbox-callback';

// Helper: get a valid Dropbox access token (auto-refresh if needed)
async function getDropboxToken() {
  const { rows } = await db.query("SELECT dropbox_tokens FROM settings WHERE brand_id = 'particle'");
  const tokens = rows[0]?.dropbox_tokens;
  if (!tokens) {
    // Fall back to env var (short-lived)
    return process.env.DROPBOX_ACCESS_TOKEN || null;
  }
  const parsed = typeof tokens === 'string' ? JSON.parse(tokens) : tokens;
  // Check if expired (expires_at is unix ms)
  if (parsed.expires_at && parsed.expires_at < Date.now() && parsed.refresh_token) {
    // Refresh
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: parsed.refresh_token,
    });
    const res = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${DROPBOX_APP_KEY}:${DROPBOX_APP_SECRET}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    if (res.ok) {
      const data = await res.json();
      const updated = {
        access_token: data.access_token,
        refresh_token: parsed.refresh_token, // refresh token doesn't change
        expires_at: Date.now() + (data.expires_in * 1000),
      };
      await db.query("UPDATE settings SET dropbox_tokens = $1 WHERE brand_id = 'particle'", [JSON.stringify(updated)]);
      return updated.access_token;
    }
    console.error('Dropbox refresh failed:', res.status);
    return null;
  }
  return parsed.access_token;
}

function getOAuth2Client() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

// ── GET /api/drive/auth — redirect to Google consent screen ──────────────────
router.get('/auth', verifyJWT, (req, res) => {
  const oauth2 = getOAuth2Client();
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/drive',
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
          supportsAllDrives: true, includeItemsFromAllDrives: true,
        });
        if (existing.data.files.length > 0) {
          parentId = existing.data.files[0].id;
        } else {
          // Create subfolder
          const folder = await drive.files.create({
            resource: { name: part, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
            fields: 'id',
            supportsAllDrives: true,
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
      supportsAllDrives: true,
    });

    // Make file accessible via link
    await drive.permissions.create({
      fileId: file.data.id,
      resource: { role: 'reader', type: 'anyone' },
      supportsAllDrives: true,
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
            supportsAllDrives: true, includeItemsFromAllDrives: true,
          });
          if (existing.data.files.length > 0) {
            parentId = existing.data.files[0].id;
          } else {
            const folder = await drive.files.create({
              resource: { name: part, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
              fields: 'id',
              supportsAllDrives: true,
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
        supportsAllDrives: true,
      });

      await drive.permissions.create({
        fileId: file.data.id,
        resource: { role: 'reader', type: 'anyone' },
        supportsAllDrives: true,
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

  // Dropbox disabled — handled by nightly backup instead
  // results.dropbox = null;

  res.json(results);
});

// ── GET /api/drive/dropbox-auth — redirect to Dropbox OAuth ─────────────────
router.get('/dropbox-auth', verifyJWT, (req, res) => {
  if (!DROPBOX_APP_KEY) return res.status(500).json({ error: 'DROPBOX_APP_KEY not configured' });
  const url = `https://www.dropbox.com/oauth2/authorize?client_id=${DROPBOX_APP_KEY}&redirect_uri=${encodeURIComponent(DROPBOX_REDIRECT_URI)}&response_type=code&token_access_type=offline`;
  res.json({ url });
});

// ── GET /api/drive/dropbox-callback — handle Dropbox OAuth callback ─────────
router.get('/dropbox-callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect('/settings?dropbox=error');
  try {
    const body = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      redirect_uri: DROPBOX_REDIRECT_URI,
    });
    const tokenRes = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${DROPBOX_APP_KEY}:${DROPBOX_APP_SECRET}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });
    const data = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error('Dropbox OAuth error:', data);
      return res.redirect('/settings?dropbox=error');
    }
    const tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in * 1000),
    };
    await db.query("UPDATE settings SET dropbox_tokens = $1 WHERE brand_id = 'particle'", [JSON.stringify(tokens)]);
    res.redirect('/settings?dropbox=connected');
  } catch (err) {
    console.error('Dropbox OAuth error:', err);
    res.redirect('/settings?dropbox=error');
  }
});

// ── GET /api/drive/status — check if Google Drive is connected ───────────────
router.get('/status', verifyJWT, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT google_tokens, dropbox_tokens FROM settings WHERE brand_id = 'particle'");
    res.json({
      connected: !!rows[0]?.google_tokens,
      dropbox: !!rows[0]?.dropbox_tokens,
    });
  } catch (err) {
    res.json({ connected: false, dropbox: false });
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
          const existing = await drive.files.list({ q: `'${parentId}' in parents AND name = '${part.replace(/'/g, "\\'")}' AND mimeType = 'application/vnd.google-apps.folder' AND trashed = false`, fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true });
          if (existing.data.files.length > 0) { parentId = existing.data.files[0].id; }
          else { const f = await drive.files.create({ resource: { name: part, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] }, fields: 'id', supportsAllDrives: true }); parentId = f.data.id; }
        }
      }
      // Clean base64 before decoding — remove any whitespace/newlines/data URL prefix
      let cleanBase64 = fileContent;
      const ci = cleanBase64.indexOf(',');
      if (ci > 0 && ci < 100) cleanBase64 = cleanBase64.substring(ci + 1);
      cleanBase64 = cleanBase64.replace(/[\s\r\n]/g, '');
      const buffer = Buffer.from(cleanBase64, 'base64');
      console.log(`[uploadDual] ${fileName}: base64 ${cleanBase64.length} chars → ${buffer.length} bytes`);
      if (buffer.length < 100) { console.error(`[uploadDual] WARNING: buffer too small (${buffer.length}b), skipping`); throw new Error('Buffer too small'); }
      const { Readable } = require('stream');
      const stream = new Readable(); stream.push(buffer); stream.push(null);
      const file = await drive.files.create({ resource: { name: fileName, parents: [parentId] }, media: { mimeType: mimeType || 'application/pdf', body: stream }, fields: 'id, webViewLink', supportsAllDrives: true });
      await drive.permissions.create({ fileId: file.data.id, resource: { role: 'reader', type: 'anyone' }, supportsAllDrives: true });
      results.drive = { fileId: file.data.id, viewLink: file.data.webViewLink };
    }
  } catch (e) { console.error('uploadDual Drive:', e.message); }

  // Dropbox disabled — now handled by nightly backup instead
  // results.dropbox = null;

  return results;
}

router.uploadDual = uploadDual;

// Trash a Drive file by fileId
async function trashDriveFile(fileId) {
  const { rows } = await db.query("SELECT google_tokens FROM settings WHERE brand_id = 'particle'");
  if (!rows[0]?.google_tokens) return;
  const tokens = typeof rows[0].google_tokens === 'string' ? JSON.parse(rows[0].google_tokens) : rows[0].google_tokens;
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials(tokens);
  const drive = google.drive({ version: 'v3', auth: oauth2 });
  await drive.files.update({ fileId, resource: { trashed: true }, supportsAllDrives: true });
}
router.trashDriveFile = trashDriveFile;

// ── POST /api/drive/backup-to-dropbox — copy all Drive files to Dropbox ──────
router.post('/backup-to-dropbox', verifyJWT, async (req, res) => {
  try {
    const result = await runDropboxBackup();
    res.json(result);
  } catch (err) {
    console.error('Backup error:', err);
    res.status(500).json({ error: 'Backup failed: ' + err.message });
  }
});

// ── GET /api/drive/backup-status — get last backup info ──────────────────────
router.get('/backup-status', verifyJWT, async (req, res) => {
  try {
    const { rows } = await db.query("SELECT dropbox_backup_at, dropbox_backup_stats FROM settings WHERE brand_id = 'particle'");
    res.json({
      lastRun: rows[0]?.dropbox_backup_at || null,
      stats: rows[0]?.dropbox_backup_stats || null,
    });
  } catch {
    res.json({ lastRun: null, stats: null });
  }
});

/**
 * Backup: list all files in Google Drive CP Panel folder,
 * download each, upload to Dropbox /CP Panel Backup/
 */
async function runDropboxBackup() {
  const start = Date.now();
  let synced = 0, skipped = 0, errors = 0;

  // Get Google Drive auth
  const { rows } = await db.query("SELECT google_tokens FROM settings WHERE brand_id = 'particle'");
  if (!rows[0]?.google_tokens) throw new Error('Google Drive not connected');
  const tokens = typeof rows[0].google_tokens === 'string' ? JSON.parse(rows[0].google_tokens) : rows[0].google_tokens;
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials(tokens);
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    const { credentials } = await oauth2.refreshAccessToken();
    oauth2.setCredentials(credentials);
    await db.query("UPDATE settings SET google_tokens = $1 WHERE brand_id = 'particle'", [JSON.stringify(credentials)]);
  }
  const drive = google.drive({ version: 'v3', auth: oauth2 });

  // Get Dropbox token
  const dbxToken = await getDropboxToken();
  if (!dbxToken) throw new Error('Dropbox not connected');

  // Recursively list all files in Drive folder
  async function listAllFiles(folderId, path = '') {
    const files = [];
    let pageToken = null;
    do {
      const resp = await drive.files.list({
        q: `'${folderId}' in parents AND trashed = false`,
        fields: 'nextPageToken, files(id, name, mimeType, size)',
        pageSize: 100,
        pageToken,
        supportsAllDrives: true, includeItemsFromAllDrives: true,
      });
      for (const f of resp.data.files) {
        if (f.mimeType === 'application/vnd.google-apps.folder') {
          const subFiles = await listAllFiles(f.id, `${path}/${f.name}`);
          files.push(...subFiles);
        } else {
          files.push({ id: f.id, name: f.name, path: `${path}/${f.name}`, mimeType: f.mimeType, size: f.size });
        }
      }
      pageToken = resp.data.nextPageToken;
    } while (pageToken);
    return files;
  }

  console.log('Starting Dropbox backup...');
  const allFiles = await listAllFiles(DRIVE_FOLDER_ID);
  console.log(`Found ${allFiles.length} files in Drive`);

  // Check what already exists in Dropbox (path → size map for incremental sync)
  const existingFiles = new Map(); // path_lower → { size }
  try {
    const listRes = await fetch('https://api.dropboxapi.com/2/files/list_folder', {
      method: 'POST',
      headers: { Authorization: `Bearer ${dbxToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: '/CP Panel Backup', recursive: true, limit: 2000 }),
    });
    if (listRes.ok) {
      const listData = await listRes.json();
      for (const entry of listData.entries) {
        if (entry['.tag'] === 'file') existingFiles.set(entry.path_lower, { size: entry.size });
      }
      let hasMore = listData.has_more;
      let cursor = listData.cursor;
      while (hasMore) {
        const contRes = await fetch('https://api.dropboxapi.com/2/files/list_folder/continue', {
          method: 'POST',
          headers: { Authorization: `Bearer ${dbxToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ cursor }),
        });
        if (contRes.ok) {
          const contData = await contRes.json();
          for (const entry of contData.entries) {
            if (entry['.tag'] === 'file') existingFiles.set(entry.path_lower, { size: entry.size });
          }
          hasMore = contData.has_more;
          cursor = contData.cursor;
        } else break;
      }
    }
  } catch (e) {
    console.log('Dropbox backup folder not found, will create it');
  }

  console.log(`Dropbox has ${existingFiles.size} existing files`);

  // Incremental sync: skip if same path AND same size, otherwise overwrite
  for (const file of allFiles) {
    const dropboxPath = `/CP Panel Backup${file.path}`;
    const existing = existingFiles.get(dropboxPath.toLowerCase());
    if (existing && file.size && existing.size === parseInt(file.size)) {
      skipped++;
      continue; // Same file, same size — skip
    }
    // If file exists but size differs → overwrite. If new file → upload.

    try {
      // Download from Drive
      const downloadRes = await drive.files.get({ fileId: file.id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
      const buffer = Buffer.from(downloadRes.data);

      // Upload to Dropbox
      const uploadRes = await fetch('https://content.dropboxapi.com/2/files/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${dbxToken}`,
          'Content-Type': 'application/octet-stream',
          'Dropbox-API-Arg': JSON.stringify({ path: dropboxPath, mode: { '.tag': 'overwrite' }, autorename: false, mute: true }),
        },
        body: buffer,
      });
      if (uploadRes.ok) {
        synced++;
        console.log(`Backed up: ${file.path}`);
      } else {
        errors++;
        console.error(`Backup failed for ${file.path}:`, uploadRes.status);
      }
    } catch (e) {
      errors++;
      console.error(`Backup error for ${file.path}:`, e.message);
    }
  }

  const duration = Math.round((Date.now() - start) / 1000);
  const stats = { synced, skipped, errors, totalFiles: allFiles.length, duration };
  console.log(`Backup complete: ${synced} synced, ${skipped} skipped, ${errors} errors (${duration}s)`);

  // Save backup status
  await db.query(
    "UPDATE settings SET dropbox_backup_at = NOW(), dropbox_backup_stats = $1 WHERE brand_id = 'particle'",
    [JSON.stringify(stats)]
  );

  return stats;
}

router.runDropboxBackup = runDropboxBackup;

module.exports = router;

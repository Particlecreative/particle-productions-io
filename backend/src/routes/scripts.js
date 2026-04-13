const router  = require('express').Router();
const db      = require('../db');
const crypto  = require('crypto');
const { google } = require('googleapis');
const mammoth = require('mammoth');
const { verifyJWT } = require('../middleware/auth');

const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;
const { execFile } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

// ── Helpers ──────────────────────────────────────────────────────────────────

async function getGoogleDrive() {
  const { rows } = await db.query("SELECT google_tokens FROM settings WHERE brand_id = 'particle'");
  if (!rows[0]?.google_tokens) throw new Error('Google Drive not connected. Go to Settings to connect.');
  const tokens = typeof rows[0].google_tokens === 'string'
    ? JSON.parse(rows[0].google_tokens)
    : rows[0].google_tokens;
  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'https://particlepdio.particleface.com/api/auth/google/callback'
  );
  oauth2.setCredentials(tokens);
  if (tokens.expiry_date && tokens.expiry_date < Date.now()) {
    const { credentials } = await oauth2.refreshAccessToken();
    oauth2.setCredentials(credentials);
    await db.query("UPDATE settings SET google_tokens = $1 WHERE brand_id = 'particle'", [JSON.stringify(credentials)]);
  }
  return { drive: google.drive({ version: 'v3', auth: oauth2 }), oauth2 };
}

async function driveUploadBuffer({ drive, fileName, buffer, mimeType, subfolder }) {
  let parentId = DRIVE_FOLDER_ID;
  if (subfolder) {
    for (const part of subfolder.split('/')) {
      const existing = await drive.files.list({
        q: `'${parentId}' in parents AND name = '${part.replace(/'/g, "\\'")}' AND mimeType = 'application/vnd.google-apps.folder' AND trashed = false`,
        fields: 'files(id)', supportsAllDrives: true, includeItemsFromAllDrives: true,
      });
      if (existing.data.files.length > 0) {
        parentId = existing.data.files[0].id;
      } else {
        const folder = await drive.files.create({
          resource: { name: part, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
          fields: 'id', supportsAllDrives: true,
        });
        parentId = folder.data.id;
      }
    }
  }
  const { Readable } = require('stream');
  const stream = new Readable();
  stream.push(buffer);
  stream.push(null);
  const file = await drive.files.create({
    resource: { name: fileName, parents: [parentId] },
    media: { mimeType, body: stream },
    fields: 'id, webViewLink',
    supportsAllDrives: true,
  });
  await drive.permissions.create({
    fileId: file.data.id,
    resource: { role: 'reader', type: 'anyone' },
    supportsAllDrives: true,
  });
  // Return a direct-access thumbnail URL that works without authentication
  // webViewLink requires login; thumbnail URL serves public files directly
  return `https://drive.google.com/thumbnail?id=${file.data.id}&sz=w2000`;
}

async function callClaude(prompt, systemPrompt, images = []) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured in .env');
  const content = [];
  for (const { base64, mimeType } of images) {
    content.push({ type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } });
  }
  content.push({ type: 'text', text: prompt });
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error(`Claude API error: ${err.error?.message || resp.statusText}`);
  }
  const data = await resp.json();
  return data.content[0].text;
}

// Gemini 2.5 Flash — text/file import
async function callGemini(prompt, fileBase64, mimeType) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured in .env');
  const parts = [{ text: prompt }];
  if (fileBase64) parts.push({ inline_data: { mime_type: mimeType, data: fileBase64 } });
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
    }
  );
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API error: ${resp.statusText} — ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  return data.candidates[0].content.parts[0].text;
}

// Gemini 3.1 Flash Image (Nano Banana 2) — storyboard image generation
// referenceImages: optional array of { base64, mimeType } — sent to Gemini as visual guidance
// Google OAuth client for Drive file access
function getOAuth2Client() {
  return new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET, process.env.GOOGLE_REDIRECT_URI);
}

// Upload video to Gemini File API (for video analysis)
async function uploadToGeminiFileAPI(buffer, mimeType, displayName) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY not configured');
  // Resumable upload
  const initRes = await fetch(`https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': buffer.length.toString(),
      'X-Goog-Upload-Header-Content-Type': mimeType,
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  const uploadUrl = initRes.headers.get('x-goog-upload-url');
  if (!uploadUrl) throw new Error('Failed to initiate Gemini upload');
  // Upload the data
  const uploadRes = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Length': buffer.length.toString(),
      'X-Goog-Upload-Offset': '0',
      'X-Goog-Upload-Command': 'upload, finalize',
    },
    body: buffer,
  });
  const uploadData = await uploadRes.json();
  const fileUri = uploadData.file?.uri;
  const fileName = uploadData.file?.name;
  if (!fileUri) throw new Error('Gemini upload failed: no file URI returned');
  // Poll until ACTIVE
  for (let i = 0; i < 30; i++) {
    const checkRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${apiKey}`);
    const checkData = await checkRes.json();
    if (checkData.state === 'ACTIVE') return { fileUri, fileName: checkData.name };
    if (checkData.state === 'FAILED') throw new Error('Gemini file processing failed');
    await new Promise(r => setTimeout(r, 2000)); // wait 2s
  }
  throw new Error('Gemini file processing timed out');
}

// Call Gemini with a file reference (video/large files)
async function callGeminiWithFile(prompt, fileUri, mimeType) {
  const apiKey = process.env.GEMINI_API_KEY;
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [
          { file_data: { file_uri: fileUri, mime_type: mimeType } },
          { text: prompt },
        ]}],
      }),
    }
  );
  if (!resp.ok) throw new Error(`Gemini API error: ${resp.statusText}`);
  const data = await resp.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// Extract a single frame from video at timestamp using ffmpeg
function extractFrameAtTimestamp(videoPath, timestampSec) {
  return new Promise((resolve, reject) => {
    const args = ['-ss', String(timestampSec), '-i', videoPath, '-frames:v', '1', '-q:v', '2', '-f', 'image2', 'pipe:1'];
    const proc = execFile('ffmpeg', args, { maxBuffer: 10 * 1024 * 1024, encoding: 'buffer' }, (err, stdout) => {
      if (err) return reject(err);
      resolve(stdout);
    });
  });
}

// Download YouTube video via yt-dlp
function downloadYouTubeVideo(url) {
  return new Promise((resolve, reject) => {
    const outPath = path.join(os.tmpdir(), `yt-${Date.now()}.mp4`);
    execFile('yt-dlp', ['-f', 'mp4', '-o', outPath, '--no-playlist', url], { timeout: 120000 }, (err) => {
      if (err) return reject(err);
      resolve(outPath);
    });
  });
}

async function generateGeminiImage(prompt, referenceImages = []) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured in .env');
  const parts = [];
  // Reference images first so Gemini uses them as visual context
  for (const ref of referenceImages) {
    parts.push({ inline_data: { mime_type: ref.mimeType || 'image/jpeg', data: ref.base64 } });
  }
  parts.push({ text: `IMPORTANT: Generate as a 16:9 widescreen landscape format image (cinematic wide aspect ratio). ${prompt}` });
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      }),
    }
  );
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini Image API error: ${resp.statusText} — ${errText.slice(0, 200)}`);
  }
  const data = await resp.json();
  const imagePart = data.candidates[0].content.parts.find(p => p.inlineData);
  if (!imagePart) throw new Error('Gemini did not return an image');
  return {
    base64: imagePart.inlineData.data,
    mimeType: imagePart.inlineData.mimeType || 'image/jpeg',
  };
}

const SCENE_SYSTEM_PROMPT = `You are a professional script writer and storyboard creator.
Return ONLY valid JSON with NO markdown, NO code blocks, NO explanation:
{
  "scenes": [
    {
      "id": "<uuid-v4>",
      "order": 0,
      "location": "INT. STUDIO - DAY",
      "what_we_see": "Visual direction here",
      "what_we_hear": "Dialogue or voiceover here",
      "duration": "5s",
      "collapsed": false,
      "images": []
    }
  ]
}
Generate unique UUIDs for each scene id. Each scene must have all listed fields.`;

function ensureScenes(scenes) {
  return (scenes || []).map((s, i) => ({
    id: s.id || crypto.randomUUID(),
    order: i,
    location: s.location || '',
    what_we_see: s.what_we_see || s.whatWeSee || '',
    what_we_hear: s.what_we_hear || s.whatWeHear || '',
    duration: s.duration || '',
    collapsed: false,
    images: s.images || [],
  }));
}

function parseSceneJson(text) {
  const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed.scenes)) throw new Error('Invalid scene format from AI');
  return ensureScenes(parsed.scenes);
}

const APP_URL = process.env.APP_URL || 'https://particlepdio.particleface.com';

function scriptUrl(script) {
  if (script.production_id)
    return `${APP_URL}/production/${script.production_id}?tab=Scripts&script_id=${script.id}`;
  return `${APP_URL}/scripts?script_id=${script.id}`;
}

async function sendSlackNotification(payload) {
  const webhookUrl = process.env.SLACK_SCRIPTS_WEBHOOK_URL;
  if (!webhookUrl) return;
  // Accept plain string (legacy) or full block kit payload
  const body = typeof payload === 'string' ? { text: payload } : payload;
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }).catch(err => console.error('Slack notification failed:', err.message));
}

function slackScriptPayload({ emoji, headline, script, fields = [], footer = '' }) {
  const url = scriptUrl(script);
  const prod = script.project_name || script.production_id || null;
  const sceneCount = Array.isArray(script.scenes) ? script.scenes.length : (script.scene_count ?? 0);
  const statusEmoji = { draft: '📄', review: '👀', approved: '✅', archived: '🗄️' }[script.status] || '📄';

  const contextParts = [
    prod ? `*Production:* ${prod}` : null,
    `*Status:* ${statusEmoji} ${script.status}`,
    `*Scenes:* ${sceneCount}`,
    ...fields,
  ].filter(Boolean);

  return {
    text: `${emoji} ${headline}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${emoji} *${headline}*`,
        },
        accessory: {
          type: 'button',
          text: { type: 'plain_text', text: 'Open Script →', emoji: true },
          url,
          action_id: 'open_script',
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `*Script:* <${url}|${script.title}>` },
          ...contextParts.map(t => ({ type: 'mrkdwn', text: t })),
          ...(footer ? [{ type: 'mrkdwn', text: footer }] : []),
        ],
      },
    ],
  };
}

// ── PUBLIC: share endpoint (no auth) ─────────────────────────────────────────
router.get('/share/:token', async (req, res) => {
  try {
    const { rows } = await db.query(
      `SELECT s.*, p.project_name, p.stage, b.name AS brand_name
       FROM scripts s
       LEFT JOIN productions p ON s.production_id = p.id
       LEFT JOIN brands b ON s.brand_id = b.id
       WHERE s.share_token = $1`,
      [req.params.token]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Script not found or link expired' });
    // Check expiry (if set)
    if (rows[0].share_expires_at && new Date(rows[0].share_expires_at) < new Date()) {
      return res.status(410).json({ error: 'This share link has expired. Ask the script owner for a new link.' });
    }
    // Fetch brand settings for theming
    const { rows: settingsRows } = await db.query('SELECT brand_colors FROM settings WHERE brand_id = $1', [rows[0].brand_id]).catch(() => ({ rows: [] }));
    rows[0].brand_colors = settingsRows[0]?.brand_colors || null;
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /scripts/share/:token error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUBLIC: get comments via share token (comment/edit mode) ─────────────────
router.get('/share/:token/comments', async (req, res) => {
  try {
    const { rows: s } = await db.query(
      `SELECT id, share_mode FROM scripts WHERE share_token = $1`,
      [req.params.token]
    );
    if (!s[0]) return res.status(404).json({ error: 'Not found' });
    if (!['comment', 'edit'].includes(s[0].share_mode)) return res.status(403).json({ error: 'Comments not enabled on this link' });
    const { rows } = await db.query(
      `SELECT * FROM script_comments WHERE script_id = $1 ORDER BY created_at ASC`,
      [s[0].id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /scripts/share/:token/comments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUBLIC: post comment via share token (comment/edit mode) ──────────────────
router.post('/share/:token/comments', async (req, res) => {
  try {
    const { scene_id, cell, selected_text, text, author_name, parent_comment_id } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'text is required' });
    const { rows: s } = await db.query(
      `SELECT s.id, s.title, s.scenes, s.production_id, p.project_name, s.share_mode
       FROM scripts s LEFT JOIN productions p ON s.production_id = p.id
       WHERE s.share_token = $1`,
      [req.params.token]
    );
    if (!s[0]) return res.status(404).json({ error: 'Not found' });
    if (!['comment', 'edit'].includes(s[0].share_mode)) return res.status(403).json({ error: 'Comments not allowed on this link' });
    const authorName = author_name?.trim() || 'Anonymous';
    const { rows } = await db.query(
      `INSERT INTO script_comments (id, script_id, scene_id, cell, selected_text, text, author_name, parent_comment_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [crypto.randomUUID(), s[0].id, scene_id || null, cell || null, selected_text || null, text.trim(), authorName, parent_comment_id || null]
    );
    // Slack notification
    const sceneRow = scene_id ? (s[0].scenes || []).find(sc => sc.id === scene_id) : null;
    const location = sceneRow?.location || '';
    const cellLabel = { what_we_see: 'What We See', what_we_hear: 'What We Hear', location: 'Location' }[cell] || cell || '';
    sendSlackNotification(slackScriptPayload({
      emoji: '💬', headline: `New comment by ${authorName} (via share link)`,
      script: s[0],
      fields: [
        location ? `*Scene:* ${location}` : null,
        cellLabel ? `*In:* ${cellLabel}` : null,
        `*Comment:* "${text.substring(0, 120)}${text.length > 120 ? '...' : ''}"`,
      ].filter(Boolean),
    }));
    res.json(rows[0]);
  } catch (err) {
    console.error('POST /scripts/share/:token/comments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUBLIC: resolve/unresolve comment via share token ────────────────────────
router.patch('/share/:token/comments/:cId', async (req, res) => {
  try {
    const { status, resolved_by_name } = req.body;
    const { rows: s } = await db.query(
      `SELECT id, share_mode FROM scripts WHERE share_token = $1`, [req.params.token]
    );
    if (!s[0]) return res.status(404).json({ error: 'Not found' });
    if (!['comment', 'edit'].includes(s[0].share_mode)) return res.status(403).json({ error: 'Not allowed' });
    const { rows } = await db.query(
      `UPDATE script_comments SET status = $1, resolved_at = CASE WHEN $1 != 'open' THEN NOW() ELSE NULL END, resolved_by_name = CASE WHEN $1 != 'open' THEN $2 ELSE NULL END WHERE id = $3 AND script_id = $4 RETURNING *`,
      [status || 'open', resolved_by_name || 'Anonymous', req.params.cId, s[0].id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Comment not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /scripts/share/:token/comments/:cId error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUBLIC: update script via share token (edit mode) ────────────────────────
router.put('/share/:token', async (req, res) => {
  try {
    const { scenes, title, voice_settings } = req.body;
    const sets = ['scenes = $1', 'title = COALESCE($2, title)', 'updated_at = NOW()'];
    const vals = [JSON.stringify(scenes || []), title];
    if (voice_settings !== undefined) {
      vals.push(JSON.stringify(voice_settings));
      sets.push(`voice_settings = $${vals.length}`);
    }
    vals.push(req.params.token);
    const { rows } = await db.query(
      `UPDATE scripts SET ${sets.join(', ')} WHERE share_token = $${vals.length} AND share_mode = 'edit' RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'Script not found or not in edit mode' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /scripts/share/:token error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── PUBLIC TTS for shared scripts (no auth, validates share token) ────────────
router.post('/share/:token/tts', async (req, res) => {
  try {
    const { scene_id, voice_id, speed, stability } = req.body;
    const { rows } = await db.query('SELECT id, scenes, share_token, share_mode FROM scripts WHERE share_token = $1', [req.params.token]);
    if (!rows[0]) return res.status(404).json({ error: 'Script not found' });
    const scene = (rows[0].scenes || []).find(s => s.id === scene_id);
    if (!scene) return res.status(404).json({ error: 'Scene not found' });
    const rawText = scene.what_we_hear || '';
    if (!rawText.trim()) return res.status(400).json({ error: 'No VO text' });
    const audioBase64 = await elevenLabsTTS(rawText, voice_id || undefined, { speed: speed || 1.0, stability: stability || 0.5 });
    res.json({ audio_base64: audioBase64, mime_type: 'audio/mpeg' });
  } catch (err) {
    console.error('POST /scripts/share/:token/tts error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/share/:token/tts-full', async (req, res) => {
  try {
    const { voice_id, speed, stability } = req.body || {};
    const { rows } = await db.query('SELECT id, scenes, title, share_token FROM scripts WHERE share_token = $1', [req.params.token]);
    if (!rows[0]) return res.status(404).json({ error: 'Script not found' });
    const scenes = rows[0].scenes || [];
    const parts = scenes.map(s => {
      return (s.what_we_hear || '')
        .replace(/<span[^>]*(?:data-muted|class="vo-muted")[^>]*>[\s\S]*?<\/span>/gi, '')
        .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
        .replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ')
        .replace(/\s+/g, ' ').trim();
    }).filter(Boolean);
    if (parts.length === 0) return res.status(400).json({ error: 'No VO text' });
    const fullText = parts.join('\n\n').substring(0, 5000);
    const audioBase64 = await elevenLabsTTS(fullText, voice_id || undefined, { speed: speed || 1.0, stability: stability || 0.5 });
    const buf = Buffer.from(audioBase64, 'base64');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.send(buf);
  } catch (err) {
    console.error('POST /scripts/share/:token/tts-full error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUBLIC: list voices for share page (validates share token) ────────────────
router.get('/share/:token/voices', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id FROM scripts WHERE share_token = $1 AND share_mode = \'edit\'', [req.params.token]);
    if (!rows[0]) return res.status(404).json({ error: 'Script not found or not in edit mode' });
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'ElevenLabs not configured' });
    const elRes = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': apiKey } });
    const data = await elRes.json();
    res.json({ voices: (data.voices || []).map(v => ({ voice_id: v.voice_id, name: v.name, gender: v.labels?.gender, accent: v.labels?.accent, category: v.category })) });
  } catch (err) {
    console.error('GET /scripts/share/:token/voices error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PROTECTED routes below ────────────────────────────────────────────────────
router.use(verifyJWT);

// POST /api/scripts/temp/ai-generate — AI generate before script is created (modal)
router.post('/temp/ai-generate', async (req, res) => {
  try {
    const { prompt, product, reference_url } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    // Build enriched prompt with product context + reference material
    let enrichedPrompt = prompt;

    if (product?.trim()) {
      enrichedPrompt = `PRODUCT: ${product.trim()}\n\n${enrichedPrompt}`;
    }

    // Fetch reference URL content (SSRF-guarded, 8s timeout)
    if (reference_url?.trim()) {
      try {
        const parsedUrl = new URL(reference_url.trim());
        const isInternal = /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|::1$|::ffff:127\.|fd|fc)/.test(parsedUrl.hostname);
        if (!isInternal) {
          let refContent = '';
          // Google Docs/Slides — export as plain text via Drive API
          if (parsedUrl.hostname === 'docs.google.com') {
            const docIdMatch = parsedUrl.pathname.match(/\/d\/([a-zA-Z0-9_-]+)/);
            if (docIdMatch) {
              try {
                const { drive } = await getGoogleDrive();
                const htmlRes = await drive.files.export(
                  { fileId: docIdMatch[1], mimeType: 'text/plain' },
                  { responseType: 'text' }
                );
                refContent = (htmlRes.data || '').substring(0, 6000);
              } catch (gErr) {
                console.warn('Google export for reference URL failed:', gErr.message);
              }
            }
          }
          // Generic URL — fetch and strip HTML
          if (!refContent) {
            const refRes = await fetch(reference_url.trim(), {
              signal: AbortSignal.timeout(8000),
              headers: { 'User-Agent': 'Mozilla/5.0' },
            });
            if (refRes.ok) {
              const raw = await refRes.text();
              refContent = raw
                .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                .replace(/<[^>]+>/g, ' ')
                .replace(/\s+/g, ' ')
                .trim()
                .substring(0, 6000);
            }
          }
          if (refContent) {
            enrichedPrompt = `REFERENCE MATERIAL (use as style/format/tone guidance — do NOT copy verbatim):\n"""\n${refContent}\n"""\n\n${enrichedPrompt}`;
          }
        }
      } catch (refErr) {
        console.warn('Could not fetch reference URL (non-fatal):', refErr.message);
      }
    }

    const text = await callClaude(enrichedPrompt, SCENE_SYSTEM_PROMPT);
    const scenes = parseSceneJson(text);
    res.json({ scenes });
  } catch (err) {
    console.error('POST /scripts/temp/ai-generate error:', err);
    res.status(500).json({ error: err.message || 'AI generation failed' });
  }
});

// GET /api/scripts
router.get('/', async (req, res) => {
  try {
    const { production_id, status } = req.query;
    // Always enforce brand from JWT — never trust client-supplied brand_id
    const brand_id = req.user?.brand_id || req.query.brand_id;
    const vals = [], where = [];
    if (brand_id) where.push(`s.brand_id = $${vals.push(brand_id)}`);
    if (production_id) where.push(`s.production_id = $${vals.push(production_id)}`);
    if (status) where.push(`s.status = $${vals.push(status)}`);
    const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await db.query(
      `SELECT s.id, s.title, s.status, s.share_token, s.share_mode, s.drive_url,
              s.brand_id, s.production_id, s.created_by_name, s.created_at, s.updated_at,
              jsonb_array_length(COALESCE(s.scenes, '[]'::jsonb)) AS scene_count,
              p.project_name,
              (SELECT COUNT(*)::int FROM script_comments sc WHERE sc.script_id = s.id AND sc.status = 'open') AS open_comments
       FROM scripts s LEFT JOIN productions p ON s.production_id = p.id
       ${clause} ORDER BY s.updated_at DESC`,
      vals
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /scripts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/scripts/:id/suggest-shots — Claude analyzes a scene and suggests shot breakdown
router.post('/:id/suggest-shots', async (req, res) => {
  try {
    const { scene_id } = req.body;
    if (!scene_id) return res.status(400).json({ error: 'scene_id required' });
    const { rows } = await db.query('SELECT scenes, title FROM scripts WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Script not found' });
    const scene = (rows[0].scenes || []).find(s => s.id === scene_id);
    if (!scene) return res.status(404).json({ error: 'Scene not found' });

    const stripHtml = (s) => (s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    const whatWeSee = stripHtml(scene.what_we_see);
    const whatWeHear = stripHtml(scene.what_we_hear);

    const prompt = `You are a film director analyzing a storyboard scene to decide how many shots it needs.

Scene location: ${scene.location || ''}
What We See: ${whatWeSee}
What We Hear: ${whatWeHear}

Analyze this scene and break it into individual shots (each shot = one camera angle / moment / visual beat).
Rules:
- 1 shot if the scene is a single static moment or a simple action
- 2-3 shots if there are multiple visual moments, camera moves, or action beats
- Maximum 4 shots
- Each shot description should be 1 concise sentence describing exactly what the camera captures
- Keep shot descriptions specific and visual

Return ONLY valid JSON:
{"shots": [
  {"shot_number": 1, "description": "..."},
  {"shot_number": 2, "description": "..."}
]}`;

    const result = await callClaude(prompt, 'You are a film director. Return only JSON.');
    let parsed = { shots: [{ shot_number: 1, description: whatWeSee || 'Scene visual' }] };
    try {
      const match = result.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim().match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch (e) { /* silent */ }
    res.json(parsed);
  } catch (err) {
    console.error('POST /scripts/:id/suggest-shots error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/scripts/voices — must be BEFORE /:id to avoid route collision
router.get('/voices', async (req, res) => {
  try {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) return res.status(501).json({ error: 'ELEVENLABS_API_KEY not configured' });
    const r = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': apiKey },
    });
    if (!r.ok) return res.status(r.status).json({ error: `ElevenLabs error: ${r.status}` });
    const data = await r.json();
    const voices = (data.voices || [])
      .map(v => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category || 'premade',
        preview_url: v.preview_url || null,
        labels: v.labels || {},
        gender: v.labels?.gender || '',
        description: [v.labels?.accent, v.labels?.description, v.labels?.use_case].filter(Boolean).join(' · ') || '',
      }))
      .sort((a, b) => {
        const catOrder = { 'cloned': 0, 'generated': 1, 'premade': 2 };
        const ca = catOrder[a.category] ?? 3;
        const cb = catOrder[b.category] ?? 3;
        if (ca !== cb) return ca - cb;
        return a.name.localeCompare(b.name);
      });
    res.json({ voices });
  } catch (err) {
    console.error('GET /scripts/voices error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Universal Blocks (must be before /:id to avoid route collision) ──────────

// GET /api/scripts/blocks?brand_id=X
router.get('/blocks', async (req, res) => {
  try {
    const { brand_id } = req.query;
    if (!brand_id) return res.status(400).json({ error: 'brand_id required' });
    const { rows } = await db.query(
      'SELECT id, name, category, scenes, thumbnail_url, created_at, updated_at FROM script_blocks WHERE brand_id = $1 ORDER BY category, name',
      [brand_id]
    );
    const categories = [...new Set(rows.map(r => r.category).filter(Boolean))].sort();
    res.json({ blocks: rows, categories });
  } catch (err) {
    console.error('GET /scripts/blocks error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scripts/blocks
router.post('/blocks', async (req, res) => {
  try {
    const { brand_id, name, category, scenes } = req.body;
    if (!brand_id || !name) return res.status(400).json({ error: 'brand_id and name required' });
    const cleanScenes = (scenes || []).map(s => ({
      id: require('crypto').randomUUID(),
      location: s.location || '',
      what_we_see: s.what_we_see || '',
      what_we_hear: s.what_we_hear || '',
      duration: s.duration || '',
      images: s.images || [],
    }));
    const { rows } = await db.query(
      'INSERT INTO script_blocks (brand_id, name, category, scenes, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [brand_id, name, category || 'general', JSON.stringify(cleanScenes), req.user?.id || null]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('POST /scripts/blocks error:', err);
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/scripts/blocks/:blockId
router.put('/blocks/:blockId', async (req, res) => {
  try {
    const { name, category, scenes } = req.body;
    const sets = [];
    const vals = [];
    let idx = 1;
    if (name !== undefined) { sets.push(`name = $${idx++}`); vals.push(name); }
    if (category !== undefined) { sets.push(`category = $${idx++}`); vals.push(category); }
    if (scenes !== undefined) { sets.push(`scenes = $${idx++}`); vals.push(JSON.stringify(scenes)); }
    sets.push(`updated_at = NOW()`);
    vals.push(req.params.blockId);
    const { rows } = await db.query(
      `UPDATE script_blocks SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      vals
    );
    if (!rows[0]) return res.status(404).json({ error: 'Block not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /scripts/blocks/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/scripts/blocks/:blockId
router.delete('/blocks/:blockId', async (req, res) => {
  try {
    await db.query('DELETE FROM script_blocks WHERE id = $1', [req.params.blockId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /scripts/blocks/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/scripts/:id
router.get('/:id', async (req, res) => {
  try {
    const brand_id = req.user?.brand_id || null;
    const { rows } = await db.query(
      `SELECT s.*, p.project_name, p.stage,
              jsonb_array_length(COALESCE(s.scenes, '[]'::jsonb)) AS scene_count,
              (SELECT COUNT(*)::int FROM script_comments sc WHERE sc.script_id = s.id AND sc.status = 'open') AS open_comments
       FROM scripts s LEFT JOIN productions p ON s.production_id = p.id
       WHERE s.id = $1 AND ($2::text IS NULL OR s.brand_id = $2)`,
      [req.params.id, brand_id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /scripts/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/scripts/:id/versions
router.get('/:id/versions', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, version_number, title, changed_by_name, change_summary, created_at FROM script_versions WHERE script_id = $1 ORDER BY version_number DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /scripts/:id/versions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/scripts/:id/comments
router.get('/:id/comments', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT * FROM script_comments WHERE script_id = $1 ORDER BY created_at ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('GET /scripts/:id/comments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/scripts (create)
router.post('/', async (req, res) => {
  try {
    const { production_id, title, scenes } = req.body;
    // Always use brand_id from JWT — ignore client-supplied value for security
    const brand_id = req.user?.brand_id || req.body.brand_id;
    const authorName = req.user?.name || req.user?.email || 'Unknown';
    const { rows } = await db.query(
      `INSERT INTO scripts (id, brand_id, production_id, title, scenes, created_by, created_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [
        crypto.randomUUID(),
        brand_id,
        production_id || null,
        title || 'Untitled Script',
        JSON.stringify(scenes || []),
        req.user?.id || null,
        authorName,
      ]
    );
    // Fetch production name for Slack
    let prodName = '';
    if (production_id) {
      const { rows: p } = await db.query('SELECT project_name FROM productions WHERE id = $1', [production_id]);
      prodName = p[0]?.project_name || production_id;
    }
    sendSlackNotification(slackScriptPayload({
      emoji: '📝', headline: 'New script created',
      script: { ...rows[0], project_name: prodName },
      fields: [`*Created by:* ${authorName}`],
    }));
    res.json(rows[0]);
  } catch (err) {
    console.error('POST /scripts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/scripts/import — AI-powered import from file or Google URL
router.post('/import', async (req, res) => {
  try {
    const { url, fileBase64, fileName, mimeType, production_id } = req.body;
    // Guard: 50MB max (base64 is ~4/3 overhead, so check string length)
    if (fileBase64 && fileBase64.length > 50 * 1024 * 1024 * 1.4) {
      return res.status(413).json({ error: 'File too large. Maximum 50MB.' });
    }
    let scenes = [];

    if (url) {
      // Google Slides or Docs URL
      const isSlidesUrl = url.includes('/presentation/d/');
      const isDocsUrl   = url.includes('/document/d/');
      if (!isSlidesUrl && !isDocsUrl) {
        return res.status(400).json({ error: 'URL must be a Google Slides or Google Docs link' });
      }

      // Extract file ID
      const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (!match) return res.status(400).json({ error: 'Could not extract file ID from URL' });
      const fileId = match[1];

      if (isSlidesUrl) {
        const { drive, oauth2 } = await getGoogleDrive();
        const slides = google.slides({ version: 'v1', auth: oauth2 });
        const pres = await slides.presentations.get({ presentationId: fileId });
        const slideList = pres.data.slides || [];

        // Process slides — fetch thumbnails in parallel
        scenes = await Promise.all(slideList.map(async (slide, idx) => {
          let whatWeSee = '';
          let whatWeHear = '';
          // Extract text from shapes
          for (const element of slide.pageElements || []) {
            const text = element.shape?.text?.textElements?.map(te => te.textRun?.content || '').join('').trim();
            if (!text) continue;
            if (element.objectId?.includes('note')) { whatWeHear += text + ' '; }
            else { whatWeSee += text + ' '; }
          }
          // Get speaker notes
          const notesPage = slide.slideProperties?.notesPage;
          if (notesPage) {
            for (const el of notesPage.pageElements || []) {
              const noteText = el.shape?.text?.textElements?.map(te => te.textRun?.content || '').join('').trim();
              if (noteText) whatWeHear = noteText;
            }
          }

          // Fetch slide thumbnail (actual visual from the slide)
          const images = [];
          try {
            const thumbRes = await slides.presentations.pages.getThumbnail({
              presentationId: fileId,
              pageObjectId: slide.objectId,
              'thumbnailProperties.thumbnailSize': 'MEDIUM',
            });
            const thumbUrl = thumbRes.data.contentUrl;
            if (thumbUrl) {
              // Upload thumbnail to Drive for persistence
              const accessToken = (await oauth2.getAccessToken()).token;
              const imgRes = await fetch(thumbUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
              if (imgRes.ok) {
                const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
                try {
                  const { drive } = await getGoogleDrive();
                  const driveUrl = await driveUploadBuffer({
                    drive,
                    fileName: `slide-${idx + 1}-thumbnail-${Date.now()}.png`,
                    buffer: imgBuffer,
                    mimeType: 'image/png',
                    subfolder: 'Scripts/Imported Slides',
                  });
                  images.push({ id: crypto.randomUUID(), url: driveUrl, name: `Slide ${idx + 1}`, source: 'import' });
                } catch {
                  // Fall back to base64 data URL if Drive fails
                  images.push({ id: crypto.randomUUID(), url: `data:image/png;base64,${imgBuffer.toString('base64')}`, name: `Slide ${idx + 1}`, source: 'import' });
                }
              }
            }
          } catch (thumbErr) {
            console.warn(`Could not fetch thumbnail for slide ${idx + 1}:`, thumbErr.message);
          }

          return {
            id: crypto.randomUUID(),
            order: idx,
            location: '',
            what_we_see: whatWeSee.trim(),
            what_we_hear: whatWeHear.trim(),
            duration: '',
            collapsed: false,
            images,
          };
        }));
      } else {
        // Google Docs — try public no-auth export first (works for "Anyone with link"),
        // then fall back to OAuth chain (Docs API → HTML → PDF)
        let docContent = '';
        let contentLabel = '';

        // ── Attempt 0: public plain-text export (no OAuth needed) ──
        try {
          const pubRes = await fetch(
            `https://docs.google.com/document/d/${fileId}/export?format=txt`,
            { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) }
          );
          if (pubRes.ok && pubRes.headers.get('content-type')?.includes('text/plain')) {
            const txt = await pubRes.text();
            if (txt.trim().length > 50) {
              docContent = txt.substring(0, 60000);
              contentLabel = 'Google Doc plain text';
            }
          }
        } catch (_) { /* not publicly accessible, continue to OAuth */ }

        if (!docContent) {
        // ── OAuth chain ─────────────────────────────────────────────
        const { oauth2 } = await getGoogleDrive();
        const accessToken = (await oauth2.getAccessToken()).token;

        // ── Primary: Google Docs API ──────────────────────────────
        try {
          const docs = google.docs({ version: 'v1', auth: oauth2 });
          const doc = await docs.documents.get({ documentId: fileId });
          const blocks = doc.data.body?.content || [];
          let fullText = '';
          for (const block of blocks) {
            if (block.paragraph) {
              const style = block.paragraph.paragraphStyle?.namedStyleType || '';
              const line = block.paragraph.elements?.map(el => el.textRun?.content || '').join('') || '';
              if (style.startsWith('HEADING')) fullText += `\n## ${line.trim()}\n`;
              else fullText += line;
            } else if (block.table) {
              for (const row of block.table.tableRows || []) {
                const cells = (row.tableCells || []).map(cell => {
                  return (cell.content || []).map(para =>
                    (para.paragraph?.elements || []).map(el => el.textRun?.content || '').join('')
                  ).join('').trim();
                });
                fullText += cells.join(' | ') + '\n';
              }
              fullText += '\n';
            }
          }
          docContent = fullText.substring(0, 60000);
          contentLabel = 'Google Doc (structured text with table rows as | separated columns)';
        } catch (docsErr) {
          // Surface 403/404 immediately — no point trying fallbacks
          const docsStatus = docsErr?.response?.status || docsErr?.code;
          if (docsStatus === 403 || docsStatus === 404 || String(docsErr.message).includes('403') || String(docsErr.message).includes('404')) {
            throw new Error('This Google Doc is not accessible. Make sure it is shared with the Google account connected in Settings → Integrations (use "Share" → "Anyone with link" or share directly with that account).');
          }
          console.warn('Google Docs API failed, falling back to HTML export:', docsErr.message);

          // ── Fallback 1: HTML export (preserves table structure) ──
          const htmlRes = await fetch(
            `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/html`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
          );
          if (htmlRes.ok) {
            let html = await htmlRes.text();
            html = html
              .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
              .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
              .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
              .substring(0, 60000);
            docContent = html;
            contentLabel = 'Google Doc HTML export (pay special attention to TABLE structure — rows = scenes, columns = location/what we see/what we hear)';
          } else {
            // ── Fallback 2: PDF export → Gemini ──────────────────
            console.warn('HTML export failed, falling back to PDF export');
            const pdfRes = await fetch(
              `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`,
              { headers: { Authorization: `Bearer ${accessToken}` } }
            );
            if (!pdfRes.ok) throw new Error('Could not access this Google Doc. Make sure it is shared with the Google account connected in Settings → Integrations.');
            const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
            const pdfBase64 = pdfBuf.toString('base64');
            const pdfPrompt = `Extract this script/storyboard PDF into a JSON scenes array. For each scene: location, what_we_see, what_we_hear, duration, images_in_source (empty array if none). Return ONLY: {"scenes":[{"id":"<uuid>","order":0,"location":"","what_we_see":"","what_we_hear":"","duration":"","collapsed":false,"images_in_source":[],"images":[]}]}`;
            const pdfText = process.env.GEMINI_API_KEY
              ? await callGemini(pdfPrompt, pdfBase64, 'application/pdf')
              : await callClaude(pdfPrompt, SCENE_SYSTEM_PROMPT);
            scenes = parseSceneJson(pdfText);
            // Skip the Claude call below — already have scenes
            docContent = null;
          }
        }
        } // end if (!docContent) OAuth chain

        if (docContent !== null) {
          // Handles both: public export text AND OAuth Docs API/HTML content
          const importPrompt = `Extract this ${contentLabel} into a structured JSON scenes array for a storyboard/script.

For each scene/row/section:
- "location": scene heading or setting (e.g. "INT. STUDIO - DAY"), empty string if none
- "what_we_see": visual directions, action description, what appears on screen
- "what_we_hear": dialogue, voiceover, script text, audio directions
- "duration": timing if mentioned (e.g. "5s", "10s"), empty string if none
- "images_in_source": array of strings describing any embedded images in this scene. Empty array if none.

Content:
${docContent}

Return ONLY this JSON with NO markdown:
{"scenes":[{"id":"<uuid-v4>","order":0,"location":"","what_we_see":"","what_we_hear":"","duration":"","collapsed":false,"images_in_source":[],"images":[]}]}`;
          const text = await callClaude(importPrompt, SCENE_SYSTEM_PROMPT);
          scenes = parseSceneJson(text);
        }
      }
    } else if (fileBase64) {
      // File upload — Gemini primary (natively handles PDF/DOCX/PPTX/images), Claude fallback
      const importPrompt = `Analyze this script, storyboard, or presentation document and extract it into a structured JSON scenes array.

For each scene/slide/section:
- "location": scene heading or setting (e.g. "INT. STUDIO - DAY"), empty string if none
- "what_we_see": visual directions, camera moves, action description, visual text on screen
- "what_we_hear": dialogue, voiceover, script text, speaker notes, audio directions
- "duration": timing if mentioned (e.g. "5s", "10s"), empty string if none
- "images_in_source": array of strings describing any images/visuals physically embedded in this scene/slide (e.g. "Product shot of sneakers on white background", "Photo of athlete running on track"). Empty array if no images found.

Return ONLY this JSON object with NO markdown:
{
  "scenes": [
    {
      "id": "<uuid-v4>",
      "order": 0,
      "location": "...",
      "what_we_see": "...",
      "what_we_hear": "...",
      "duration": "",
      "collapsed": false,
      "images_in_source": ["description of image 1", "..."],
      "images": []
    }
  ]
}`;

      let text;
      const isDocx = mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        || mimeType === 'application/msword'
        || fileName?.toLowerCase().endsWith('.docx')
        || fileName?.toLowerCase().endsWith('.doc');
      if (isDocx) {
        // Gemini doesn't support DOCX — extract text with mammoth, send to Claude
        const buf = Buffer.from(fileBase64, 'base64');
        const { value: docText } = await mammoth.extractRawText({ buffer: buf });
        text = await callClaude(
          `Document: "${fileName || 'script'}"\n\nContent:\n${docText.slice(0, 60000)}\n\n${importPrompt}`,
          SCENE_SYSTEM_PROMPT
        );
      } else if (process.env.GEMINI_API_KEY) {
        text = await callGemini(importPrompt, fileBase64, mimeType || 'application/pdf');
      } else {
        const isImage = mimeType?.startsWith('image/');
        if (isImage) {
          text = await callClaude(importPrompt, SCENE_SYSTEM_PROMPT, [{ base64: fileBase64, mimeType }]);
        } else {
          text = await callClaude(`Document: "${fileName || 'script'}"\n\n${importPrompt}`, SCENE_SYSTEM_PROMPT);
        }
      }

      // Parse — handle images_in_source field
      const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
      const parsed = JSON.parse(cleaned);
      if (!Array.isArray(parsed.scenes)) throw new Error('Invalid scene format from AI');

      // Separate images_in_source from the scene (it's metadata, not stored in images array)
      const imagesFound = [];
      scenes = parsed.scenes.map((s, i) => {
        const imgsInSource = s.images_in_source || [];
        if (imgsInSource.length > 0) {
          imagesFound.push({ scene_order: i + 1, descriptions: imgsInSource });
        }
        const { images_in_source: _, ...cleanScene } = s;
        return ensureScenes([cleanScene])[0];
      });

      // Return images_found so the frontend can ask what to do with them
      return res.json({ scenes, images_found: imagesFound });
    } else {
      return res.status(400).json({ error: 'Provide either url or fileBase64' });
    }

    res.json({ scenes });
  } catch (err) {
    console.error('POST /scripts/import error:', err);
    res.status(500).json({ error: err.message || 'Import failed' });
  }
});

// POST /api/scripts/:id/ai-generate
router.post('/:id/ai-generate', async (req, res) => {
  try {
    const { mode, prompt, current_scenes } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });

    let fullPrompt = prompt;
    if (mode === 'refine' && current_scenes?.length) {
      fullPrompt = `Current script:\n${JSON.stringify(current_scenes, null, 2)}\n\nInstruction: ${prompt}`;
    }

    const text = await callClaude(fullPrompt, SCENE_SYSTEM_PROMPT);
    const scenes = parseSceneJson(text);

    // Auto-save version before replacing
    const { rows: cur } = await db.query('SELECT scenes, title FROM scripts WHERE id = $1', [req.params.id]);
    if (cur[0]) {
      const { rows: vRows } = await db.query(
        'SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM script_versions WHERE script_id = $1',
        [req.params.id]
      );
      await db.query(
        'INSERT INTO script_versions (id, script_id, version_number, scenes, title, changed_by_name, change_summary) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [crypto.randomUUID(), req.params.id, vRows[0].next, JSON.stringify(cur[0].scenes), cur[0].title, req.user?.name || req.user?.email || 'AI', `Before AI ${mode}`]
      );
    }

    res.json({ scenes });
  } catch (err) {
    console.error('POST /scripts/:id/ai-generate error:', err);
    res.status(500).json({ error: err.message || 'AI generation failed' });
  }
});

// Simple in-memory rate limiter for expensive AI image calls
// Max 15 image generations per script per 5 minutes
const aiImageRateMap = new Map();
function checkAiImageRate(scriptId) {
  const now = Date.now();
  const window = 5 * 60 * 1000;
  const max = 15;
  if (!aiImageRateMap.has(scriptId)) aiImageRateMap.set(scriptId, []);
  const ts = aiImageRateMap.get(scriptId).filter(t => now - t < window);
  if (ts.length >= max) return false;
  ts.push(now);
  aiImageRateMap.set(scriptId, ts);
  return true;
}

// POST /api/scripts/:id/ai-image — Gemini image generation (Nano Banana 2)
// Accepts optional: prompt (override), replace_image_id (replace vs append), character_profiles, style_notes, product_info
router.post('/:id/ai-image', async (req, res) => {
  if (!checkAiImageRate(req.params.id)) {
    return res.status(429).json({ error: 'Too many image generations — please wait a moment before generating more.' });
  }
  try {
    const { scene_id, prompt: promptOverride, replace_image_id, character_profiles, style_notes, reference_image, reference_image_url, product_info, character_photos, reference_images, independent } = req.body;
    if (!scene_id) return res.status(400).json({ error: 'scene_id is required' });

    if (!process.env.GEMINI_API_KEY) {
      return res.status(501).json({ error: 'GEMINI_API_KEY not configured in .env' });
    }

    // Load full script to get context
    const { rows } = await db.query('SELECT scenes, title FROM scripts WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Script not found' });
    const scenes = rows[0].scenes || [];
    const sceneIndex = scenes.findIndex(s => s.id === scene_id);
    if (sceneIndex === -1) return res.status(404).json({ error: 'Scene not found' });

    const targetScene = scenes[sceneIndex];
    const prevScene = sceneIndex > 0 ? scenes[sceneIndex - 1] : null;
    const nextScene = sceneIndex < scenes.length - 1 ? scenes[sceneIndex + 1] : null;

    // All existing image prompts for visual consistency (use more for better continuity)
    const existingImagePrompts = scenes
      .filter(s => s.id !== scene_id)
      .flatMap(s => (s.images || []).filter(img => img.prompt).map(img => img.prompt))
      .slice(0, 10);

    // Get the immediately previous scene's generated image as visual reference for continuity (skip if independent)
    const prevSceneImage = !independent ? (prevScene?.images?.[0]?.url || null) : null;

    let imagePrompt = promptOverride; // use override if provided (regenerate with edited prompt)

    if (!imagePrompt) {
      // Build character profiles context
      const charContext = Array.isArray(character_profiles) && character_profiles.length > 0
        ? `\nCHARACTERS — IDENTITY LOCK (non-negotiable):\n${character_profiles.map(c => `- ${c.name}: ${c.description}`).join('\n')}\nYou MUST reproduce each character's exact appearance as described. Same face structure, hair, skin tone, build. Do NOT idealize, beautify, or alter them.\n`
        : '';

      // Build product context
      const productContext = product_info?.name
        ? `\nPRODUCT CONSISTENCY (CRITICAL — non-negotiable):\nThe product "${product_info.name}" must appear in this scene with EXACT visual accuracy. Maintain the exact shape, branding, colors, proportions, and logo placement from the reference product images provided. Do NOT stylize, abstract, or alter the product in any way. The product must be instantly recognizable as "${product_info.name}".\n`
        : '';

      // Build style notes context
      const styleContext = style_notes
        ? `\nVISUAL STYLE FOR THIS PRODUCTION:\n${style_notes}\n`
        : '';

      // Ask Claude to craft a detailed image generation prompt
      const contextPrompt = `You are writing an image generation prompt for a professional storyboard frame.

Script title: "${rows[0].title}"
${charContext}${productContext}${styleContext}
${prevScene ? `PREVIOUS SCENE (Scene ${sceneIndex}):
- Location: ${prevScene.location || ''}
- What We See: ${prevScene.what_we_see || ''}
- What We Hear: ${prevScene.what_we_hear || ''}
` : ''}
CURRENT SCENE (Scene ${sceneIndex + 1}) — generate image for this:
- Location: ${targetScene.location || ''}
- What We See: ${targetScene.what_we_see || ''}
- What We Hear: ${targetScene.what_we_hear || ''}
- Duration: ${targetScene.duration || ''}

${nextScene ? `NEXT SCENE (Scene ${sceneIndex + 2}):
- Location: ${nextScene.location || ''}
- What We See: ${nextScene.what_we_see || ''}
- What We Hear: ${nextScene.what_we_hear || ''}
` : ''}
${existingImagePrompts.length > 0 ? `VISUAL CONSISTENCY — other frames in this storyboard already use:
${existingImagePrompts.map(p => `- ${p}`).join('\n')}
` : ''}

Write a single, detailed image generation prompt (2-4 sentences) for the CURRENT SCENE only.

${independent ? `INDEPENDENT SHOT — generate a fresh, standalone image. Use your own creative interpretation for style, lighting, and mood.` : `STORYBOARD CONTINUITY RULES (CRITICAL):
- This is frame ${sceneIndex + 1} of ${scenes.length} in a continuous storyboard. Every frame MUST feel like it belongs to the same production.
- SAME color palette, lighting temperature, contrast level, and visual tone across ALL frames.
- SAME characters must look IDENTICAL in every frame — same clothes, hair, skin, build. No variations.
- SAME product must look IDENTICAL — exact packaging, colors, branding, size.
- SAME camera style and lens feel — if previous frames use cinematic wide angles, continue that.
- Match the mood and energy progression from previous to current scene.`}
- Include camera angle, lighting, composition, mood in the prompt.
- Do NOT include text overlays, titles, or watermarks.
- Return ONLY the prompt text, nothing else.`;

      try {
        imagePrompt = await callClaude(contextPrompt, 'You are a professional storyboard artist and cinematographer. Write concise, vivid image generation prompts.');
        imagePrompt = imagePrompt.trim().replace(/^["']|["']$/g, '');
      } catch (claudeErr) {
        console.warn('Claude prompt generation failed, using fallback:', claudeErr.message);
        imagePrompt = `Cinematic storyboard frame: ${targetScene.location || ''}. ${targetScene.what_we_see || ''}. Professional film production style, dramatic lighting.`;
      }
    }

    // Resolve reference image (upload or URL)
    const refImages = [];

    // Prepend product photos (up to 3) before any actor reference
    if (Array.isArray(product_info?.photos)) {
      for (const photo of product_info.photos.slice(0, 3)) {
        if (photo?.base64) {
          refImages.unshift({ base64: photo.base64, mimeType: photo.mimeType || 'image/jpeg' });
        }
      }
    }

    // Add character reference photos — placed after product photos, with identity lock instruction
    if (Array.isArray(character_photos)) {
      for (const cp of character_photos.slice(0, 3)) {
        if (cp?.base64) {
          refImages.push({ base64: cp.base64, mimeType: cp.mimeType || 'image/jpeg' });
        }
      }
    }

    // Add general reference images (style/mood refs from wizard)
    if (Array.isArray(reference_images)) {
      for (const ri of reference_images.slice(0, 5)) {
        if (ri?.base64) {
          refImages.push({ base64: ri.base64, mimeType: ri.mimeType || 'image/jpeg' });
        }
      }
    }

    // Fetch previous scene's generated image as CONTINUITY reference (so Gemini sees the last frame)
    if (prevSceneImage && !promptOverride) {
      try {
        const prevImgUrl = prevSceneImage.startsWith('data:') ? null : prevSceneImage;
        if (prevImgUrl) {
          const prevRes = await fetch(prevImgUrl, { signal: AbortSignal.timeout(5000) });
          if (prevRes.ok) {
            const prevBuf = Buffer.from(await prevRes.arrayBuffer());
            const prevMime = prevRes.headers.get('content-type') || 'image/jpeg';
            // Push as FIRST reference — Gemini sees this frame first for continuity
            refImages.unshift({ base64: prevBuf.toString('base64'), mimeType: prevMime });
          }
        }
      } catch { /* non-critical — continue without prev image */ }
    }

    if (reference_image?.base64) {
      refImages.push({ base64: reference_image.base64, mimeType: reference_image.mimeType || 'image/jpeg' });
    } else if (reference_image_url) {
      // SSRF guard — block internal/private IPs
      try {
        const parsedRefUrl = new URL(reference_image_url);
        const isInternal = /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.|::1$|::ffff:127\.|fd|fc)/.test(parsedRefUrl.hostname);
        if (isInternal) return res.status(400).json({ error: 'Internal URLs not allowed as reference images' });
        const refRes = await fetch(reference_image_url, { signal: AbortSignal.timeout(8000) });
        if (refRes.ok) {
          const refBuf = Buffer.from(await refRes.arrayBuffer());
          const refMime = refRes.headers.get('content-type') || 'image/jpeg';
          refImages.push({ base64: refBuf.toString('base64'), mimeType: refMime });
        }
      } catch (refErr) {
        console.warn('Could not fetch reference image URL:', refErr.message);
      }
    }

    // STORYBOARD CONTINUITY: if we have the previous frame, tell Gemini to match it
    if (prevSceneImage && !promptOverride && refImages.length > 0) {
      imagePrompt += ' STORYBOARD CONTINUITY: The FIRST reference image is the previous frame in this storyboard sequence. Match its exact color grading, lighting temperature, visual tone, and cinematic style. Characters must look identical. This new frame must feel like the immediate next shot in the same production.';
    }

    // If product photos were added (and no override), tell model to replicate product precisely
    const productPhotosAdded = Array.isArray(product_info?.photos) && product_info.photos.length > 0;
    if (productPhotosAdded && !promptOverride) {
      imagePrompt += ' The provided product reference images show the exact product that must appear in this scene — replicate it precisely.';
    }
    const charPhotosAdded = Array.isArray(character_photos) && character_photos.length > 0;
    if (charPhotosAdded && !promptOverride) {
      imagePrompt += ` IDENTITY LOCK: The reference photo(s) that follow this text show the EXACT actor(s)/character(s) who must appear in this scene. Reproduce their face, hair color and style, skin tone, and build with absolute precision. Do NOT change, idealize, or invent their appearance.`;
    } else if (refImages.length > 0 && !promptOverride && !productPhotosAdded) {
      imagePrompt += ' Use the provided reference image as visual inspiration for composition, style, or subject — adapt it to fit the scene context while maintaining storyboard consistency.';
    }

    // Generate image via Gemini (Nano Banana 2), optionally with reference images
    const { base64, mimeType } = await generateGeminiImage(imagePrompt, refImages);
    const imgBuffer = Buffer.from(base64, 'base64');
    const ext = mimeType.includes('png') ? 'png' : 'jpg';

    // Upload to Google Drive for persistence
    let finalUrl = null;
    try {
      const { drive } = await getGoogleDrive();
      finalUrl = await driveUploadBuffer({
        drive,
        fileName: `ai-image-scene${sceneIndex + 1}-${Date.now()}.${ext}`,
        buffer: imgBuffer,
        mimeType,
        subfolder: 'Scripts/AI Images',
      });
    } catch (driveErr) {
      console.warn('Could not upload AI image to Drive, using base64 data URL:', driveErr.message);
      finalUrl = `data:${mimeType};base64,${base64}`;
    }

    const newImageEntry = { id: crypto.randomUUID(), url: finalUrl, prompt: imagePrompt, source: 'ai' };

    // Replace existing image OR append new one
    const updated = scenes.map(s => {
      if (s.id !== scene_id) return s;
      const imgs = s.images || [];
      if (replace_image_id) {
        return { ...s, images: imgs.map(img => img.id === replace_image_id ? newImageEntry : img) };
      }
      return { ...s, images: [...imgs, newImageEntry] };
    });
    await db.query('UPDATE scripts SET scenes = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(updated), req.params.id]);

    res.json({ url: finalUrl, prompt: imagePrompt, image_id: newImageEntry.id });
  } catch (err) {
    console.error('POST /scripts/:id/ai-image error:', err);
    res.status(500).json({ error: err.message || 'Image generation failed' });
  }
});

// POST /api/scripts/:id/extract-characters — Claude reads all scenes and extracts characters
router.post('/:id/extract-characters', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT scenes, title FROM scripts WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Script not found' });
    const scenes = rows[0].scenes || [];

    const scriptText = scenes.map((s, i) =>
      `Scene ${i + 1} [${s.location || 'no location'}]:\n  See: ${s.what_we_see || ''}\n  Hear: ${s.what_we_hear || ''}`
    ).join('\n\n');

    const prompt = `Analyze this storyboard script and extract all characters (people, actors) who appear.
For each character provide:
- name: their name or role (e.g. "Hero", "Athlete", "Brand Ambassador", "Woman in Red")
- description: visual description for image generation (gender, age range, build, hair, style, notable features)
- scenes: array of scene numbers where they appear

Script title: "${rows[0].title}"

${scriptText}

Return ONLY valid JSON:
{"characters": [{"name": "...", "description": "...", "scenes": [1, 2, 3]}]}
If no specific characters found, return {"characters": []}`;

    const text = await callClaude(prompt, 'You are a script analyst. Return only valid JSON.');
    const cleaned = text.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim();
    const { characters } = JSON.parse(cleaned);

    res.json({ characters: Array.isArray(characters) ? characters : [] });
  } catch (err) {
    console.error('POST /scripts/:id/extract-characters error:', err);
    res.status(500).json({ error: err.message || 'Character extraction failed' });
  }
});

// POST /api/scripts/:id/extract-product — Claude detects the product being advertised
router.post('/:id/extract-product', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT scenes, title FROM scripts WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Script not found' });
    const scenes = rows[0].scenes || [];

    // Strip HTML tags and decode entities before sending to Claude
    const stripHtml = (s) => (s || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

    const allText = scenes.map((s, i) =>
      `Scene ${i + 1}:\nLocation: ${stripHtml(s.location)}\nWhat We See: ${stripHtml(s.what_we_see)}\nWhat We Hear: ${stripHtml(s.what_we_hear)}`
    ).join('\n\n');

    const prompt = `You are reading a commercial/advertisement script. Your job is to identify the SPECIFIC PRODUCT or BRAND NAME being advertised — the actual name as it appears in the script, not a generic description.

Script title: "${rows[0].title}"

${allText}

Rules:
- Return the FULL product/brand name exactly as written (e.g. "Particle Anti-Gray Serum", "Nike Air Max 90", "iPhone 15 Pro")
- If you see a brand name + product type together, return both (e.g. "Particle Hand Cream")
- Do NOT return generic descriptions like "men's hand cream" — return the brand/product name
- If the script title contains the product name, that's a strong hint
- If genuinely uncertain, return an empty string

Return ONLY valid JSON:
{"product_name": "Exact Product Name Here"}

Return ONLY the JSON, nothing else.`;

    const result = await callClaude(prompt, 'You extract product and brand names from ad scripts. Return only JSON.');
    let parsed = { product_name: '' };
    try {
      const match = result.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '').trim().match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch (e) { /* silent */ }
    res.json(parsed);
  } catch (err) {
    console.error('POST /scripts/:id/extract-product error:', err);
    res.status(500).json({ error: err.message || 'Product extraction failed' });
  }
});

// POST /api/scripts/:id/describe-actor — Claude vision describes an actor photo for consistency prompts
router.post('/:id/describe-actor', async (req, res) => {
  try {
    const { imageBase64, mimeType, name } = req.body;
    if (!imageBase64) return res.status(400).json({ error: 'imageBase64 is required' });

    const prompt = `Describe this person's appearance in detail for use in AI image generation prompts.
Focus on: gender, approximate age range, hair color & style, skin tone, build/physique, distinctive facial features, style/vibe.
Be specific enough that an AI image generator can reproduce this person consistently.
Name/role: ${name || 'unknown'}
Return ONLY a 2-3 sentence description, no preamble.`;

    const description = await callClaude(prompt, 'You are a visual description specialist for AI image generation.', [{ base64: imageBase64, mimeType: mimeType || 'image/jpeg' }]);

    res.json({ description: description.trim() });
  } catch (err) {
    console.error('POST /scripts/:id/describe-actor error:', err);
    res.status(500).json({ error: err.message || 'Actor description failed' });
  }
});

// POST /api/scripts/:id/save-version
router.post('/:id/save-version', async (req, res) => {
  try {
    const { change_summary } = req.body;
    const { rows: cur } = await db.query('SELECT scenes, title FROM scripts WHERE id = $1', [req.params.id]);
    if (!cur[0]) return res.status(404).json({ error: 'Not found' });
    const { rows: vRows } = await db.query(
      'SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM script_versions WHERE script_id = $1',
      [req.params.id]
    );
    const { rows } = await db.query(
      'INSERT INTO script_versions (id, script_id, version_number, scenes, title, changed_by_name, change_summary) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [crypto.randomUUID(), req.params.id, vRows[0].next, JSON.stringify(cur[0].scenes), cur[0].title, req.user?.name || req.user?.email || 'Unknown', change_summary || '']
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('POST /scripts/:id/save-version error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/scripts/:id/restore/:vId
router.post('/:id/restore/:vId', async (req, res) => {
  try {
    const { rows: ver } = await db.query('SELECT * FROM script_versions WHERE id = $1 AND script_id = $2', [req.params.vId, req.params.id]);
    if (!ver[0]) return res.status(404).json({ error: 'Version not found' });

    // Save current as a version first
    const { rows: cur } = await db.query('SELECT scenes, title FROM scripts WHERE id = $1', [req.params.id]);
    if (cur[0]) {
      const { rows: vRows } = await db.query(
        'SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM script_versions WHERE script_id = $1',
        [req.params.id]
      );
      await db.query(
        'INSERT INTO script_versions (id, script_id, version_number, scenes, title, changed_by_name, change_summary) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [crypto.randomUUID(), req.params.id, vRows[0].next, JSON.stringify(cur[0].scenes), cur[0].title, req.user?.name || req.user?.email || 'Unknown', 'Auto-saved before restore']
      );
    }

    const { rows } = await db.query(
      'UPDATE scripts SET scenes = $1, updated_at = NOW() WHERE id = $2 RETURNING *',
      [JSON.stringify(ver[0].scenes), req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    console.error('POST /scripts/:id/restore/:vId error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/scripts/:id/share — generate/update share token + mode
router.post('/:id/share', async (req, res) => {
  try {
    const { share_mode } = req.body; // 'none' | 'view' | 'edit'
    const { rows: cur } = await db.query('SELECT share_token, share_mode FROM scripts WHERE id = $1', [req.params.id]);
    if (!cur[0]) return res.status(404).json({ error: 'Not found' });

    let token = cur[0].share_token;
    const mode = share_mode || 'view';

    if (mode === 'none') {
      await db.query('UPDATE scripts SET share_token = NULL, share_mode = $1 WHERE id = $2', ['none', req.params.id]);
      return res.json({ share_token: null, share_mode: 'none' });
    }

    if (!token) token = crypto.randomBytes(32).toString('hex');
    // Set expiry to 90 days from now
    const expiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    await db.query('UPDATE scripts SET share_token = $1, share_mode = $2, share_expires_at = $3 WHERE id = $4', [token, mode, expiresAt, req.params.id]);
    res.json({ share_token: token, share_mode: mode, share_expires_at: expiresAt });
  } catch (err) {
    console.error('POST /scripts/:id/share error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/scripts/:id/chat — AI chat about the script (Claude conversation)
router.post('/:id/chat', async (req, res) => {
  try {
    const { messages, selected_text, scene_id, reference_url } = req.body;
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array required' });
    }

    // Load script context
    const { rows } = await db.query('SELECT scenes, title FROM scripts WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Script not found' });
    const scenes = rows[0].scenes || [];
    const stripHtml = (s) => (s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

    // Build script context for Claude
    const scenesSummary = scenes.map((s, i) => {
      const parts = [`Scene ${i + 1}:`];
      if (s.location) parts.push(`Location: ${s.location}`);
      if (s.what_we_see) parts.push(`Visual: ${stripHtml(s.what_we_see)}`);
      if (s.what_we_hear) parts.push(`Audio: ${stripHtml(s.what_we_hear)}`);
      return parts.join(' | ');
    }).join('\n');

    let contextNote = '';
    // Fetch reference URL content if provided
    if (reference_url) {
      try {
        const urlRes = await fetch(reference_url, { signal: AbortSignal.timeout(8000) });
        if (urlRes.ok) {
          const text = await urlRes.text();
          const cleanText = text.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 5000);
          contextNote += `\n\nReference URL content (${reference_url}):\n${cleanText}`;
        }
      } catch {}
    }
    if (selected_text) {
      contextNote = `\n\nThe user has selected this specific text from the script:\n"${selected_text}"`;
    }
    if (scene_id) {
      const scene = scenes.find(s => s.id === scene_id);
      if (scene) {
        const idx = scenes.indexOf(scene);
        contextNote += `\n\nFocusing on Scene ${idx + 1} (${scene.location || 'no location'}):
Visual: ${stripHtml(scene.what_we_see)}
Audio: ${stripHtml(scene.what_we_hear)}`;
      }
    }

    // Load brand voice guidelines if saved
    let brandVoice = '';
    try {
      const { rows: settingsRows } = await db.query('SELECT colors, fonts FROM settings WHERE brand_id = (SELECT brand_id FROM scripts WHERE id = $1)', [req.params.id]);
      // Check for brand_voice in script metadata or settings
    } catch {}

    const systemPrompt = `You are a powerful AI scriptwriting agent for "${rows[0].title}". You can DISCUSS, ANALYZE, and EXECUTE actions on the script.

Current script (${scenes.length} scenes, ~${scenes.reduce((sum, s) => sum + (stripHtml(s.what_we_hear) || '').split(/\s+/).filter(Boolean).length, 0)} words):
${scenesSummary}${contextNote}

ACTIONS — include \`\`\`action JSON blocks to execute changes:

SCENE EDITING:
1. Edit scene: \`\`\`action
{"action":"edit_scene","scene_number":1,"field":"what_we_hear","value":"Full new text"}
\`\`\`  Fields: "what_we_see", "what_we_hear", "location", "duration"

2. Delete scene: \`\`\`action
{"action":"delete_scene","scene_number":3}
\`\`\`

3. Add scene: \`\`\`action
{"action":"add_scene","after_scene_number":2,"location":"INT. STUDIO","what_we_see":"Visual","what_we_hear":"Audio"}
\`\`\`

4. Reorder scene: \`\`\`action
{"action":"reorder_scene","scene_number":5,"move_to_position":2}
\`\`\`

5. Merge scenes: \`\`\`action
{"action":"merge_scenes","scene_numbers":[3,4]}
\`\`\`

BULK OPERATIONS:
6. Find & Replace: \`\`\`action
{"action":"find_replace","find":"old","replace":"new"}
\`\`\`

7. Batch edit (edit multiple scenes at once): \`\`\`action
{"action":"batch_edit","edits":[{"scene_number":1,"field":"what_we_hear","value":"..."},{"scene_number":2,"field":"what_we_hear","value":"..."}]}
\`\`\`

8. Duplicate script: \`\`\`action
{"action":"duplicate_script","new_title":"Script v2"}
\`\`\`

ANALYSIS (no action block needed — just respond with analysis):
- "Rate this script" → Score pacing (1-10), emotional arc, CTA strength, visual variety, timing fit
- "Optimize for 30 seconds" → Suggest which scenes to cut/shorten to hit target
- "Generate shot list" → Production-ready shot list with camera, lighting, crew notes
- "Suggest alternatives for scene X" → Write 2-3 alternative versions

RULES:
- Explain BEFORE action blocks. Be concise and creative.
- Multiple action blocks allowed per response.
- edit_scene must include the COMPLETE new text for the field.
- For batch rewrites, use batch_edit with all edits in one action.
- If user just wants to discuss/analyze, respond without action blocks.
- When scoring, be honest and specific with improvement suggestions.`;

    // Build conversation messages for Claude API
    const claudeMessages = messages.map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content,
    }));

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: systemPrompt,
        messages: claudeMessages,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return res.status(resp.status).json({ error: err.error?.message || 'AI request failed' });
    }

    const data = await resp.json();
    const reply = data.content[0]?.text || 'No response generated.';
    // Parse action blocks from reply
    const actions = [];
    const actionRegex = /```action\n([\s\S]*?)```/g;
    let match;
    while ((match = actionRegex.exec(reply)) !== null) {
      try { actions.push(JSON.parse(match[1].trim())); } catch {}
    }
    // Clean reply text (remove action blocks for display)
    const cleanReply = reply.replace(/```action\n[\s\S]*?```/g, '').trim();
    res.json({ reply: cleanReply, actions: actions.length > 0 ? actions : undefined });
  } catch (err) {
    console.error('POST /scripts/:id/chat error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// ── Video-to-Script Frame Matching ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

const multer = require('multer');
const videoUpload = multer({ dest: os.tmpdir(), limits: { fileSize: 500 * 1024 * 1024 } });

// POST /api/scripts/:id/video-match — start video matching job
router.post('/:id/video-match', videoUpload.single('video'), async (req, res) => {
  try {
    const scriptId = req.params.id;
    const { rows } = await db.query('SELECT scenes, title FROM scripts WHERE id = $1', [scriptId]);
    if (!rows[0]) return res.status(404).json({ error: 'Script not found' });
    const scenes = rows[0].scenes || [];
    if (scenes.length === 0) return res.status(400).json({ error: 'Script has no scenes' });

    const { youtube_url, dropbox_path, drive_file_id } = req.body;

    // Create job
    const { rows: jobRows } = await db.query(
      `INSERT INTO video_match_jobs (script_id, status, video_source) VALUES ($1, 'pending', $2) RETURNING id`,
      [scriptId, req.file ? 'upload' : youtube_url ? 'youtube' : dropbox_path ? 'dropbox' : drive_file_id ? 'google_drive' : 'unknown']
    );
    const jobId = jobRows[0].id;
    res.json({ job_id: jobId });

    // Process in background
    (async () => {
      try {
        let videoPath;

        // Step 1: Get the video file
        await db.query(`UPDATE video_match_jobs SET status = 'downloading' WHERE id = $1`, [jobId]);
        if (req.file) {
          videoPath = req.file.path;
        } else if (youtube_url) {
          videoPath = await downloadYouTubeVideo(youtube_url);
        } else if (drive_file_id) {
          // Download from Google Drive
          const { rows: settingsRows } = await db.query("SELECT google_tokens FROM settings WHERE brand_id = 'particle'");
          if (settingsRows[0]?.google_tokens) {
            const tokens = typeof settingsRows[0].google_tokens === 'string' ? JSON.parse(settingsRows[0].google_tokens) : settingsRows[0].google_tokens;
            const oauth2 = getOAuth2Client();
            oauth2.setCredentials(tokens);
            const drive = google.drive({ version: 'v3', auth: oauth2 });
            const destPath = path.join(os.tmpdir(), `drive-${Date.now()}.mp4`);
            const dest = fs.createWriteStream(destPath);
            const driveRes = await drive.files.get({ fileId: drive_file_id, alt: 'media', supportsAllDrives: true }, { responseType: 'stream' });
            await new Promise((resolve, reject) => { driveRes.data.pipe(dest).on('finish', resolve).on('error', reject); });
            videoPath = destPath;
          }
        }
        if (!videoPath) throw new Error('No video source provided');

        // Step 2: Upload to Gemini File API
        await db.query(`UPDATE video_match_jobs SET status = 'uploading_to_gemini' WHERE id = $1`, [jobId]);
        const videoBuffer = fs.readFileSync(videoPath);
        const { fileUri } = await uploadToGeminiFileAPI(videoBuffer, 'video/mp4', `script-${scriptId}-video`);
        await db.query(`UPDATE video_match_jobs SET gemini_file_uri = $1 WHERE id = $2`, [fileUri, jobId]);

        // Step 3: Analyze with Gemini
        await db.query(`UPDATE video_match_jobs SET status = 'analyzing' WHERE id = $1`, [jobId]);
        const stripHtml = (s) => (s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        const scenesPrompt = scenes.map((s, i) => `Scene ${i + 1} (ID: ${s.id}):\n  Location: ${s.location || 'N/A'}\n  What We See: ${stripHtml(s.what_we_see) || 'N/A'}\n  What We Hear: ${stripHtml(s.what_we_hear) || 'N/A'}`).join('\n\n');

        const prompt = `You are analyzing a video to match it against a script. For each scene, find the BEST matching moment in the video.

SCRIPT (${scenes.length} scenes):
${scenesPrompt}

MATCHING STRATEGY:
1. Listen for dialogue/voiceover matching "What We Hear" text (highest priority)
2. Look for visuals matching "What We See" descriptions
3. Use both audio+visual when available
4. Timestamps must follow scene order (Scene 2 after Scene 1)
5. Spread timestamps across the video (don't cluster)
6. If no match found, estimate based on position in video

Return ONLY valid JSON:
{"matches": [
  {"scene_id": "...", "scene_number": 1, "timestamp_sec": 12.5, "confidence": 0.9, "match_type": "audio+visual", "description": "Brief reason"}
]}`;

        const analysisResult = await callGeminiWithFile(prompt, fileUri, 'video/mp4');
        let matches = [];
        try {
          const jsonMatch = analysisResult.match(/\{[\s\S]*\}/);
          if (jsonMatch) matches = JSON.parse(jsonMatch[0]).matches || [];
        } catch { matches = []; }

        // Step 4: Extract frames
        await db.query(`UPDATE video_match_jobs SET status = 'extracting_frames' WHERE id = $1`, [jobId]);
        for (const match of matches) {
          try {
            const frameBuffer = await extractFrameAtTimestamp(videoPath, match.timestamp_sec);
            // Upload to Google Drive
            const { rows: settingsRows } = await db.query("SELECT google_tokens FROM settings WHERE brand_id = 'particle'");
            if (settingsRows[0]?.google_tokens) {
              const tokens = typeof settingsRows[0].google_tokens === 'string' ? JSON.parse(settingsRows[0].google_tokens) : settingsRows[0].google_tokens;
              const oauth2 = getOAuth2Client();
              oauth2.setCredentials(tokens);
              const drive = google.drive({ version: 'v3', auth: oauth2 });
              const url = await driveUploadBuffer({ drive, fileName: `frame-scene${match.scene_number}-${Math.round(match.timestamp_sec)}s.jpg`, buffer: frameBuffer, mimeType: 'image/jpeg', subfolder: 'Scripts/Video Frames' });
              match.frame_url = url;
            } else {
              // Fallback: base64 data URL
              match.frame_url = `data:image/jpeg;base64,${frameBuffer.toString('base64')}`;
            }
          } catch (frameErr) {
            console.warn(`Frame extraction failed for scene ${match.scene_number}:`, frameErr.message);
            match.frame_url = null;
          }
        }

        // Cleanup temp video
        try { fs.unlinkSync(videoPath); } catch {}

        // Done
        await db.query(
          `UPDATE video_match_jobs SET status = 'complete', match_results = $1, completed_at = NOW() WHERE id = $2`,
          [JSON.stringify(matches), jobId]
        );
      } catch (err) {
        console.error('Video match job failed:', err);
        await db.query(`UPDATE video_match_jobs SET status = 'failed', error = $1 WHERE id = $2`, [err.message, jobId]);
      }
    })();
  } catch (err) {
    console.error('POST /scripts/:id/video-match error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/scripts/:id/video-match/:jobId — poll job status
router.get('/:id/video-match/:jobId', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM video_match_jobs WHERE id = $1 AND script_id = $2', [req.params.jobId, req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Job not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scripts/:id/video-match/:jobId/apply — apply matched frames to scenes
router.post('/:id/video-match/:jobId/apply', async (req, res) => {
  try {
    const { selected_scene_ids } = req.body; // optional: only apply these
    const { rows: jobRows } = await db.query('SELECT match_results FROM video_match_jobs WHERE id = $1', [req.params.jobId]);
    if (!jobRows[0]) return res.status(404).json({ error: 'Job not found' });
    const matches = jobRows[0].match_results || [];

    const { rows: scriptRows } = await db.query('SELECT scenes FROM scripts WHERE id = $1', [req.params.id]);
    if (!scriptRows[0]) return res.status(404).json({ error: 'Script not found' });
    const scenes = scriptRows[0].scenes || [];

    // Apply matched frames
    const updatedScenes = scenes.map(s => {
      const match = matches.find(m => m.scene_id === s.id);
      if (!match || !match.frame_url) return s;
      if (selected_scene_ids && !selected_scene_ids.includes(s.id)) return s;
      return {
        ...s,
        images: [...(s.images || []), {
          id: crypto.randomUUID(),
          url: match.frame_url,
          prompt: `Video frame at ${match.timestamp_sec}s — ${match.description || ''}`,
          source: 'video-extract',
        }],
      };
    });

    await db.query('UPDATE scripts SET scenes = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(updatedScenes), req.params.id]);
    res.json({ success: true, updated: updatedScenes.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scripts/:id/approve — approve + Drive export + Slack
router.post('/:id/approve', async (req, res) => {
  try {
    const { rows: cur } = await db.query(
      `SELECT s.*, p.project_name FROM scripts s LEFT JOIN productions p ON s.production_id = p.id WHERE s.id = $1`,
      [req.params.id]
    );
    if (!cur[0]) return res.status(404).json({ error: 'Not found' });
    const script = cur[0];

    // Auto-save version
    const { rows: vRows } = await db.query(
      'SELECT COALESCE(MAX(version_number), 0) + 1 AS next FROM script_versions WHERE script_id = $1',
      [req.params.id]
    );
    await db.query(
      'INSERT INTO script_versions (id, script_id, version_number, scenes, title, changed_by_name, change_summary) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [crypto.randomUUID(), req.params.id, vRows[0].next, JSON.stringify(script.scenes), script.title, req.user?.name || req.user?.email || 'Unknown', 'Pre-approval snapshot']
    );

    // Update status
    let driveUrl = script.drive_url;
    try {
      const { drive } = await getGoogleDrive();
      const year = new Date().getFullYear();
      const subfolder = `${year}/${script.production_id ? `${script.production_id} ${script.project_name || ''}`.trim() : 'Scripts'}/Scripts`;
      const pdfContent = `Script: ${script.title}\nStatus: Approved\nScenes: ${(script.scenes || []).length}\nGenerated: ${new Date().toISOString()}`;
      driveUrl = await driveUploadBuffer({
        drive,
        fileName: `${script.title} - Approved.txt`,
        buffer: Buffer.from(pdfContent, 'utf-8'),
        mimeType: 'text/plain',
        subfolder,
      });
    } catch (driveErr) {
      console.warn('Drive upload failed:', driveErr.message);
    }

    const { rows } = await db.query(
      'UPDATE scripts SET status = $1, drive_url = $2, updated_at = NOW() WHERE id = $3 RETURNING *',
      ['approved', driveUrl, req.params.id]
    );

    sendSlackNotification(slackScriptPayload({
      emoji: '✅', headline: 'Script approved',
      script: { ...rows[0], project_name: script.project_name, scenes: script.scenes },
      fields: [
        `*Approved by:* ${req.user?.name || req.user?.email || 'Unknown'}`,
        driveUrl ? `*Drive:* <${driveUrl}|View PDF>` : null,
      ].filter(Boolean),
    }));
    res.json(rows[0]);
  } catch (err) {
    console.error('POST /scripts/:id/approve error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/scripts/:id/comments — add comment (author_name accepted from body for public/anonymous users)
router.post('/:id/comments', async (req, res) => {
  try {
    const { scene_id, cell, selected_text, text, author_name, parent_comment_id } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const authorName = req.user?.name || req.user?.email || author_name || 'Anonymous';
    const { rows } = await db.query(
      'INSERT INTO script_comments (id, script_id, scene_id, cell, selected_text, text, author_name, parent_comment_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [crypto.randomUUID(), req.params.id, scene_id || null, cell || null, selected_text || null, text, authorName, parent_comment_id || null]
    );
    // Fetch script + production for Slack
    const { rows: s } = await db.query(
      `SELECT s.id, s.title, s.status, s.production_id, s.scenes, p.project_name FROM scripts s LEFT JOIN productions p ON s.production_id = p.id WHERE s.id = $1`,
      [req.params.id]
    ).catch(() => ({ rows: [] }));
    if (s[0]) {
      // Try to find the scene location from the scenes JSONB
      const sceneRow = scene_id ? (s[0].scenes || []).find(sc => sc.id === scene_id) : null;
      const location = sceneRow?.location || '';
      const cellLabel = { what_we_see: 'What We See', what_we_hear: 'What We Hear', location: 'Location', scene: 'Scene' }[cell] || cell || '';
      const snippetNote = selected_text ? `\n> _"${selected_text.substring(0, 80)}${selected_text.length > 80 ? '...' : ''}"_` : '';
      sendSlackNotification(slackScriptPayload({
        emoji: '💬', headline: `New comment by ${authorName}`,
        script: s[0],
        fields: [
          location ? `*Scene:* ${location}` : null,
          cellLabel ? `*In:* ${cellLabel}` : null,
          `*Comment:* "${text.substring(0, 120)}${text.length > 120 ? '...' : ''}"`,
        ].filter(Boolean),
        footer: snippetNote,
      }));
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('POST /scripts/:id/comments error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PATCH /api/scripts/:id/comments/:cId — resolve/ignore comment
router.patch('/:id/comments/:cId', async (req, res) => {
  try {
    const { status } = req.body; // 'resolved' | 'ignored' | 'open'
    const resolvedByName = req.user?.name || req.user?.email || 'Unknown';
    const { rows } = await db.query(
      `UPDATE script_comments SET status = $1, resolved_at = CASE WHEN $1 != 'open' THEN NOW() ELSE NULL END, resolved_by_name = CASE WHEN $1 != 'open' THEN $2 ELSE NULL END WHERE id = $3 AND script_id = $4 RETURNING *`,
      [status || 'open', resolvedByName, req.params.cId, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Comment not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PATCH /scripts/:id/comments/:cId error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/scripts/:id — update script
router.put('/:id', async (req, res) => {
  try {
    const { scenes, title, description, status, production_id, voice_settings } = req.body;
    const brand_id = req.user?.brand_id || null;

    // Fetch current status before update (for change detection)
    const { rows: prev } = await db.query(
      'SELECT status FROM scripts WHERE id = $1 AND ($2::text IS NULL OR brand_id = $2)',
      [req.params.id, brand_id]
    );
    if (!prev[0]) return res.status(404).json({ error: 'Not found' });
    const prevStatus = prev[0].status;

    const { rows } = await db.query(
      `UPDATE scripts SET
        scenes        = COALESCE($1, scenes),
        title         = COALESCE($2, title),
        description   = COALESCE($3, description),
        status        = COALESCE($4, status),
        production_id = COALESCE($5, production_id),
        voice_settings = COALESCE($8, voice_settings),
        updated_at    = NOW()
       WHERE id = $6 AND ($7::text IS NULL OR brand_id = $7)
       RETURNING *,
         jsonb_array_length(COALESCE(scenes, '[]'::jsonb)) AS scene_count`,
      [
        scenes !== undefined ? JSON.stringify(scenes) : null,
        title || null,
        description !== undefined ? (description || null) : null,
        status || null,
        production_id !== undefined ? (production_id || null) : null,
        req.params.id,
        brand_id,
        voice_settings !== undefined ? JSON.stringify(voice_settings) : null,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    // Slack on status changes
    if (status && status !== prevStatus) {
      const { rows: p } = await db.query('SELECT project_name FROM productions WHERE id = $1', [rows[0].production_id]).catch(() => ({ rows: [] }));
      const scriptWithProd = { ...rows[0], project_name: p[0]?.project_name || null };
      const byUser = req.user?.name || req.user?.email || null;
      if (status === 'review') {
        sendSlackNotification(slackScriptPayload({
          emoji: '👀', headline: 'Script sent for review',
          script: scriptWithProd,
          fields: byUser ? [`*Sent by:* ${byUser}`] : [],
        }));
      } else if (status === 'draft') {
        sendSlackNotification(slackScriptPayload({
          emoji: '📄', headline: 'Script moved back to draft',
          script: scriptWithProd,
          fields: byUser ? [`*By:* ${byUser}`] : [],
        }));
      } else if (status === 'archived') {
        sendSlackNotification(slackScriptPayload({
          emoji: '🗄️', headline: 'Script archived',
          script: scriptWithProd,
          fields: byUser ? [`*By:* ${byUser}`] : [],
        }));
      }
    }
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /scripts/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/scripts/:id
router.delete('/:id', async (req, res) => {
  try {
    const brand_id = req.user?.brand_id || null;
    const { rowCount } = await db.query(
      'DELETE FROM scripts WHERE id = $1 AND ($2::text IS NULL OR brand_id = $2)',
      [req.params.id, brand_id]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Not found or access denied' });
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /scripts/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── ElevenLabs TTS helpers ────────────────────────────────────────────────────

// Words per minute for professional VO narration
const VO_WPM = 130;

function estimateDuration(text) {
  if (!text?.trim()) return 0;
  const words = text.trim().split(/\s+/).length;
  return Math.round((words / VO_WPM) * 60); // seconds
}

async function elevenLabsTTS(text, voiceIdOverride, options = {}) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY not configured');
  const voiceId = voiceIdOverride || process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
  // Strip muted/non-spoken spans, HTML tags, and decode entities
  const cleanText = text
    .replace(/<span[^>]*(?:data-muted|class="vo-muted")[^>]*>[\s\S]*?<\/span>/gi, '') // strip muted spans first (before HTML strip)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\[[^\]]*\]/g, ' ')   // strip [stage directions]
    .replace(/\([^)]*\)/g, ' ')    // strip (parenthetical notes)
    .replace(/\s+/g, ' ')
    .trim()
    .substring(0, 2500);
  if (!cleanText) throw new Error('No text to synthesize after cleaning');
  const speed = typeof options.speed === 'number' ? Math.max(0.25, Math.min(4.0, options.speed)) : 1.0;
  const stability = typeof options.stability === 'number' ? options.stability : 0.5;
  const similarity_boost = typeof options.similarity_boost === 'number' ? options.similarity_boost : 0.75;
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify({
      text: cleanText,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability, similarity_boost, style: 0, use_speaker_boost: true },
      ...(speed !== 1.0 ? { speed } : {}),
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    // Fallback: try older model if new one fails
    if (res.status === 400 || res.status === 422) {
      const res2 = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
        body: JSON.stringify({
          text: cleanText,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability, similarity_boost },
        }),
      });
      if (res2.ok) {
        const buffer2 = Buffer.from(await res2.arrayBuffer());
        return buffer2.toString('base64');
      }
    }
    throw new Error(`ElevenLabs error: ${res.status} — ${err.slice(0, 200)}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  return buffer.toString('base64');
}

// POST /api/scripts/voice-preview — preview a voice (no script needed)
router.post('/voice-preview', async (req, res) => {
  try {
    const { voice_id, text, speed, stability, similarity_boost } = req.body;
    const vid = voice_id || '21m00Tcm4TlvDq8ikWAM';
    const previewText = (text || 'This is a preview of how your voiceover will sound in the final commercial.').substring(0, 200);
    const audioBase64 = await elevenLabsTTS(previewText, vid, { speed, stability, similarity_boost });
    res.json({ audio_base64: audioBase64, mime_type: 'audio/mpeg' });
  } catch (err) {
    console.error('POST /scripts/voice-preview error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/scripts/:id/tts — generate VO for a single scene
router.post('/:id/tts', async (req, res) => {
  try {
    const { scene_id, voice_id, speed, stability, similarity_boost } = req.body;
    if (!scene_id) return res.status(400).json({ error: 'scene_id required' });
    const { rows } = await db.query('SELECT scenes FROM scripts WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Script not found' });
    const scene = (rows[0].scenes || []).find(s => s.id === scene_id);
    if (!scene) return res.status(404).json({ error: 'Scene not found' });
    const rawText = scene.what_we_hear || '';
    if (!rawText.trim()) return res.status(400).json({ error: 'Scene has no VO text' });
    const audioBase64 = await elevenLabsTTS(rawText, voice_id, { speed, stability, similarity_boost });
    // Estimate duration from clean text (strip muted first, then HTML)
    const cleanForEstimate = rawText
      .replace(/<span[^>]*(?:data-muted|class="vo-muted")[^>]*>[\s\S]*?<\/span>/gi, '')
      .replace(/<[^>]*>/g, '').trim();
    const estimated = estimateDuration(cleanForEstimate);
    res.json({ audio_base64: audioBase64, mime_type: 'audio/mpeg', duration_seconds: estimated });
  } catch (err) {
    console.error('POST /scripts/:id/tts error:', err);
    res.status(500).json({ error: err.message });
  }
});


// POST /api/scripts/:id/tts-full — generate full script VO as downloadable MP3
router.post('/:id/tts-full', async (req, res) => {
  try {
    const { voice_id, speed, stability, similarity_boost } = req.body;
    const { rows } = await db.query('SELECT scenes, title FROM scripts WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Script not found' });
    const scenes = rows[0].scenes || [];
    const scriptTitle = rows[0].title || 'script';

    // Collect all VO text — strip muted spans FIRST, then HTML, NO scene labels (just clean VO text)
    const parts = scenes
      .map((s) => {
        const raw = (s.what_we_hear || '')
          .replace(/<span[^>]*(?:data-muted|class="vo-muted")[^>]*>[\s\S]*?<\/span>/gi, '') // muted spans first
          .replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')
          .replace(/\[[^\]]*\]/g, ' ').replace(/\([^)]*\)/g, ' ')  // stage directions
          .replace(/\s+/g, ' ').trim();
        return raw || null;
      })
      .filter(Boolean);

    if (parts.length === 0) return res.status(400).json({ error: 'No VO text found in any scene' });

    const fullText = parts.join('\n\n').substring(0, 5000); // ElevenLabs limit
    const audioBase64 = await elevenLabsTTS(fullText, voice_id, { speed, stability, similarity_boost });
    const buf = Buffer.from(audioBase64, 'base64');
    const filename = `${scriptTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_vo.mp3`;
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    console.error('POST /scripts/:id/tts-full error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/scripts/:id/duration — word-count duration estimate for all scenes (no ElevenLabs call)
router.get('/:id/duration', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT scenes FROM scripts WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const scenes = rows[0].scenes || [];
    const durations = scenes.map(s => ({
      scene_id: s.id,
      text: s.what_we_hear || '',
      estimated_seconds: estimateDuration(s.what_we_hear),
    }));
    const total = durations.reduce((sum, d) => sum + d.estimated_seconds, 0);
    res.json({ durations, total_seconds: total });
  } catch (err) {
    console.error('GET /scripts/:id/duration error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

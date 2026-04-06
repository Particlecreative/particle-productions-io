const router  = require('express').Router();
const db      = require('../db');
const crypto  = require('crypto');
const { google } = require('googleapis');
const mammoth = require('mammoth');
const { verifyJWT } = require('../middleware/auth');

const DRIVE_FOLDER_ID = process.env.DRIVE_FOLDER_ID;

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
      `SELECT s.*, p.project_name, p.stage FROM scripts s
       LEFT JOIN productions p ON s.production_id = p.id
       WHERE s.share_token = $1`,
      [req.params.token]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Script not found or link expired' });
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
    const { scene_id, cell, selected_text, text, author_name } = req.body;
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
      `INSERT INTO script_comments (id, script_id, scene_id, cell, selected_text, text, author_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [crypto.randomUUID(), s[0].id, scene_id || null, cell || null, selected_text || null, text.trim(), authorName]
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

// ── PUBLIC: update script via share token (edit mode) ────────────────────────
router.put('/share/:token', async (req, res) => {
  try {
    const { scenes, title } = req.body;
    const { rows } = await db.query(
      `UPDATE scripts SET scenes = $1, title = COALESCE($2, title), updated_at = NOW()
       WHERE share_token = $3 AND share_mode = 'edit'
       RETURNING *`,
      [JSON.stringify(scenes || []), title, req.params.token]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Script not found or not in edit mode' });
    res.json(rows[0]);
  } catch (err) {
    console.error('PUT /scripts/share/:token error:', err);
    res.status(500).json({ error: 'Server error' });
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

      const { drive, oauth2 } = await getGoogleDrive();

      if (isSlidesUrl) {
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
        // Google Docs — primary: Docs API (richest structure), fallback: HTML export → PDF export
        const accessToken = (await oauth2.getAccessToken()).token;
        let docContent = '';
        let contentLabel = '';

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

        if (docContent !== null) {
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
        || mimeType === 'application/msword';
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
    const { scene_id, prompt: promptOverride, replace_image_id, character_profiles, style_notes, reference_image, reference_image_url, product_info, character_photos } = req.body;
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

    // All existing image prompts for visual consistency
    const existingImagePrompts = scenes
      .filter(s => s.id !== scene_id)
      .flatMap(s => (s.images || []).filter(img => img.prompt).map(img => img.prompt))
      .slice(0, 5);

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
- Cinematic storyboard frame style
- Include camera angle, lighting, composition, mood
- If characters are listed above, include their exact visual descriptions
- Match the visual style of existing frames for consistency
- Do NOT include text overlays, titles, or watermarks
- Return ONLY the prompt text, nothing else`;

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
    await db.query('UPDATE scripts SET share_token = $1, share_mode = $2 WHERE id = $3', [token, mode, req.params.id]);
    res.json({ share_token: token, share_mode: mode });
  } catch (err) {
    console.error('POST /scripts/:id/share error:', err);
    res.status(500).json({ error: 'Server error' });
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
    const { scene_id, cell, selected_text, text, author_name } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const authorName = req.user?.name || req.user?.email || author_name || 'Anonymous';
    const { rows } = await db.query(
      'INSERT INTO script_comments (id, script_id, scene_id, cell, selected_text, text, author_name) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [crypto.randomUUID(), req.params.id, scene_id || null, cell || null, selected_text || null, text, authorName]
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
    const { scenes, title, status, production_id } = req.body;
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
        status        = COALESCE($3, status),
        production_id = COALESCE($4, production_id),
        updated_at    = NOW()
       WHERE id = $5 AND ($6::text IS NULL OR brand_id = $6)
       RETURNING *,
         jsonb_array_length(COALESCE(scenes, '[]'::jsonb)) AS scene_count`,
      [
        scenes !== undefined ? JSON.stringify(scenes) : null,
        title || null,
        status || null,
        production_id !== undefined ? (production_id || null) : null,
        req.params.id,
        brand_id,
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
  // Strip any remaining HTML tags and decode HTML entities
  const cleanText = text
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
    // Estimate duration from clean text
    const cleanForEstimate = rawText.replace(/<[^>]*>/g, '').trim();
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

    // Collect all VO text, stripping HTML, with scene number labels
    const parts = scenes
      .map((s, i) => {
        const raw = (s.what_we_hear || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
        return raw ? `Scene ${i + 1}. ${raw}` : null;
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

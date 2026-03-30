const router  = require('express').Router();
const db      = require('../db');
const crypto  = require('crypto');
const { google } = require('googleapis');
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
  return file.data.webViewLink;
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
  parts.push({ text: prompt });
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
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'prompt is required' });
    const text = await callClaude(prompt, SCENE_SYSTEM_PROMPT);
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
        // Google Docs — export via Drive API as PDF, then process with Gemini
        // (avoids needing Google Docs API to be enabled separately)
        const accessToken = (await oauth2.getAccessToken()).token;
        const exportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/pdf`;
        const exportRes = await fetch(exportUrl, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!exportRes.ok) {
          // Fall back to plain text export if PDF fails
          const textExportUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
          const textRes = await fetch(textExportUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
          if (!textRes.ok) throw new Error(`Could not export Google Doc (${textRes.status}). Make sure the document is shared with the connected Google account.`);
          const fullText = await textRes.text();
          const text = await callClaude(
            `Extract this script/storyboard document into a JSON scenes array. The document content:\n\n${fullText.substring(0, 40000)}`,
            SCENE_SYSTEM_PROMPT
          );
          scenes = parseSceneJson(text);
        } else {
          // Send PDF to Gemini for extraction
          const pdfBuffer = Buffer.from(await exportRes.arrayBuffer());
          const pdfBase64 = pdfBuffer.toString('base64');
          const importPrompt = `Analyze this script, storyboard, or document and extract it into a structured JSON scenes array.

For each scene/section/slide:
- "location": scene heading or setting (e.g. "INT. STUDIO - DAY"), empty string if none
- "what_we_see": visual directions, action description, visual text on screen
- "what_we_hear": dialogue, voiceover, script text, audio directions
- "duration": timing if mentioned (e.g. "5s", "10s"), empty string if none
- "images_in_source": array of strings describing any images/visuals physically embedded in this scene/slide. Empty array if no images.

Return ONLY this JSON object with NO markdown:
{"scenes":[{"id":"<uuid-v4>","order":0,"location":"","what_we_see":"","what_we_hear":"","duration":"","collapsed":false,"images_in_source":[],"images":[]}]}`;
          let text;
          if (process.env.GEMINI_API_KEY) {
            text = await callGemini(importPrompt, pdfBase64, 'application/pdf');
          } else {
            text = await callClaude(importPrompt, SCENE_SYSTEM_PROMPT);
          }
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
      if (process.env.GEMINI_API_KEY) {
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

// POST /api/scripts/:id/ai-image — Gemini image generation (Nano Banana 2)
// Accepts optional: prompt (override), replace_image_id (replace vs append), character_profiles, style_notes
router.post('/:id/ai-image', async (req, res) => {
  try {
    const { scene_id, prompt: promptOverride, replace_image_id, character_profiles, style_notes, reference_image, reference_image_url } = req.body;
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
        ? `\nCHARACTERS IN THIS PRODUCTION (maintain exact visual consistency for each):\n${character_profiles.map(c => `- ${c.name}: ${c.description}`).join('\n')}\n`
        : '';

      // Build style notes context
      const styleContext = style_notes
        ? `\nVISUAL STYLE FOR THIS PRODUCTION:\n${style_notes}\n`
        : '';

      // Ask Claude to craft a detailed image generation prompt
      const contextPrompt = `You are writing an image generation prompt for a professional storyboard frame.

Script title: "${rows[0].title}"
${charContext}${styleContext}
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
    if (reference_image?.base64) {
      refImages.push({ base64: reference_image.base64, mimeType: reference_image.mimeType || 'image/jpeg' });
    } else if (reference_image_url) {
      // SSRF guard — block internal/private IPs
      try {
        const parsedRefUrl = new URL(reference_image_url);
        const isInternal = /^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|169\.254\.)/.test(parsedRefUrl.hostname);
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

    // If reference image is provided, tell Claude to incorporate it
    if (refImages.length > 0 && !promptOverride) {
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

module.exports = router;

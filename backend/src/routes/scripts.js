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

async function callGemini(prompt, fileBase64, mimeType) {
  if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured in .env');
  const parts = [{ text: prompt }];
  if (fileBase64) parts.push({ inline_data: { mime_type: mimeType, data: fileBase64 } });
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts }] }),
    }
  );
  if (!resp.ok) throw new Error(`Gemini API error: ${resp.statusText}`);
  const data = await resp.json();
  return data.candidates[0].content.parts[0].text;
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

async function sendSlackNotification(message) {
  const webhookUrl = process.env.SLACK_SCRIPTS_WEBHOOK_URL;
  if (!webhookUrl) return;
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message }),
  }).catch(err => console.error('Slack notification failed:', err.message));
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
    const { brand_id, production_id, status } = req.query;
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
    const { rows } = await db.query(
      `SELECT s.*, p.project_name, p.stage,
              (SELECT COUNT(*)::int FROM script_comments sc WHERE sc.script_id = s.id AND sc.status = 'open') AS open_comments
       FROM scripts s LEFT JOIN productions p ON s.production_id = p.id
       WHERE s.id = $1`,
      [req.params.id]
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
    const { brand_id, production_id, title, scenes } = req.body;
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
    sendSlackNotification(`📝 New script "${rows[0].title}" added${prodName ? ` to ${prodName}` : ''}`);
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

        scenes = slideList.map((slide, idx) => {
          let whatWeSee = '';
          let whatWeHear = '';
          // Extract text from shapes
          for (const element of slide.pageElements || []) {
            const text = element.shape?.text?.textElements?.map(te => te.textRun?.content || '').join('').trim();
            if (!text) continue;
            // Speaker notes go to "what we hear"
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
          return {
            id: crypto.randomUUID(),
            order: idx,
            location: '',
            what_we_see: whatWeSee.trim(),
            what_we_hear: whatWeHear.trim(),
            duration: '',
            collapsed: false,
            images: [],
          };
        });
      } else {
        // Google Docs — use Claude to parse the content
        const docs = google.docs({ version: 'v1', auth: oauth2 });
        const doc = await docs.documents.get({ documentId: fileId });
        const content = doc.data.body?.content || [];
        let fullText = '';
        for (const block of content) {
          if (block.paragraph) {
            for (const el of block.paragraph.elements || []) {
              fullText += (el.textRun?.content || '');
            }
          } else if (block.table) {
            for (const row of block.table.tableRows || []) {
              for (const cell of row.tableCells || []) {
                for (const para of cell.content || []) {
                  for (const el of para.paragraph?.elements || []) {
                    fullText += (el.textRun?.content || '') + '\t';
                  }
                }
                fullText += '|';
              }
              fullText += '\n';
            }
          }
        }
        const text = await callClaude(
          `Extract this script/storyboard document into a JSON scenes array. The document content:\n\n${fullText}`,
          SCENE_SYSTEM_PROMPT
        );
        scenes = parseSceneJson(text);
      }
    } else if (fileBase64) {
      // File upload — use Gemini if available, else Claude
      const importPrompt = `Extract this script/storyboard document into a JSON scenes array. Identify scenes by their visual and audio content. Map visual descriptions to "what_we_see" and audio/voiceover/dialogue to "what_we_hear". Set location from scene headings. Return ONLY the JSON object.`;
      let text;
      if (process.env.GEMINI_API_KEY) {
        text = await callGemini(importPrompt, fileBase64, mimeType || 'application/pdf');
      } else {
        // Use Claude with vision if image, else send as text
        const isImage = mimeType?.startsWith('image/');
        if (isImage) {
          text = await callClaude(importPrompt, SCENE_SYSTEM_PROMPT, [{ base64: fileBase64, mimeType }]);
        } else {
          // For non-image files, try to extract text and send to Claude
          text = await callClaude(
            `The file "${fileName || 'script'}" has been uploaded. ${importPrompt}\n\nFile content (base64): [file provided as attachment]`,
            SCENE_SYSTEM_PROMPT
          );
        }
      }
      scenes = parseSceneJson(text);
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

// POST /api/scripts/:id/ai-image — NanoBanano image generation
router.post('/:id/ai-image', async (req, res) => {
  try {
    const { scene_id, prompt } = req.body;
    if (!process.env.NANOBANANO_API_KEY) {
      return res.status(501).json({ error: 'NANOBANANO_API_KEY not configured. Add it to your .env file.' });
    }
    // NanoBanano API call — update endpoint URL when API details are available
    const nbRes = await fetch('https://api.nanobanano.com/v1/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.NANOBANANO_API_KEY}`,
      },
      body: JSON.stringify({ prompt, width: 1024, height: 576 }),
    });
    if (!nbRes.ok) throw new Error(`NanoBanano API error: ${nbRes.statusText}`);
    const nbData = await nbRes.json();
    const imageUrl = nbData.url || nbData.image_url || nbData.data?.url;
    if (!imageUrl) throw new Error('NanoBanano did not return an image URL');

    // Upload to Drive to persist the image
    let finalUrl = imageUrl;
    try {
      const imgRes = await fetch(imageUrl);
      const imgBuffer = Buffer.from(await imgRes.arrayBuffer());
      const { drive } = await getGoogleDrive();
      finalUrl = await driveUploadBuffer({
        drive,
        fileName: `ai-image-${Date.now()}.jpg`,
        buffer: imgBuffer,
        mimeType: 'image/jpeg',
        subfolder: 'Scripts/AI Images',
      });
    } catch (driveErr) {
      console.warn('Could not upload AI image to Drive:', driveErr.message);
    }

    // Add image to scene
    const { rows } = await db.query('SELECT scenes FROM scripts WHERE id = $1', [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: 'Script not found' });
    const scenes = rows[0].scenes || [];
    const updated = scenes.map(s => {
      if (s.id !== scene_id) return s;
      return { ...s, images: [...(s.images || []), { id: crypto.randomUUID(), url: finalUrl, prompt, source: 'ai' }] };
    });
    await db.query('UPDATE scripts SET scenes = $1, updated_at = NOW() WHERE id = $2', [JSON.stringify(updated), req.params.id]);
    res.json({ url: finalUrl });
  } catch (err) {
    console.error('POST /scripts/:id/ai-image error:', err);
    res.status(500).json({ error: err.message || 'Image generation failed' });
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

    sendSlackNotification(`✅ Script "${script.title}" approved${script.project_name ? ` — ${script.project_name}` : ''}${driveUrl ? `\nDrive: ${driveUrl}` : ''}`);
    res.json(rows[0]);
  } catch (err) {
    console.error('POST /scripts/:id/approve error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/scripts/:id/comments — add comment
router.post('/:id/comments', async (req, res) => {
  try {
    const { scene_id, cell, selected_text, text } = req.body;
    if (!text) return res.status(400).json({ error: 'text is required' });
    const authorName = req.user?.name || req.user?.email || 'Unknown';
    const { rows } = await db.query(
      'INSERT INTO script_comments (id, script_id, scene_id, cell, selected_text, text, author_name) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *',
      [crypto.randomUUID(), req.params.id, scene_id || null, cell || null, selected_text || null, text, authorName]
    );
    // Fetch script title + production for Slack
    const { rows: s } = await db.query(
      `SELECT s.title, p.project_name, sc.location FROM scripts s LEFT JOIN productions p ON s.production_id = p.id, jsonb_to_recordset(s.scenes) AS sc(id TEXT, location TEXT) WHERE s.id = $1 AND sc.id = $2`,
      [req.params.id, scene_id]
    ).catch(() => ({ rows: [] }));
    const scriptTitle = s[0]?.title || 'Script';
    const location = s[0]?.location || '';
    sendSlackNotification(`💬 Comment on "${scriptTitle}"${location ? ` (${location})` : ''}: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);
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
    const { rows } = await db.query(
      `UPDATE scripts SET
        scenes       = COALESCE($1, scenes),
        title        = COALESCE($2, title),
        status       = COALESCE($3, status),
        production_id = COALESCE($4, production_id),
        updated_at   = NOW()
       WHERE id = $5 RETURNING *`,
      [
        scenes !== undefined ? JSON.stringify(scenes) : null,
        title || null,
        status || null,
        production_id !== undefined ? (production_id || null) : null,
        req.params.id,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });

    // Slack on status change to review
    if (status === 'review') {
      const { rows: p } = await db.query('SELECT project_name FROM productions WHERE id = $1', [rows[0].production_id]).catch(() => ({ rows: [] }));
      sendSlackNotification(`👀 "${rows[0].title}" is ready for review${p[0]?.project_name ? ` — ${p[0].project_name}` : ''}`);
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
    await db.query('DELETE FROM scripts WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE /scripts/:id error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

/**
 * Captain Caption — learn from history (Brain bootstrap, steps C–E of the spec).
 *
 *   C  Sort every imported comment: text / creative / process / noise, plus what was wrong → what it should be,
 *      any general house rule it implies, and (creative) a reusable lesson.
 *   D  Was it really fixed?  Video: the text at the comment's frame in that round vs the same moment of the next
 *      round (two stills).  Design: the pinned frame's text at the Figma version the comment was made on vs today.
 *   E  Merge into patterns (Opus) → PENDING Brain items with evidence (how often, who said it, products, examples).
 *      Nothing is used by the Captain until an admin approves it in the review queue.
 *
 * C and D run on the Message Batches API (half price). Everything is resumable: state, batch ids and the money spent
 * live in captain_import_runs.plan.learn, and each step only picks up comments it hasn't done yet.
 * Read-only towards Frame.io and Figma — never posts, edits or resolves anything.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const db = require('../../db');
const frameio = require('./frameio');
const figma = require('./figma');

const MODELS = { bulk: 'claude-sonnet-5-5', distil: 'claude-opus-5-5' };
// USD per 1M tokens (Anthropic first-party list prices); the Batch API bills half.
const PRICES = { 'claude-sonnet-5-5': { in: 2, out: 10 }, 'claude-opus-5-5': { in: 4, out: 20 }, 'claude-haiku-5-5': { in: 0.1, out: 0.5 } };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

let client = null;
function anthropic() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  if (!client) {
    const Anthropic = require('@anthropic-ai/sdk');
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 15 * 60 * 1000, maxRetries: 3 });
  }
  return client;
}

function costOf(usage, model, { batch = false } = {}) {
  const p = PRICES[model] || PRICES[MODELS.bulk];
  const u = usage || {};
  const usd = ((u.input_tokens || 0) * p.in + (u.cache_creation_input_tokens || 0) * p.in * 1.25
    + (u.cache_read_input_tokens || 0) * p.in * 0.1 + (u.output_tokens || 0) * p.out) / 1e6;
  return batch ? usd / 2 : usd;
}

// ── state ────────────────────────────────────────────────────────────────────
async function latestRun() {
  return (await db.query(`SELECT * FROM captain_import_runs WHERE status = 'done' ORDER BY id DESC LIMIT 1`)).rows[0] || null;
}
async function getState(runId) {
  return (await db.query(`SELECT plan->'learn' AS s FROM captain_import_runs WHERE id = $1`, [runId])).rows[0]?.s || {};
}
async function setState(runId, patch) {
  await db.query(`UPDATE captain_import_runs SET plan = jsonb_set(plan, '{learn}', COALESCE(plan->'learn', '{}'::jsonb) || $2::jsonb) WHERE id = $1`, [runId, JSON.stringify(patch)]);
}
async function addCost(runId, step, usd) {
  const s = await getState(runId);
  const cost = { ...(s.cost || {}) };
  cost[step] = +((cost[step] || 0) + usd).toFixed(4);
  cost.total = +Object.entries(cost).filter(([k]) => k !== 'total').reduce((a, [, v]) => a + v, 0).toFixed(4);
  await setState(runId, { cost });
}

// ── batch plumbing ───────────────────────────────────────────────────────────
const textOf = (msg) => (msg?.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
function parseJson(msg) { try { return JSON.parse(textOf(msg)); } catch { return null; } }

/** Submit requests as one or more batches (≤ ~60 MB each, so memory stays small) and remember their ids. */
async function submit(runId, step, requests) {
  const s = await getState(runId);
  const batches = { ...(s.batches || {}) };
  const list = [...(batches[step] || [])];
  let chunk = [], size = 0;
  const flush = async () => {
    if (!chunk.length) return;
    const b = await anthropic().messages.batches.create({ requests: chunk });
    list.push({ id: b.id, n: chunk.length, collected: false });
    batches[step] = list;
    await setState(runId, { batches });
    log(`${step}: submitted batch ${b.id} (${chunk.length} requests)`);
    chunk = []; size = 0;
  };
  for (const r of requests) {
    const len = JSON.stringify(r).length;
    if (chunk.length && (size + len > 60e6 || chunk.length >= 5000)) await flush();
    chunk.push(r); size += len;
  }
  await flush();
}

/** Wait for every uncollected batch of a step, then hand each result to onResult(custom_id, message|null, error). */
async function collect(runId, step, model, onResult) {
  for (;;) {
    const s = await getState(runId);
    const pending = (s.batches?.[step] || []).filter(b => !b.collected);
    if (!pending.length) return;
    for (const b of pending) {
      const info = await anthropic().messages.batches.retrieve(b.id);
      if (info.processing_status !== 'ended') { log(`${step}: batch ${b.id} ${info.processing_status} — ${JSON.stringify(info.request_counts)}`); continue; }
      let usd = 0, ok = 0, bad = 0;
      for await (const r of await anthropic().messages.batches.results(b.id)) {
        if (r.result.type === 'succeeded') {
          const msg = r.result.message;
          usd += costOf(msg.usage, model, { batch: true });
          if (msg.stop_reason === 'refusal' || msg.stop_reason === 'max_tokens') { bad++; await onResult(r.custom_id, null, msg.stop_reason); } else { ok++; await onResult(r.custom_id, msg, null); }
        } else { bad++; await onResult(r.custom_id, null, r.result.type); }
      }
      await addCost(runId, step, usd);
      const s2 = await getState(runId);
      const batches = { ...(s2.batches || {}) };
      batches[step] = (batches[step] || []).map(x => (x.id === b.id ? { ...x, collected: true, ok, bad, usd: +usd.toFixed(4) } : x));
      await setState(runId, { batches });
      log(`${step}: collected ${b.id} — ${ok} ok, ${bad} to redo, $${usd.toFixed(2)}`);
    }
    if ((await getState(runId)).batches?.[step]?.some(b => !b.collected)) await sleep(60000);
  }
}

/** One live call (used to redo the few batch requests that errored, were cut off or declined). */
async function live(runId, step, params) {
  const req = { ...params };
  let msg;
  try {
    msg = await anthropic().beta.messages.stream({ ...req, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }).finalMessage();
  } catch (e) {
    if (e?.status !== 400) throw e;
    msg = await anthropic().beta.messages.stream(req).finalMessage();
  }
  await addCost(runId, step, costOf(msg.usage, msg.model || req.model));
  if (msg.stop_reason === 'refusal') return null;
  return msg;
}

// ── step C: sort every comment ───────────────────────────────────────────────
const KINDS = ['spelling', 'grammar', 'punctuation', 'capitalisation', 'spacing', 'wording', 'price_offer', 'claim', 'brand_name',
  'product_name', 'missing_text', 'remove_text', 'cta', 'legal', 'subtitles', 'voiceover', 'other', 'none'];
const CLASSIFY_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['comments'],
  properties: {
    comments: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false, required: ['id', 'cat', 'kind', 'lang', 'found', 'fix', 'rule', 'lesson'],
        properties: {
          id: { type: 'string' },
          cat: { type: 'string', enum: ['text', 'creative', 'process', 'noise'] },
          kind: { type: 'string', enum: KINDS },
          lang: { type: 'string', enum: ['en', 'he', 'es', 'other', 'none'] },
          found: { type: 'string' }, fix: { type: 'string' }, rule: { type: 'string' }, lesson: { type: 'string' },
        },
      },
    },
  },
};
const CLASSIFY_SYSTEM = `You sort reviewer comments left on Particle's video ads (Frame.io) and design ads (Figma), so a proofreading bot can learn the team's standards. Particle is a men's skincare brand; most ads are in English, some in Hebrew or Spanish.

For every comment return one object with its id:
- cat:
  text — about the WORDS: on-screen text, subtitles/captions, voiceover script, headlines, prices, offers, discount codes, claims, brand and product names, spelling, grammar, punctuation, capitalisation, spacing, CTA wording, legal lines.
  creative — about how it looks or sounds: edit, pacing, cuts, music, sound effects, voiceover delivery, hook choice, footage, talent, product shots, layout, colour, font size or position, imagery.
  process — workflow and admin: uploading or exporting, versions ("see my comments on V1"), tagging someone, questions about status or files.
  noise — approvals, praise, acknowledgements ("Approved", "Nice!", "ok"), empty or meaningless.
- Shorthand: a comment that is just "*word" or "*phrase" (sometimes with a note in brackets, e.g. "*its (no apostrophe)") means "this should read: word/phrase". It is a text correction: fix = the starred text, found = the wrong version if you can infer it, else "".
- kind: for text comments the closest type (voiceover = a change to what the voiceover says; subtitles = caption timing or sync); "none" for the other categories.
- lang: the language of the ad copy the comment is about (he = Hebrew, es = Spanish); "none" when it isn't about copy.
- found: the wrong text exactly as it appears, if stated or clearly implied, else "". fix: the corrected or requested text, else "". Keep the original language and capitalisation.
- rule: only when the comment states or clearly implies a GENERAL house rule that applies beyond this one ad (e.g. "No period at the end of on-screen text", "Prices take the $ before the number", "Write 'Shop Now' in title case"). Else "".
- lesson: only for creative comments — one short GENERAL lesson another editor or designer could reuse (e.g. "Keep the product visible while stats are on screen"). Else "".
Replies appear indented under the comment they answer; judge each on its own, using the thread as context.
Return every id exactly once, in the order given.`;

const fmtTime = (frame, fps) => {
  if (frame == null) return '';
  const t = Math.max(0, (Number(frame) - 1) / (Number(fps) || 25));
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')} `;
};
const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

async function figmaFileNames() {
  const { rows } = await db.query(`SELECT file_key, figma_file_name FROM captain_import_assets WHERE asset_key LIKE 'figma-file:%'`);
  return Object.fromEntries(rows.map(r => [r.file_key, r.figma_file_name]));
}

/** Unsorted comments → requests of ≤ 40 comments, grouped by video round / Figma frame so threads stay together. */
async function classifyRequests({ limitRequests = null } = {}) {
  const names = await figmaFileNames();
  const { rows } = await db.query(
    `SELECT c.id, c.source, c.external_id, c.parent_external_id, c.author, c.text, c.frame, c.file_key, c.node_id, c.node_text, c.asset_id,
            a.item_name, a.product, a.department, a.round, a.rounds_total, a.fps, a.deliverable
       FROM captain_import_comments c LEFT JOIN captain_import_assets a ON a.id = c.asset_id
      WHERE c.category IS NULL AND COALESCE(trim(c.text), '') <> ''
      ORDER BY c.source, COALESCE(c.asset_id::text, c.file_key || ':' || COALESCE(c.node_id, '')), c.created_at`);
  const groups = new Map();
  for (const r of rows) {
    const key = r.asset_id ? `a${r.asset_id}` : `f${r.file_key}:${r.node_id || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const requests = [];
  const section = (list) => {
    const h = list[0];
    const head = h.source === 'frameio'
      ? `Video ad (Frame.io) · Task: ${h.item_name || '?'} · Product: ${h.product || '?'}${h.deliverable ? ` · ${h.deliverable}` : ''}${h.round ? ` · Round ${h.round} of ${h.rounds_total || h.round}` : ''}`
      : `Design ad (Figma file "${names[h.file_key] || h.file_key}")${h.item_name ? ` · Task: ${h.item_name} · Product: ${h.product || '?'}` : ' · not tied to a task'}${h.node_text ? ` · pinned layer text: "${clip(h.node_text, 200)}"` : ''}`;
    const ids = new Map(list.map(c => [c.external_id, c.id]));
    const lines = list.map(c => {
      const reply = c.parent_external_id ? `  ↳ reply${ids.has(c.parent_external_id) ? ` to [${ids.get(c.parent_external_id)}]` : ''} · ` : '';
      return `${reply}[${c.id}] ${c.source === 'frameio' ? fmtTime(c.frame, c.fps) : ''}${c.author || 'Guest'}: ${clip(c.text, 1200)}`;
    });
    return `${head}\n${lines.join('\n')}`;
  };
  // Several small groups share one request (each keeps its own header), ≤ 40 comments per request
  let packed = [], packedN = 0, firstId = null;
  const flush = () => {
    if (!packed.length) return;
    requests.push({
      custom_id: `c-${firstId}-${packedN}`,
      params: {
        model: MODELS.bulk, max_tokens: 12000,
        system: [{ type: 'text', text: CLASSIFY_SYSTEM, cache_control: { type: 'ephemeral' } }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema: CLASSIFY_SCHEMA } },
        messages: [{ role: 'user', content: packed.join('\n\n———\n\n') }],
      },
    });
    packed = []; packedN = 0; firstId = null;
  };
  for (const list of groups.values()) {
    for (let i = 0; i < list.length; i += 40) {
      const part = list.slice(i, i + 40);
      if (packedN + part.length > 40) flush();
      if (firstId == null) firstId = part[0].id;
      packed.push(section(part));
      packedN += part.length;
    }
  }
  flush();
  if (limitRequests && requests.length > limitRequests) {
    // A spread sample (pilot): every k-th request across video and design
    const k = Math.floor(requests.length / limitRequests);
    return requests.filter((_, i) => i % k === 0).slice(0, limitRequests);
  }
  return requests;
}

async function saveClassified(items) {
  const valid = (items || []).filter(x => x && /^\d+$/.test(String(x.id)));
  if (!valid.length) return 0;
  await db.query(
    `UPDATE captain_import_comments c SET category = v.cat, analysis = COALESCE(c.analysis, '{}'::jsonb) || v.a
       FROM (SELECT unnest($1::bigint[]) AS id, unnest($2::text[]) AS cat, unnest($3::jsonb[]) AS a) v WHERE c.id = v.id AND c.category IS NULL`,
    [valid.map(x => String(x.id)), valid.map(x => x.cat), valid.map(x => JSON.stringify({ kind: x.kind, lang: x.lang, found: x.found, fix: x.fix, rule: x.rule, lesson: x.lesson }))],
  );
  return valid.length;
}

async function stepClassify(runId, { pilot = false } = {}) {
  const s = await getState(runId);
  if (!(s.batches?.classify || []).some(b => !b.collected)) {
    const requests = await classifyRequests({ limitRequests: pilot ? 10 : null });
    if (requests.length) await submit(runId, 'classify', requests);
  }
  const redo = [];
  let saved = 0;
  await collect(runId, 'classify', MODELS.bulk, async (id, msg, err) => {
    const json = msg ? parseJson(msg) : null;
    if (!json) { redo.push(id); return; }
    saved += await saveClassified(json.comments);
  });
  log(`classify: saved ${saved}${redo.length ? `, ${redo.length} request(s) to redo live` : ''}`);
  if (!pilot) await redoClassifyLive(runId);
}

/** Anything still unsorted after the batches (errored, declined, or ids the model skipped) → small live calls. */
async function redoClassifyLive(runId) {
  for (let pass = 0; pass < 2; pass++) {
    const requests = await classifyRequests();
    if (!requests.length) return;
    log(`classify: ${requests.length} leftover request(s) — live pass ${pass + 1}`);
    for (const r of requests) {
      try {
        const msg = await live(runId, 'classify', r.params);
        const json = msg ? parseJson(msg) : null;
        if (json) await saveClassified(json.comments);
        else await markUnsortable(r);
      } catch (e) { log(`classify live error: ${e.message}`); }
    }
  }
}
async function markUnsortable(r) {
  const ids = [...String(r.params.messages[0].content).matchAll(/\[(\d+)\]/g)].map(m => m[1]);
  if (ids.length) await db.query(`UPDATE captain_import_comments SET category = 'unsorted' WHERE id = ANY($1::bigint[]) AND category IS NULL`, [ids]);
}

// ── step D (video): two stills, round N vs round N+1 ─────────────────────────
const OUTCOME_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['before_text', 'after_text', 'outcome', 'final_text'],
  properties: {
    before_text: { type: 'string' }, after_text: { type: 'string' },
    outcome: { type: 'string', enum: ['fixed', 'not_fixed', 'partly', 'cant_tell'] },
    final_text: { type: 'string' },
  },
};
const VIDEO_SYSTEM = `You check whether a reviewer's text correction was applied between two rounds of a video ad. Image 1 is the earlier round at the moment the comment was made. Image 2 is the next round at the same timestamp (the edit may have shifted slightly, so look for the same line of text).
Return:
- before_text: the on-screen text the comment is about, as it reads in image 1 ("" if none is visible)
- after_text: the same text as it reads in image 2 ("" if not visible)
- outcome: fixed (changed as requested), partly, not_fixed (still wrong), or cant_tell (the text isn't visible in one of the images)
- final_text: how it reads in image 2 when fixed or partly, else "".`;

const sh = (cmd, args, timeout = 90000) => new Promise((resolve, reject) => execFile(cmd, args, { timeout, maxBuffer: 1 << 24 }, (e, out) => (e ? reject(e) : resolve(out))));

async function grabStill(url, t, out) {
  if (fs.existsSync(out)) return fs.readFileSync(out);
  try {
    await sh('ffmpeg', ['-y', '-loglevel', 'error', '-ss', t.toFixed(2), '-i', url, '-frames:v', '1', '-vf', 'scale=960:-2', '-q:v', '5', out]);
    return fs.existsSync(out) ? fs.readFileSync(out) : null;
  } catch { return null; }
}

async function stepVideo(runId, { limit = null } = {}) {
  const s = await getState(runId);
  if (!(s.batches?.video || []).some(b => !b.collected)) {
    const { rows } = await db.query(
      `SELECT c.id, c.text, c.frame, c.analysis, a.file_id, a.fps, n.file_id AS next_file_id
         FROM captain_import_comments c
         JOIN captain_import_assets a ON a.id = c.asset_id
         JOIN captain_import_assets n ON n.source = 'frameio' AND n.stack_id = a.stack_id AND n.round = a.round + 1
        WHERE c.source = 'frameio' AND c.category = 'text' AND c.frame IS NOT NULL AND a.stack_id IS NOT NULL
          AND c.analysis->>'kind' NOT IN ('voiceover')
          AND (COALESCE(c.analysis->>'found', '') <> '' OR COALESCE(c.analysis->>'fix', '') <> '')
          AND NOT (c.analysis ? 'outcome')
        ORDER BY a.file_id${limit ? ` LIMIT ${Number(limit)}` : ''}`);
    log(`video: ${rows.length} corrections to check against the next round`);
    const dir = path.join(os.tmpdir(), 'cc-stills');
    fs.mkdirSync(dir, { recursive: true });
    const urls = new Map();
    const urlOf = async (fileId) => {
      const hit = urls.get(fileId);
      if (hit && Date.now() - hit.at < 20 * 60000) return hit.url;
      const info = await frameio.fileInfo(fileId).catch(() => null);
      const url = info?.video_url || null;
      urls.set(fileId, { url, at: Date.now() });
      return url;
    };
    let requests = [], made = 0, skipped = 0;
    const flushAt = 400;
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const t = Math.max(0, (Number(r.frame) - 1) / (Number(r.fps) || 25)) + 0.1;
      const [u1, u2] = [await urlOf(r.file_id), await urlOf(r.next_file_id)];
      const [b1, b2] = u1 && u2 ? await Promise.all([
        grabStill(u1, t, path.join(dir, `${r.file_id}_${Math.round(t * 10)}.jpg`)),
        grabStill(u2, t, path.join(dir, `${r.next_file_id}_${Math.round(t * 10)}.jpg`)),
      ]) : [null, null];
      if (!b1 || !b2) {
        skipped++;
        await db.query(`UPDATE captain_import_comments SET analysis = analysis || '{"outcome":"cant_tell","outcome_note":"no still"}'::jsonb WHERE id = $1`, [r.id]);
        continue;
      }
      const a = r.analysis || {};
      requests.push({
        custom_id: `v-${r.id}`,
        params: {
          model: MODELS.bulk, max_tokens: 3000,
          system: [{ type: 'text', text: VIDEO_SYSTEM, cache_control: { type: 'ephemeral' } }],
          output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTCOME_SCHEMA } },
          messages: [{ role: 'user', content: [
            { type: 'text', text: 'Image 1 — earlier round:' },
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b1.toString('base64') } },
            { type: 'text', text: 'Image 2 — next round:' },
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b2.toString('base64') } },
            { type: 'text', text: `Reviewer comment: "${clip(r.text, 600)}"\nWrong text (as understood): "${a.found || ''}"\nRequested: "${a.fix || ''}"` },
          ] }],
        },
      });
      made++;
      if (requests.length >= flushAt) { await submit(runId, 'video', requests); requests = []; }
      if (made % 200 === 0) log(`video: ${made} pairs ready (${skipped} without a still)`);
    }
    if (requests.length) await submit(runId, 'video', requests);
    log(`video: ${made} pairs submitted, ${skipped} without a still`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  await collectOutcomes(runId, 'video');
}

async function collectOutcomes(runId, step) {
  let n = 0;
  await collect(runId, step, MODELS.bulk, async (customId, msg, err) => {
    const id = customId.split('-')[1];
    const json = msg ? parseJson(msg) : null;
    const patch = json ? { outcome: json.outcome, before_text: json.before_text, after_text: json.after_text, final_text: json.final_text } : { outcome: 'cant_tell', outcome_note: err || 'unreadable' };
    await db.query(`UPDATE captain_import_comments SET analysis = COALESCE(analysis, '{}'::jsonb) || $2::jsonb WHERE id = $1`, [id, JSON.stringify(patch)]);
    n++;
  });
  log(`${step}: ${n} outcomes saved`);
}

// ── step D (design): pinned frame text, then vs today ───────────────────────
const DESIGN_SYSTEM = `You check whether a reviewer's text correction was applied to a design ad in Figma. You get the text layers of the frame the comment was pinned to, as they were when the comment was made ("before") and as they are today ("after").
Return:
- before_text: the text the comment is about, as it read before ("" if you can't find it)
- after_text: the same text today ("" if it is gone)
- outcome: fixed (changed as requested), partly, not_fixed (still wrong), or cant_tell
- final_text: how it reads today when fixed or partly, else "".`;

async function stepDesign(runId, { limit = null } = {}) {
  const s = await getState(runId);
  if (!(s.batches?.design || []).some(b => !b.collected)) {
    await db.query(`UPDATE captain_import_comments SET analysis = analysis - 'outcome' - 'outcome_note' WHERE source = 'figma' AND analysis->>'outcome_note' = 'version too old'`);
    const { rows } = await db.query(
      `SELECT c.id, c.text, c.file_key, c.node_id, c.created_at, c.analysis
         FROM captain_import_comments c
        WHERE c.source = 'figma' AND c.category = 'text' AND c.node_id IS NOT NULL
          AND (COALESCE(c.analysis->>'found', '') <> '' OR COALESCE(c.analysis->>'fix', '') <> '')
          AND NOT (c.analysis ? 'outcome')
        ORDER BY c.file_key, c.node_id, c.created_at${limit ? ` LIMIT ${Number(limit)}` : ''}`);
    log(`design: ${rows.length} corrections to compare across Figma versions`);
    // Fresh version history per file (the import stored page 1 only), saved back on the file's asset row
    const versionsOf = {};
    for (const key of [...new Set(rows.map(r => r.file_key))]) {
      const since = (await db.query(`SELECT MIN(created_at) AS m FROM captain_import_comments WHERE file_key = $1`, [key])).rows[0]?.m;
      versionsOf[key] = await figma.versionsSince(key, since ? new Date(since).toISOString() : '2025-01-01');
      await db.query(`UPDATE captain_import_assets SET meta = meta || jsonb_build_object('versions', $2::jsonb) WHERE asset_key = $1`, [`figma-file:${key}`, JSON.stringify(versionsOf[key])]);
      log(`design: ${versionsOf[key].length} Figma versions for ${key}`);
    }
    const cache = new Map();
    const textsAt = async (key, node, version) => {
      const k = `${key}|${node}|${version || 'now'}`;
      if (cache.has(k)) return cache.get(k);
      let out = null;
      try {
        const n = await figma.node(key, node, { version });
        out = n.doc ? figma.textsOf(n.doc).map(t => t.text).filter(Boolean) : null;
      } catch (e) { if (![400, 404].includes(e.status)) log(`design: Figma ${e.message}`); }
      await sleep(1200);                                     // stay well under Figma's rate limit
      cache.set(k, out);
      return out;
    };
    const requests = [];
    let i = 0;
    for (const r of rows) {
      const at = new Date(r.created_at).getTime();
      const v = (versionsOf[r.file_key] || []).find(x => new Date(x.at).getTime() <= at);
      const before = v ? await textsAt(r.file_key, r.node_id, v.id) : null;
      const after = await textsAt(r.file_key, r.node_id, null);
      if (++i % 100 === 0) log(`design: ${i}/${rows.length} read`);
      if (!before || !after) {
        await db.query(`UPDATE captain_import_comments SET analysis = analysis || $2::jsonb WHERE id = $1`, [r.id, JSON.stringify({ outcome: 'cant_tell', outcome_note: !v ? 'version too old' : 'layer gone' })]);
        continue;
      }
      const a = r.analysis || {};
      requests.push({
        custom_id: `d-${r.id}`,
        params: {
          model: MODELS.bulk, max_tokens: 3000,
          system: [{ type: 'text', text: DESIGN_SYSTEM, cache_control: { type: 'ephemeral' } }],
          output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTCOME_SCHEMA } },
          messages: [{ role: 'user', content: `Reviewer comment: "${clip(r.text, 600)}"\nWrong text (as understood): "${a.found || ''}"\nRequested: "${a.fix || ''}"\n\nBEFORE (text layers then):\n${clip(before.join(' | '), 3500)}\n\nAFTER (text layers today):\n${clip(after.join(' | '), 3500)}` }],
        },
      });
    }
    if (requests.length) await submit(runId, 'design', requests);
    log(`design: ${requests.length} comparisons submitted`);
  }
  await collectOutcomes(runId, 'design');
}

// ── step E: merge into patterns → pending Brain items ───────────────────────
const BRAIN_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['type', 'title', 'content', 'discipline', 'products', 'count', 'reviewers', 'example_ids', 'possibly_expired', 'confidence'],
        properties: {
          type: { type: 'string', enum: ['term', 'rule', 'learned', 'do_not_flag', 'insight'] },
          title: { type: 'string' }, content: { type: 'string' },
          discipline: { type: 'string', enum: ['video', 'design', 'both'] },
          products: { type: 'array', items: { type: 'string' } },
          count: { type: 'integer' },
          reviewers: { type: 'array', items: { type: 'string' } },
          example_ids: { type: 'array', items: { type: 'string' } },
          possibly_expired: { type: 'boolean' },
          confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        },
      },
    },
  },
};
const DISTIL_SYSTEM = `You turn two years of reviewer comments on Particle's ads into a "Brain" for Captain Caption, a bot that proofreads new video and design ads before review. Particle is a men's skincare brand (products like Face Cream, Anti Gray Serum, Gravité). Each input line is one correction or lesson, or several identical ones merged (×N), with its comment ids, reviewer, product, and whether the next version showed it fixed.

Make Brain items the Captain can APPLY to future ads:
- term: the exact spelling of a brand, product, ingredient, campaign or other proper name (title = the correct spelling; content = what it gets wrong, e.g. "Often written without the accent").
- rule: a general house-style rule — punctuation, capitalisation, number and price format, CTA wording, words to use or avoid, how claims are phrased. content = the rule as a clear instruction.
- learned: a recurring specific correction (wrong → right) seen at least twice, or a one-off that shows a non-obvious house preference. Title like "CUSTUMER → CUSTOMER"; content says when it applies.
- do_not_flag: something reviewers deliberately kept or asked for that a proofreader might wrongly flag (slang, an intentional spelling).
- insight: (creative input) a recurring reviewer preference another editor/designer can act on, seen at least twice. content = an actionable heads-up.
Merge duplicates and near-duplicates into one item; count = how many comments support it; reviewers = who said it; example_ids = up to 6 of the strongest ids from the input (prefer ones marked fixed). products = the products it is limited to ([] when it applies to all). Skip one-off typos in ordinary words (any spell-checker catches those) and anything only true for one specific ad. Set possibly_expired for specific prices, dates, discount codes or limited-time offers. confidence: high when repeated and confirmed fixed, low when inferred from one or two vague comments.
Write titles and content in English, quoting Hebrew or Spanish copy as it is. Order by count, highest first.`;

const ALIASES = { lilian: 'Lilian Krumholz', anton: 'Anton Shpakovskiy', shay: 'Shay Shalev', aviad: 'Aviad Eilam' };
function normAuthor(a, fullNames) {
  const s = String(a || '').trim();
  if (!s) return 'Guest reviewer';
  if (/\s/.test(s)) return s;
  const lower = s.toLowerCase();
  if (ALIASES[lower]) return ALIASES[lower];
  const m = fullNames.filter(f => f.toLowerCase().split(/\s+/)[0] === lower);
  return m.length === 1 ? m[0] : s;
}

async function distilRows() {
  const { rows } = await db.query(
    `SELECT c.id, c.source, c.author, c.text, c.category, c.analysis, a.product
       FROM captain_import_comments c LEFT JOIN captain_import_assets a ON a.id = c.asset_id
      WHERE c.category IN ('text', 'creative')`);
  const fullNames = [...new Set(rows.map(r => String(r.author || '').trim()).filter(n => /\s/.test(n)))];
  for (const r of rows) r.who = normAuthor(r.author, fullNames);
  return rows;
}

function bucketLines(list, kindLabel) {
  // Merge identical corrections first, so "×N" carries the weight
  const merged = new Map();
  for (const r of list) {
    const a = r.analysis || {};
    const key = kindLabel === 'creative' ? `L:${String(a.lesson || r.text).toLowerCase().trim()}` : `C:${String(a.found).toLowerCase().trim()}→${String(a.fix).toLowerCase().trim()}|${String(a.rule).toLowerCase().trim()}`;
    const m = merged.get(key) || { rows: [], first: r };
    m.rows.push(r);
    merged.set(key, m);
  }
  return [...merged.values()].sort((x, y) => y.rows.length - x.rows.length).map(({ rows, first }) => {
    const a = first.analysis || {};
    const ids = rows.slice(0, 6).map(r => r.id).join(',');
    const who = [...new Set(rows.map(r => r.who))].slice(0, 3).join('/');
    const prods = [...new Set(rows.map(r => r.product).filter(Boolean))].slice(0, 4).join('/') || '-';
    const fixed = rows.filter(r => r.analysis?.outcome === 'fixed').length;
    const src = [...new Set(rows.map(r => (r.source === 'frameio' ? 'video' : 'design')))].join('+');
    const n = rows.length > 1 ? ` ×${rows.length}` : '';
    if (kindLabel === 'creative') return `[${ids}]${n} ${src} {${prods}} (${who}) lesson: ${clip(a.lesson, 160)} | "${clip(first.text, 140)}"`;
    const fx = fixed ? ` fixed ${fixed}` : '';
    const parts = [a.found || a.fix ? `"${clip(a.found, 80)}" → "${clip(a.fix, 80)}"` : '', a.rule ? `rule: ${clip(a.rule, 140)}` : '', `"${clip(first.text, 140)}"`].filter(Boolean);
    return `[${ids}]${n} ${src} ${a.kind}${a.lang && a.lang !== 'en' && a.lang !== 'none' ? `/${a.lang}` : ''} {${prods}} (${who}${fx}) ${parts.join(' | ')}`;
  });
}

async function distilCall(runId, title, lines) {
  const msg = await live(runId, 'distil', {
    model: MODELS.distil, max_tokens: 128000,
    system: DISTIL_SYSTEM,
    output_config: { effort: 'high', format: { type: 'json_schema', schema: BRAIN_SCHEMA } },
    messages: [{ role: 'user', content: `${title} — ${lines.length} lines:\n${lines.join('\n')}` }],
  });
  const json = msg ? parseJson(msg) : null;
  if (!json) throw new Error(`Distil "${title}" returned nothing usable`);
  log(`distil: ${title} → ${json.items.length} candidates`);
  return json.items;
}

async function stepDistil(runId) {
  const rows = await distilRows();
  const byId = new Map(rows.map(r => [String(r.id), r]));
  const text = rows.filter(r => r.category === 'text' && (r.analysis?.found || r.analysis?.fix || r.analysis?.rule));
  const kinds = (ks) => text.filter(r => ks.includes(r.analysis?.kind));
  const buckets = [
    ['Spelling, grammar, punctuation, capitalisation and spacing corrections', kinds(['spelling', 'grammar', 'punctuation', 'capitalisation', 'spacing'])],
    ['Brand and product name corrections', kinds(['brand_name', 'product_name'])],
    ['Prices, offers, CTAs, claims and legal lines', kinds(['price_offer', 'cta', 'claim', 'legal'])],
    ['Wording, missing or extra text, subtitles and voiceover script', kinds(['wording', 'missing_text', 'remove_text', 'subtitles', 'voiceover', 'other', 'none'])],
    ['Creative feedback on VIDEO ads', rows.filter(r => r.category === 'creative' && r.source === 'frameio' && r.analysis?.lesson)],
    ['Creative feedback on DESIGN ads', rows.filter(r => r.category === 'creative' && r.source === 'figma' && r.analysis?.lesson)],
  ];
  const s = await getState(runId);
  const done = s.distil_buckets || {};
  for (const [title, list] of buckets) {
    if (done[title] || !list.length) continue;
    const lines = bucketLines(list, title.startsWith('Creative') ? 'creative' : 'text');
    // Very large buckets go in slices so each call stays comfortably sized
    const items = [];
    for (let i = 0; i < lines.length; i += 2500) items.push(...await distilCall(runId, title, lines.slice(i, i + 2500)));
    done[title] = items;
    await setState(runId, { distil_buckets: done });
  }
  // Final pass: merge across buckets and resolve overlaps
  const all = Object.values(done).flat();
  let final = all;
  if (all.length > 40) {
    const compact = all.map((x, i) => `${i}. [${x.type}|${x.discipline}|×${x.count}|${x.confidence}${x.possibly_expired ? '|expired?' : ''}] ${x.title} — ${x.content} {${(x.products || []).join('/')}} (${(x.reviewers || []).join('/')}) ids:${(x.example_ids || []).join(',')}`);
    final = await distilCall(runId, 'FINAL MERGE: these are Brain candidates from several batches. Merge duplicates and overlaps (sum counts, union reviewers/products, keep the best example ids), drop anything contradictory or too specific, keep everything else unchanged', compact);
  }
  const saved = await saveBrain(runId, final, byId);
  await setState(runId, { brain: saved });
  return saved;
}

async function saveBrain(runId, items, byId) {
  let created = 0, existing = 0;
  for (const x of items) {
    const title = String(x.title || '').trim().slice(0, 200);
    if (!title) continue;
    const examples = (x.example_ids || []).map(id => byId.get(String(id))).filter(Boolean).slice(0, 6).map(r => ({
      id: r.id, source: r.source, author: r.who, text: clip(r.text, 400), product: r.product || null,
      found: r.analysis?.found || null, fix: r.analysis?.fix || null, outcome: r.analysis?.outcome || null,
    }));
    const products = (x.products || []).filter(Boolean);
    const evidence = { count: x.count, reviewers: x.reviewers || [], products, possibly_expired: !!x.possibly_expired, confidence: x.confidence, examples, run_id: runId };
    const r = await db.query(
      `INSERT INTO captain_brain (type, title, content, discipline, scope, active, status, source, evidence, added_by)
       VALUES ($1, $2, $3, $4, $5, true, 'pending', 'import', $6, 'History import')
       ON CONFLICT (type, lower(title)) DO NOTHING RETURNING id`,
      [x.type, title, x.content || null, x.discipline || 'both', JSON.stringify(products.length ? { product: products } : {}), JSON.stringify(evidence)],
    );
    if (r.rows[0]) {
      created++;
      await db.query(`INSERT INTO captain_brain_history (brain_id, action, after, actor) VALUES ($1, 'create', $2, 'History import')`, [r.rows[0].id, JSON.stringify({ type: x.type, title, status: 'pending' })]).catch(() => {});
    } else existing++;
  }
  log(`brain: ${created} new pending items, ${existing} already in the Brain`);
  return { created, existing, candidates: items.length };
}

// ── driver ───────────────────────────────────────────────────────────────────
async function counts() {
  const { rows } = await db.query(`SELECT source, COALESCE(category, 'unsorted_yet') AS cat, COUNT(*)::int AS n,
      COUNT(*) FILTER (WHERE analysis ? 'outcome')::int AS checked, COUNT(*) FILTER (WHERE analysis->>'outcome' = 'fixed')::int AS fixed
      FROM captain_import_comments GROUP BY 1, 2 ORDER BY 1, 2`);
  return rows;
}

/** Runs (or resumes) the whole thing. pilot = a small sample through sorting and both fix checks, no Brain items. */
async function runLearn({ pilot = false, only = null } = {}) {
  const run = await latestRun();
  if (!run) throw new Error('No finished history import to learn from');
  const lock = await db.connect();
  try {
    const got = (await lock.query('SELECT pg_try_advisory_lock(770431) AS ok')).rows[0].ok;
    if (!got) throw new Error('Another learning run is already going');
    await setState(run.id, { models: MODELS, phase: 'classify', started_at: (await getState(run.id)).started_at || new Date().toISOString(), error: null, pilot });
    // Pilot: sort a spread sample, then try the video-still and Figma-version checks on 20 each — no Brain items yet
    const lim = pilot ? { limit: 20 } : {};
    const steps = [['classify', () => stepClassify(run.id, { pilot })], ['video', () => stepVideo(run.id, lim)], ['design', () => stepDesign(run.id, lim)]];
    if (!pilot) steps.push(['distil', () => stepDistil(run.id)]);
    for (const [name, fn] of steps) {
      if (only && only !== name) continue;
      await setState(run.id, { phase: name });
      log(`── ${name}`);
      await fn();
      await setState(run.id, { counts: await counts() });
    }
    await setState(run.id, { phase: pilot ? 'pilot_done' : 'done', finished_at: pilot ? null : new Date().toISOString() });
    const st = await getState(run.id);
    log('done', JSON.stringify({ cost: st.cost, brain: st.brain }));
    return st;
  } catch (e) {
    await setState(run.id, { error: e.message }).catch(() => {});
    throw e;
  } finally {
    await lock.query('SELECT pg_advisory_unlock(770431)').catch(() => {});
    lock.release();
  }
}

module.exports = { runLearn, classifyRequests, bucketLines, normAuthor, costOf, CLASSIFY_SCHEMA, BRAIN_SCHEMA, MODELS, PRICES };

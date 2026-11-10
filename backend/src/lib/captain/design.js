/**
 * Captain Caption — the design pipeline (one job = one Figma task node).
 *
 *   Figma link with node-id → that SECTION/FRAME only (never a whole page) → its frames (sizes × copy variants)
 *   → exact text layers + a render of every frame → hash (skip if nothing changed) → Claude reads text + renders
 *   → issues on the exact layer → Figma comments pinned to the layer (only where the posting switch allows).
 */
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const db = require('../../db');
const { getConfig } = require('./config');
const { inScope } = require('./scope');
const figma = require('./figma');
const monday = require('./monday');
const { loadBrain, brainText } = require('./brain');
const claude = require('./engines/claude');
const { logEvent } = require('./log');
const { figmaMatcher } = require('./dedupe');
const { brandOf } = require('./brand');
const { postingFor } = require('./video');
const { insertCheck, updateCheck, lastCheckOf, insertIssue, setIssueComment } = require('./store');

const PREFIX = monday.PREFIX;
const PROMPT = fs.readFileSync(path.join(__dirname, 'prompts', 'qc-design.txt'), 'utf8');
const MAX_FRAMES = 20;
const sh = (cmd, args) => new Promise((resolve, reject) => execFile(cmd, args, { maxBuffer: 1 << 24 }, (e, out) => (e ? reject(e) : resolve(out))));

function layersBlock(frames) {
  return frames.map((f, n) => {
    const head = `Frame ${n + 1} — id ${f.id} — ${Math.round(f.width || 0)}×${Math.round(f.height || 0)}${f.size ? ` (${f.size})` : ''} — "${String(f.name).slice(0, 120)}"`;
    const lines = f.texts.length ? f.texts.map(t => `  [${t.id}] ${t.text.replace(/\s+/g, ' ').trim()}`) : ['  (no text layers)'];
    return [head, ...lines].join('\n');
  }).join('\n\n');
}

function briefBlock(item) {
  if (!item) return 'No Monday brief for this check — skip any comparison with a brief.';
  const b = item.brief || {};
  const parts = ['Approved brief for this task (from Monday):'];
  if (b.concept) parts.push(`Concept: ${String(b.concept).slice(0, 2000)}`);
  if (b.supporting_text) parts.push(`Supporting text / copy: ${String(b.supporting_text).slice(0, 2000)}`);
  if (b.sizes) parts.push(`Sizes asked for: ${b.sizes}`);
  parts.push('If the copy in the design clearly contradicts the brief (wrong offer, price, claim or product), report it as type "script_mismatch", severity "check".');
  return parts.join('\n');
}

function commentText(i) {
  const q = (s) => `"${String(s ?? '').trim()}"`;
  const tail = i.severity === 'check' && i.note ? ` (please check: ${i.note})` : i.severity === 'check' ? ' (please check)' : '';
  switch (i.type) {
    case 'placeholder': return `${PREFIX} placeholder text left in: ${q(i.found)}`;
    case 'overflow': return `${PREFIX} text is cut off or overflowing: ${q(i.found)}${i.note ? ` — ${i.note}` : ''}`;
    case 'size_mismatch': return `${PREFIX} please check — copy differs from the other size: ${q(i.found)} (other size: ${q(i.fix)})`;
    case 'script_mismatch': return `${PREFIX} please check — differs from the brief: ${q(i.found)} (brief: ${q(i.fix)})`;
    case 'baked_text': return `${PREFIX} text in the image: ${q(i.found)} → ${q(i.fix)}${tail}`;
    default: return `${PREFIX} ${q(i.found)} → ${q(i.fix)}${tail}`;
  }
}

async function thumbFrom(jpg) {
  const src = path.join('/tmp', `captain-thumb-${process.pid}-${Date.now()}.jpg`), out = `${src}.small.jpg`;
  try {
    fs.writeFileSync(src, jpg);
    await sh('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-vf', 'scale=360:-2', '-q:v', '5', out]);
    return fs.readFileSync(out);
  } catch { return null; } finally { fs.rmSync(src, { force: true }); fs.rmSync(out, { force: true }); }
}

async function skip({ item, link, reason, trigger, actor, asset = {} }) {
  const id = await insertCheck({
    discipline: 'design', status: 'skipped', skip_reason: reason, trigger, board_id: item?.board_id || null, item_id: item?.id || null, item_name: item?.name || asset.name || link || null,
    department: item?.department || null, product: item?.product || null, person: item?.person || null, requested_by: actor || null, asset: { link: link || null, ...asset }, finished_at: new Date(),
  });
  await logEvent({ kind: 'skip', discipline: 'design', board_id: item?.board_id, item_id: item?.id, check_id: id, message: reason, data: { link, trigger }, actor });
  return { skipped: true, reason, check_id: id };
}

/** Pin a comment on the layer; if Figma won't pin to a nested layer, pin on its frame at the layer's position. */
/** Where a comment for this issue gets pinned: the text layer, falling back to its frame. */
function placeOf(issue, frames) {
  const frame = frames.find(f => f.id === issue.frame_node_id) || frames.find(f => f.texts.some(t => t.id === issue.node_id)) || frames[0];
  const layer = frame?.texts.find(t => t.id === issue.node_id);
  return { frame, layer };
}

async function pinComment(fileKey, issue, frames) {
  const { frame, layer } = placeOf(issue, frames);
  const message = commentText(issue);
  if (layer && layer.id !== frame.id) {
    try {
      return await figma.postComment(fileKey, { message, nodeId: layer.id, offset: { x: Math.min(16, (layer.box?.width || 32) / 2), y: Math.min(10, (layer.box?.height || 20) / 2) } });
    } catch (e) { if (e.status !== 400) throw e; }
  }
  const off = layer?.box && frame?.box ? { x: Math.max(0, layer.box.x - frame.box.x + 16), y: Math.max(0, layer.box.y - frame.box.y + 10) } : { x: 24, y: 24 };
  return figma.postComment(fileKey, { message, nodeId: frame.id, offset: off });
}

/**
 * payload: { link?, item_id?, trigger, actor?, force?, override_scope? }
 */
async function runDesignJob(payload) {
  const { item_id = null, trigger = 'manual', actor = null, force = false, override_scope = false } = payload;
  const cfg = await getConfig();
  const item = item_id ? await monday.readItem(item_id) : null;
  if (item_id && !item) return skip({ item: null, link: payload.link, reason: `Monday item ${item_id} not found`, trigger, actor });
  if (item && item.discipline !== 'design') return skip({ item, link: payload.link, reason: 'Not a Design board item', trigger, actor });
  const link = payload.link || item?.link;
  if (!link) return skip({ item, link, reason: 'No Figma link on the item yet', trigger, actor });
  const parsed = figma.parseUrl(link);
  if (!parsed) return skip({ item, link, reason: /frame\.io|f\.io\//i.test(link) ? 'Data-quality flag: a Frame.io link on a design item' : "That isn't a Figma link", trigger, actor });
  if (!parsed.nodeId) return skip({ item, link, reason: 'Please link to the specific frame or section (the link has no node-id)', trigger, actor });

  let scopeReason = 'Manual check (pasted link)';
  if (item) {
    const s = inScope({ discipline: 'design', department: item.department, type: item.type, title: item.name }, cfg);
    if (!s.ok && !override_scope) return skip({ item, link, reason: s.reason, trigger, actor });
    scopeReason = s.ok ? s.reason : `Admin override — ${s.reason}`;
  }

  const { fileKey, nodeId } = parsed;
  const nodeRes = await figma.node(fileKey, nodeId);
  const shape = figma.framesOf(nodeRes.doc);
  if (shape.kind === 'missing') return skip({ item, link, reason: "Couldn't open that Figma node (deleted, or the Captain has no access)", trigger, actor });
  if (shape.kind === 'page') return skip({ item, link, reason: 'The link points to a whole page — please link the task’s own section or frame', trigger, actor, asset: { file_key: fileKey, node_id: nodeId } });
  let frames = shape.frames.filter(f => f.texts.length || f.width);
  if (!frames.length) return skip({ item, link, reason: 'No frames found under that node', trigger, actor });
  const truncated = frames.length > MAX_FRAMES;
  frames = frames.slice(0, MAX_FRAMES);

  const hash = figma.contentHash(frames);
  const dedupeKey = `figma:${fileKey}:${nodeId}:${hash}`;
  const versions = await figma.versions(fileKey).catch(() => []);
  const versionId = versions[0]?.id || nodeRes.version || null;
  const name = shape.name || frames[0].name;
  const sizes = [...new Set(frames.map(f => f.size).filter(Boolean))];
  const label = `${frames.length} frame${frames.length === 1 ? '' : 's'}${sizes.length ? ` · ${sizes.join(', ')}` : ''}`;

  const base = {
    discipline: 'design', trigger, board_id: item?.board_id || null, item_id: item?.id || null, item_name: item?.name || name,
    department: item?.department || null, product: item?.product || null, campaign: item?.campaign || null, person: item?.person || null,
    scope_reason: scopeReason, deliverable: label, dedupe_key: dedupeKey, requested_by: actor || null,
  };
  const asset = { file_key: fileKey, node_id: nodeId, version_id: versionId, hash, name, file_name: nodeRes.fileName, link, frames: frames.map(f => ({ id: f.id, size: f.size, w: f.width, h: f.height })), truncated };

  const prev = await lastCheckOf(dedupeKey);
  if (prev && !force) {
    const id = await insertCheck({ ...base, status: 'skipped', skip_reason: 'Nothing changed since the last check', asset: { ...asset, previous_check: prev.id }, finished_at: new Date() });
    await logEvent({ kind: 'skip', discipline: 'design', board_id: base.board_id, item_id: base.item_id, check_id: id, message: `${name}: nothing changed since the last check`, actor });
    return { results: [{ label, status: 'skipped', reason: 'nothing changed', check_id: id }] };
  }

  // Round = how many different content states of this node the Captain has checked, plus this one
  const { rows: rr } = await db.query(`SELECT COUNT(DISTINCT dedupe_key)::int AS n FROM captain_checks WHERE discipline = 'design' AND asset->>'file_key' = $1 AND asset->>'node_id' = $2 AND status IN ('passed','issues')`, [fileKey, nodeId]);
  const round = (rr[0]?.n || 0) + (prev ? 0 : 1);

  const engine = cfg.engines.design;
  const posting = postingFor(cfg, { figmaFileKey: fileKey, itemId: item?.id });
  const checkId = await insertCheck({ ...base, status: 'running', round, engine: engine.engine, model: engine.model, posting: posting.mode, started_at: new Date(), asset });
  await logEvent({ kind: 'check', discipline: 'design', board_id: base.board_id, item_id: base.item_id, check_id: checkId, message: `Checking ${name} (${label}) round ${round}`, data: { trigger, file_key: fileKey, node_id: nodeId }, actor });

  try {
    if (engine.engine !== 'claude') throw new Error(`Design engine "${engine.engine}" isn't available yet — set Claude in Settings`);
    const urls = await figma.renderUrls(fileKey, frames.map(f => f.id), { format: 'jpg', scale: 1 });
    const images = [];
    for (const [n, f] of frames.entries()) {
      const u = urls[f.id];
      if (!u) continue;
      const res = await fetch(u, { signal: AbortSignal.timeout(120000) });
      if (!res.ok) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      images.push({ label: `Frame ${n + 1} render — id ${f.id}${f.size ? ` (${f.size})` : ''}`, mime: 'image/jpeg', data: buf.toString('base64'), bytes: buf });
    }
    if (!images.length) throw new Error("Figma couldn't render the frames");
    const thumb = await thumbFrom(images[0].bytes);

    const brand = brandOf({ itemName: item?.name, names: [name, nodeRes?.fileName] }, cfg);
    const brain = await loadBrain({ discipline: 'design', product: item?.product, campaign: item?.campaign, department: item?.department, brand: brand.name });
    const prompt = PROMPT.replaceAll('{{BRAND_ABOUT}}', brand.about).replaceAll('{{BRAND}}', brand.name).replace('{{BRAIN}}', brainText(brain)).replace('{{BRIEF}}', briefBlock(item)).replace('{{LAYERS}}', layersBlock(frames));
    const r = await claude.checkDesign({ images: images.map(({ bytes, ...i }) => i), prompt, model: engine.model, prices: cfg.prices || {} });

    const known = new Set(frames.flatMap(f => [f.id, ...f.texts.map(t => t.id)]));
    const issues = r.issues.map((i, idx) => {
      const frame = frames.find(f => f.id === i.frame_id) || frames.find(f => f.texts.some(t => t.id === i.node_id)) || frames[0];
      return {
        idx, node_id: known.has(i.node_id) ? i.node_id : frame.id, frame_node_id: frame.id,
        found: i.found || null, fix: i.fix || null, type: i.type || 'other', severity: i.severity === 'check' ? 'check' : 'must_fix', note: i.note || null,
      };
    });
    for (const i of issues) await insertIssue(checkId, i);
    await updateCheck(checkId, {
      status: issues.length ? 'issues' : 'passed', issue_count: issues.length, cost_usd: r.cost_usd, duration_ms: r.ms, usage: r.usage, model: r.model,
      raw: { issues: r.issues, brain_ids: brain.ids, prompt_chars: prompt.length, layers: frames.map(f => ({ id: f.id, size: f.size, texts: f.texts.map(t => ({ id: t.id, text: t.text })) })) },
      thumb, finished_at: new Date(),
    });

    if (posting.comments) {
      const already = await figmaMatcher(figma, fileKey, PREFIX);   // skip what the Captain already said on this layer (re-runs)
      let posted = 0, skipped = 0;
      if (!issues.length) {
        const message = `${PREFIX} round ${round} passed ✅ — no typos in ${label}`;
        if (already(message, frames[0].id)) skipped++; else { await figma.postComment(fileKey, { message, nodeId: frames[0].id, offset: { x: 24, y: 24 } }); posted++; }
      }
      for (const i of issues) {
        const { frame, layer } = placeOf(i, frames);
        const prev = already(commentText(i), [layer?.id, frame?.id]);
        if (prev) { skipped++; await setIssueComment(checkId, i.idx, prev.id); continue; }
        const c = await pinComment(fileKey, i, frames);
        if (c?.id) await setIssueComment(checkId, i.idx, c.id);
        posted++;
      }
      await updateCheck(checkId, { posted_at: new Date() });
      await logEvent({ kind: 'post', discipline: 'design', board_id: base.board_id, item_id: base.item_id, check_id: checkId, message: `Posted ${posted} Figma comment(s) on ${name}${skipped ? ` (${skipped} already there — not posted again)` : ''}`, actor });
    }
    return { results: [{ label, round, status: issues.length ? 'issues' : 'passed', issue_count: issues.length, check_id: checkId }], posting };
  } catch (e) {
    await updateCheck(checkId, { status: 'error', error: String(e.message).slice(0, 1000), finished_at: new Date() });
    await logEvent({ kind: 'error', discipline: 'design', board_id: base.board_id, item_id: base.item_id, check_id: checkId, message: `${name}: ${e.message}`, actor });
    return { results: [{ label, round, status: 'error', error: e.message, check_id: checkId }], posting };
  }
}

module.exports = { runDesignJob, layersBlock, commentText };

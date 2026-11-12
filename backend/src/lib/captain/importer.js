/**
 * Brain bootstrap, step A — a READ-ONLY copy of past reviewer comments (never posts, edits or resolves anything).
 *
 *   import_start          → lists in-scope Monday tasks since `since` and queues one job per Frame.io task / Figma file
 *   import_frameio_item   → task folder → every deliverable × round → file facts + every human comment and reply
 *   import_figma_file     → one Media Ads file → comments matched to their Monday task by the layer they're pinned to,
 *                           the pinned layer's text, and the file's version history (for "was it fixed next version?")
 *
 * Assets come from the Monday boards' review links, so everything is tied to its task and TV / out-of-scope work is
 * never read. Jobs run at low priority — live checks always go first. Re-running is safe (everything upserts).
 */
const db = require('../../db');
const { fetchAllItems } = require('../monday');
const { BOARDS, getConfig } = require('./config');
const { productOf } = require('../studio/product');
const { inScope } = require('./scope');
const frameio = require('./frameio');
const figma = require('./figma');
const { enqueue } = require('./queue');
const { logEvent } = require('./log');

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const isCaptain = (name) => /captain caption/i.test(String(name || ''));
const LOW = { priority: 0, maxAttempts: 4 };

const linkOf = (cv) => {
  if (!cv) return null;
  try { const v = JSON.parse(cv.value || 'null'); if (v?.url) return v.url; } catch { /* plain text */ }
  return (cv.text || '').match(/https?:\/\/\S+/)?.[0] || null;
};

async function boardItems(discipline, since) {
  const b = BOARDS[discipline];
  const cols = [b.columns.link, b.columns.department, b.columns.type, b.columns.product, b.columns.product_dropdown].filter(Boolean);
  const { items } = await fetchAllItems(b.board_id, { cols, limit: 500, maxPages: 40 });
  return items.filter(it => String(it.created_at).slice(0, 10) >= since).map(it => {
    const cv = Object.fromEntries((it.column_values || []).map(c => [c.id, c]));
    return {
      id: it.id, name: it.name, created_at: it.created_at, board_id: b.board_id,
      url: linkOf(cv[b.columns.link]), department: cv[b.columns.department]?.text || null,
      type: b.columns.type ? cv[b.columns.type]?.text || null : null, product: productOf(cv, b.columns) || null,
    };
  });
}

/** Queue the whole import. Returns { run_id, plan }. */
async function startImport({ actor = null, sources = ['frameio', 'figma'], since = null } = {}) {
  const cfg = await getConfig();
  since = since || cfg.import?.since || '2025-01-01';
  const { rows: running } = await db.query(`SELECT id FROM captain_import_runs WHERE status = 'running' ORDER BY id DESC LIMIT 1`);
  if (running[0]) {
    const { rows: open } = await db.query(`SELECT COUNT(*)::int AS n FROM captain_jobs WHERE kind LIKE 'import_%' AND status IN ('queued','running') AND payload->>'run_id' = $1`, [String(running[0].id)]);
    if (open[0].n > 0) return { run_id: running[0].id, already_running: true };
    await db.query(`UPDATE captain_import_runs SET status = 'done', finished_at = NOW() WHERE id = $1`, [running[0].id]);
  }
  const { rows } = await db.query(`INSERT INTO captain_import_runs (since, sources, started_by) VALUES ($1, $2, $3) RETURNING id`, [since, sources, actor]);
  const runId = rows[0].id;
  const plan = { since };

  if (sources.includes('frameio')) {
    const items = await boardItems('video', since);
    const p = { items: 0, skipped: {} };
    const skip = (why) => { p.skipped[why] = (p.skipped[why] || 0) + 1; };
    for (const it of items) {
      const s = inScope({ discipline: 'video', department: it.department, type: it.type, title: it.name }, cfg);
      if (!s.ok) { skip(s.reason.replace(/\s*\(.*\)$/, '')); continue; }
      if (!it.url) { skip('No Frame.io link'); continue; }
      if (/app\.frame\.io/.test(it.url)) { skip('Old Frame.io (V3) link'); continue; }
      if (!/frame\.io|f\.io\//.test(it.url)) { skip('Not a Frame.io link'); continue; }
      await enqueue('import_frameio_item', { run_id: runId, item: it }, { ...LOW, dedupeKey: `imp:${runId}:fio:${it.id}` });
      p.items++;
    }
    plan.frameio = p;
  }

  if (sources.includes('figma')) {
    const items = await boardItems('design', since);
    const folders = (cfg.import?.figma_folders || ['Media Ads']).map(s => s.toLowerCase());
    const byFile = {};
    const p = { files: 0, items: 0, skipped: {}, other_folders: {} };
    const skip = (why, n = 1) => { p.skipped[why] = (p.skipped[why] || 0) + n; };
    for (const it of items) {
      const s = inScope({ discipline: 'design', department: it.department, type: it.type, title: it.name }, cfg);
      if (!s.ok) { skip(s.reason.replace(/\s*\(.*\)$/, '')); continue; }
      const f = figma.parseUrl(it.url || '');
      if (!f) { skip('No Figma link'); continue; }
      if (!f.nodeId) { skip('Figma link without a frame/section'); continue; }
      (byFile[f.fileKey] ||= []).push({ ...it, node_id: f.nodeId });
    }
    for (const [key, list] of Object.entries(byFile)) {
      let meta = null;
      try { meta = (await figma.api(`/v1/files/${key}/meta`))?.file || null; } catch { /* no access */ }
      await sleep(250);
      if (!meta) { skip("Figma file the Captain can't open", list.length); continue; }
      if (!folders.includes(String(meta.folder_name || '').toLowerCase())) {
        p.other_folders[meta.folder_name || '(no folder)'] = (p.other_folders[meta.folder_name || '(no folder)'] || 0) + list.length;
        continue;
      }
      await enqueue('import_figma_file', { run_id: runId, file_key: key, file_name: meta.name, folder: meta.folder_name, since, items: list.map(({ url, ...x }) => x) }, { ...LOW, dedupeKey: `imp:${runId}:fig:${key}` });
      p.files++; p.items += list.length;
    }
    plan.figma = p;
  }

  await db.query('UPDATE captain_import_runs SET plan = $2 WHERE id = $1', [runId, JSON.stringify(plan)]);
  await logEvent({ kind: 'brain', message: `History import started (since ${since}): ${plan.frameio?.items ?? 0} video tasks, ${plan.figma?.files ?? 0} Figma files`, data: { run_id: runId, plan }, actor });
  return { run_id: runId, plan };
}

// ── upserts ──────────────────────────────────────────────────────────────────
async function upsertAsset(a) {
  const cols = Object.keys(a);
  const { rows } = await db.query(
    `INSERT INTO captain_import_assets (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})
     ON CONFLICT (asset_key) DO UPDATE SET ${cols.filter(c => c !== 'asset_key').map(c => `${c} = EXCLUDED.${c}`).join(', ')}, fetched_at = NOW()
     RETURNING id`,
    cols.map(c => (a[c] && typeof a[c] === 'object' && !(a[c] instanceof Date) ? JSON.stringify(a[c]) : a[c])),
  );
  return rows[0].id;
}

async function upsertComment(c) {
  const cols = Object.keys(c);
  await db.query(
    `INSERT INTO captain_import_comments (${cols.join(',')}) VALUES (${cols.map((_, i) => `$${i + 1}`).join(',')})
     ON CONFLICT (source, external_id) DO UPDATE SET ${cols.filter(k => !['source', 'external_id'].includes(k)).map(k => `${k} = EXCLUDED.${k}`).join(', ')}`,
    cols.map(k => (c[k] && typeof c[k] === 'object' && !(c[k] instanceof Date) ? JSON.stringify(c[k]) : c[k])),
  );
}

// ── Frame.io: one Monday task ────────────────────────────────────────────────
const meta = (f, name) => (f?.metadata || []).find(m => m.field_definition_name === name)?.value ?? null;

async function importFrameioItem({ run_id, item }) {
  const target = await frameio.resolveTarget(item.url);
  if (!target || !['folder', 'stack', 'file', 'share'].includes(target.kind)) {
    await logEvent({ kind: 'skip', discipline: 'video', board_id: item.board_id, item_id: item.id, message: `Import: couldn't open the Frame.io link of "${item.name}"`, data: { run_id, url: item.url } });
    return { skipped: 'unresolvable' };
  }
  const deliverables = await frameio.deliverablesForTarget(target);
  const acct = await frameio.accountId();
  let files = 0, comments = 0;
  for (const d of deliverables) {
    for (const r of d.rounds) {
      const f = (await frameio.api(`/accounts/${acct}/files/${r.file_id}?include=metadata`).catch(() => null))?.data;
      await sleep(150);                                          // Show file: 10 calls / second
      if (!f) continue;
      const commentCount = Number(meta(f, 'Comment Count')) || 0;
      const assetId = await upsertAsset({
        run_id, source: 'frameio', asset_key: `frameio:${r.file_id}`, board_id: item.board_id, item_id: item.id, item_name: item.name,
        department: item.department, product: item.product, item_created_at: item.created_at,
        folder_id: target.folder_id || null, stack_id: d.stack_id, file_id: r.file_id, file_name: f.name, deliverable: d.label,
        round: r.round, rounds_total: d.rounds.length, fps: Number(meta(f, 'Frame Rate')) || null, duration: Number(meta(f, 'Duration')) || null,
        file_created_at: f.created_at, comment_count: commentCount, meta: { size: d.size, variant: d.variant, status: f.status },
      });
      files++;
      if (!commentCount) continue;
      const list = await frameio.listComments(r.file_id);
      await sleep(700);                                          // List comments: 100 calls / minute
      const all = [];
      for (const c of list) { all.push([c, null]); for (const rep of c.replies || []) all.push([rep, c.id]); }
      for (const [c, parent] of all) {
        if (isCaptain(c.owner?.name)) continue;
        await upsertComment({
          run_id, source: 'frameio', external_id: c.id, parent_external_id: parent, asset_id: assetId, board_id: item.board_id, item_id: item.id,
          file_id: r.file_id, author: c.owner?.name || null, author_id: c.owner?.id || c.owner_id || null, text: c.text || '',
          frame: Number.isFinite(Number(c.timestamp)) ? Number(c.timestamp) : null, duration_frames: c.duration ?? null,
          has_annotation: !!c.annotation, created_at: c.created_at || null, resolved_at: c.completed_at || null,
          raw: { anchor: c.anchor || null, page: c.page ?? null, mentions: (c.mentions || []).length, attachments: (c.attachments || []).length },
        });
        comments++;
      }
    }
  }
  return { deliverables: deliverables.length, files, comments };
}

// ── Figma: one Media Ads file ────────────────────────────────────────────────
async function importFigmaFile({ run_id, file_key, file_name, folder, since, items }) {
  // Which Monday task owns which layer: walk each task's linked section/frame
  const owner = new Map();                 // node id → item
  const nodeInfo = new Map();              // node id → { type, name, text }
  const missing = [];
  for (let i = 0; i < items.length; i += 20) {
    const chunk = items.slice(i, i + 20);
    let d = null;
    try { d = await figma.api(`/v1/files/${file_key}/nodes?ids=${encodeURIComponent(chunk.map(c => c.node_id).join(','))}`, { timeoutMs: 180000 }); } catch (e) { if (e.status !== 404) throw e; }
    await sleep(800);
    for (const it of chunk) {
      const doc = d?.nodes?.[it.node_id]?.document;
      if (!doc) { missing.push(it.id); continue; }
      (function walk(n) {
        if (!owner.has(n.id)) owner.set(n.id, it);
        nodeInfo.set(n.id, { type: n.type, name: n.name, text: n.type === 'TEXT' ? (n.characters || '').slice(0, 2000) : null });
        for (const c of n.children || []) walk(c);
      })(doc);
    }
  }

  // Version history back to `since` (for the before/after step)
  const versions = await figma.versionsSince(file_key, since).catch(() => []);
  await upsertAsset({ run_id, source: 'figma', asset_key: `figma-file:${file_key}`, file_key, figma_file_name: file_name, folder_name: folder, meta: { versions, items: items.length, missing_nodes: missing.length } });

  // One asset per task (its linked node)
  const assetOf = new Map();
  for (const it of items) {
    if (missing.includes(it.id)) continue;
    const id = await upsertAsset({
      run_id, source: 'figma', asset_key: `figma:${file_key}:${it.node_id}:${it.id}`, board_id: it.board_id, item_id: it.id, item_name: it.name,
      department: it.department, product: it.product, item_created_at: it.created_at, file_key, node_id: it.node_id, figma_file_name: file_name, folder_name: folder,
      meta: { node_type: nodeInfo.get(it.node_id)?.type || null, node_name: nodeInfo.get(it.node_id)?.name || null },
    });
    assetOf.set(it.id, id);
  }

  // Comments (replies inherit their thread's layer and task)
  const all = (await figma.comments(file_key)).filter(c => String(c.created_at).slice(0, 10) >= since);
  const byId = new Map(all.map(c => [c.id, c]));
  let matched = 0, unmatched = 0, imported = 0;
  for (const c of all) {
    if (isCaptain(c.user?.handle)) continue;
    const root = c.parent_id ? byId.get(c.parent_id) || c : c;
    const nodeId = root.client_meta?.node_id || null;
    const it = nodeId ? owner.get(nodeId) : null;
    if (it) matched++; else unmatched++;
    const info = nodeId ? nodeInfo.get(nodeId) : null;
    await upsertComment({
      run_id, source: 'figma', external_id: c.id, parent_external_id: c.parent_id || null, asset_id: it ? assetOf.get(it.id) || null : null,
      board_id: it?.board_id || null, item_id: it?.id || null, file_key, node_id: nodeId, node_type: info?.type || null, node_text: info?.text || null,
      author: c.user?.handle || null, author_id: c.user?.id || null, text: c.message || '', created_at: c.created_at || null, resolved_at: c.resolved_at || null,
      raw: { node_offset: root.client_meta?.node_offset || null, reactions: (c.reactions || []).length },
    });
    imported++;
  }
  return { comments: imported, matched, unmatched, versions: versions.length, missing_nodes: missing.length };
}

// ── report ───────────────────────────────────────────────────────────────────
async function importStatus() {
  const run = (await db.query('SELECT * FROM captain_import_runs ORDER BY id DESC LIMIT 1')).rows[0] || null;
  if (!run) return { run: null };
  const jobs = (await db.query(
    `SELECT kind, status, COUNT(*)::int AS n FROM captain_jobs WHERE kind LIKE 'import_%' AND (payload->>'run_id' = $1 OR (kind = 'import_start' AND created_at >= $2)) GROUP BY kind, status`,
    [String(run.id), run.started_at])).rows;
  const assets = (await db.query(`SELECT source, COUNT(*)::int AS n, COUNT(DISTINCT item_id)::int AS items FROM captain_import_assets WHERE run_id = $1 AND asset_key NOT LIKE 'figma-file:%' GROUP BY source`, [run.id])).rows;
  const comments = (await db.query(
    `SELECT source, COUNT(*)::int AS n, COUNT(*) FILTER (WHERE parent_external_id IS NULL)::int AS threads, COUNT(*) FILTER (WHERE item_id IS NOT NULL)::int AS matched,
            COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)::int AS resolved, COUNT(DISTINCT author)::int AS authors,
            COUNT(*) FILTER (WHERE created_at >= '2026-01-01')::int AS y2026, ROUND(AVG(LENGTH(text)))::int AS avg_chars
       FROM captain_import_comments WHERE run_id = $1 GROUP BY source`, [run.id])).rows;
  const authors = (await db.query(`SELECT author, COUNT(*)::int AS n FROM captain_import_comments WHERE run_id = $1 GROUP BY author ORDER BY n DESC LIMIT 12`, [run.id])).rows;
  const total = comments.reduce((s, c) => s + c.n, 0);
  const done = jobs.filter(j => j.kind !== 'import_start' && ['done', 'failed'].includes(j.status)).reduce((s, j) => s + j.n, 0);
  const all = jobs.filter(j => j.kind !== 'import_start').reduce((s, j) => s + j.n, 0);
  const failed = jobs.filter(j => j.kind !== 'import_start' && j.status === 'failed').reduce((s, j) => s + j.n, 0);
  if (run.status === 'running' && all > 0 && done === all) {
    await db.query(`UPDATE captain_import_runs SET status = 'done', finished_at = NOW() WHERE id = $1 AND status = 'running'`, [run.id]);
    run.status = 'done'; run.finished_at = new Date().toISOString();
  }
  // Rough AI estimate for steps C–D (shown before anything is spent): classify every comment (Haiku, batched),
  // read before/after for the ~30% that are about text (2 stills each), then distil patterns (Opus)
  const estimate = { classify: +(total * 0.0006).toFixed(2), before_after: +(total * 0.3 * 0.003).toFixed(2), distil: 8 };
  estimate.total = +(estimate.classify + estimate.before_after + estimate.distil).toFixed(2);
  return { run, jobs, progress: { done, all, failed }, assets, comments, authors, estimate };
}

module.exports = { startImport, importFrameioItem, importFigmaFile, importStatus };

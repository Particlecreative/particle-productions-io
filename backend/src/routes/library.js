/**
 * /api/library — The Library: final files (TV masters, digital versions, sound stems) as Dropbox / Drive links, per production,
 * plus "Before 2026" (files with no CP production) and Google Sheets it syncs from.
 * Everyone with access to the brand can browse and download; Editors add, edit, remove and connect sheets.
 */
const router = require('express').Router();
const db = require('../db');
const { verifyJWT } = require('../middleware/auth');
const { logAction } = require('../lib/auditLog');
const lib = require('../lib/library');
const sheet = require('../lib/librarySheet');
const { linkKind } = require('../lib/creative/snapshot');

const RANK = { Viewer: 0, Accounting: 1, Studio: 1, Editor: 2, Admin: 3 };
const isEditor = (u) => (RANK[u?.role] ?? -1) >= RANK.Editor;
const canBrand = (u, brandId) => !!u && (u.super_admin || u.brand_id === brandId || (u.brand_ids || []).includes(brandId));

function errorJson(res, err, fallback = 'Server error') {
  const status = err?.status && err.status >= 400 && err.status < 600 ? err.status : 500;
  if (status >= 500) console.error('[library]', err?.stack || err);
  res.status(status).json({ error: err?.message || fallback });
}
const fail = (status, msg) => Object.assign(new Error(msg), { status });

// ── Public: signed posters (img tags can't send the login header) ──
router.get('/t/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    if (!/^[0-9a-f-]{36}$/i.test(id) || !lib.verifyThumb(id, req.query.e, req.query.s)) return res.status(403).end();
    const { rows } = await db.query('SELECT id, url, entry_key, file_kind FROM library_items WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).end();
    const out = await lib.thumbFor(rows[0]);
    if (!out?.bytes) return res.status(404).end();
    res.set('Content-Type', out.type || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=43200');
    res.send(out.bytes);
  } catch (err) { errorJson(res, err); }
});

router.use(verifyJWT);

const ITEM_COLS = `id, brand_id, production_id, production_locked, category, title, product, url, entry_key, file_name, ext, file_kind, size_bytes, file_modified,
  specs, market, on_air, code, vanity, landing_url, notes, sort, source, added_by, created_at, updated_at`;
const isDropbox = (u) => ['dropbox_file', 'dropbox_folder'].includes(linkKind(u));
const withThumb = (it) => ({
  ...it,
  size_bytes: it.size_bytes == null ? null : Number(it.size_bytes),
  thumb_url: ['video', 'image'].includes(it.file_kind) && isDropbox(it.url) ? lib.thumbUrl(it.id) : null,
});

/** Productions for the Library (everything finished, plus anything with files) and "Before 2026" (files with no production). */
async function libraryFor(brandId, productionId = null) {
  const vals = [brandId];
  const one = productionId ? `AND p.id = $${vals.push(productionId)}` : '';
  const { rows: prods } = await db.query(
    `SELECT p.id, p.project_name AS name, p.stage, p.product_type, p.production_type, p.producer,
            p.planned_start::text AS planned_start, p.planned_end::text AS planned_end,
            p.delivery_date::text AS delivery_date, p.air_date::text AS air_date,
            (SELECT MAX(h.created_at) FROM change_history h WHERE h.production_id = p.id AND h.field = 'stage' AND h.new_value ILIKE 'completed%') AS completed_at
       FROM productions p
      WHERE p.brand_id = $1 ${one}
        AND (${productionId ? 'TRUE' : `p.stage ILIKE 'completed%' OR EXISTS (SELECT 1 FROM library_items li WHERE li.production_id = p.id)`})
      ORDER BY COALESCE(p.air_date, p.delivery_date, p.planned_end, p.planned_start) DESC NULLS LAST, p.id DESC`,
    vals
  );
  const ids = prods.map(p => p.id);
  const [items, links] = await Promise.all([
    productionId
      ? db.query(`SELECT ${ITEM_COLS} FROM library_items WHERE production_id = $1 ORDER BY category, sort, created_at`, [productionId]).then(r => r.rows)
      : db.query(`SELECT ${ITEM_COLS} FROM library_items WHERE brand_id = $1 ORDER BY category, sort, created_at`, [brandId]).then(r => r.rows),
    ids.length
      ? db.query('SELECT id, production_id, category, title, url FROM links WHERE production_id = ANY($1) ORDER BY category, "order"', [ids]).then(r => r.rows).catch(() => [])
      : [],
  ]);
  const by = (rows) => rows.reduce((m, r) => ((m[r.production_id || ''] = m[r.production_id || ''] || []).push(r), m), {});
  const itemsBy = by(items);
  const linksBy = by(links);
  return {
    productions: prods.map(p => ({
      ...p,
      product_type: Array.isArray(p.product_type) ? p.product_type : [],
      items: (itemsBy[p.id] || []).map(withThumb),
      other_links: linksBy[p.id] || [],
    })),
    before: productionId ? [] : (itemsBy[''] || []).map(withThumb),
  };
}

async function sourcesFor(brandId) {
  const { rows } = await db.query(
    'SELECT id, sheet_id, title, last_synced_at, last_result, created_by FROM library_sources WHERE brand_id = $1 ORDER BY created_at', [brandId]
  ).catch(() => ({ rows: [] }));
  // Out of date (no job ran, e.g. right after a deploy): sync in the background, the next load shows it
  if (rows.some(r => !r.last_synced_at || Date.now() - new Date(r.last_synced_at).getTime() > 15 * 60 * 1000)) sheet.syncAll().catch(() => {});
  return rows;
}

async function productionBrand(productionId) {
  const { rows } = await db.query('SELECT id, brand_id, project_name FROM productions WHERE id = $1', [productionId]);
  if (!rows[0]) throw fail(404, 'Production not found');
  return rows[0];
}
async function itemWithBrand(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw fail(400, 'Bad id');
  const { rows } = await db.query(
    `SELECT li.*, p.project_name FROM library_items li LEFT JOIN productions p ON p.id = li.production_id WHERE li.id = $1`, [id]);
  if (!rows[0]) throw fail(404, 'File not found');
  return rows[0];
}

router.get('/', async (req, res) => {
  try {
    const brandId = String(req.query.brand_id || '');
    if (!brandId) return res.status(400).json({ error: 'brand_id required' });
    if (!canBrand(req.user, brandId)) return res.status(403).json({ error: 'No access to this brand' });
    const [lib0, sources, all] = await Promise.all([
      libraryFor(brandId),
      sourcesFor(brandId),
      // Every production, for "Link to a production" / "Move…"
      db.query(`SELECT id, project_name AS name, stage FROM productions WHERE brand_id = $1 AND COALESCE(stage, '') NOT ILIKE '%cancel%' ORDER BY id DESC`, [brandId]).then(r => r.rows),
    ]);
    res.json({ brand_id: brandId, ...lib0, all_productions: all, sources, can_edit: isEditor(req.user) });
  } catch (err) { errorJson(res, err); }
});

router.get('/production/:productionId', async (req, res) => {
  try {
    const p = await productionBrand(String(req.params.productionId));
    if (!canBrand(req.user, p.brand_id)) return res.status(403).json({ error: 'No access to this brand' });
    const { productions: [row] } = await libraryFor(p.brand_id, p.id);
    res.json({ production: row || null, can_edit: isEditor(req.user) });
  } catch (err) { errorJson(res, err); }
});

/** A pasted link → its files, each with a suggested category (nothing is saved). */
router.post('/resolve', async (req, res) => {
  try {
    if (!isEditor(req.user)) return res.status(403).json({ error: 'Editor access required' });
    res.json(await lib.resolveLink(req.body?.url));
  } catch (err) { errorJson(res, err); }
});

const str = (v, max) => String(v ?? '').trim().slice(0, max);
function cleanItem(raw, i) {
  const category = lib.CATEGORIES.includes(raw?.category) ? raw.category : null;
  if (!category) throw fail(400, `File ${i + 1}: choose TV master, digital, sound or other`);
  let url;
  try { const u = new URL(String(raw.url || '').trim()); if (!/^https?:$/.test(u.protocol)) throw new Error(); url = u.toString(); } catch { throw fail(400, `File ${i + 1}: not a web link`); }
  const name = str(raw.file_name, 300) || null;
  const specs = {};
  for (const k of ['aspect', 'language', 'version']) if (raw.specs?.[k]) specs[k] = str(raw.specs[k], 20);
  if (Number(raw.specs?.duration) > 0) specs.duration = Math.round(Number(raw.specs.duration));
  return {
    category,
    title: str(raw.title, 200) || name || url,
    url,
    entry_key: raw.entry_key ? str(raw.entry_key, 1000) : null,
    file_name: name,
    ext: name ? str(raw.ext || name.split('.').pop(), 12).toLowerCase() : null,
    file_kind: name ? lib.fileKind(name) : 'other',
    size_bytes: Number(raw.size_bytes) > 0 ? Math.round(Number(raw.size_bytes)) : null,
    specs,
    notes: str(raw.notes, 2000) || null,
  };
}

router.post('/production/:productionId/items', async (req, res) => {
  try {
    if (!isEditor(req.user)) return res.status(403).json({ error: 'Editor access required' });
    const p = await productionBrand(String(req.params.productionId));
    if (!canBrand(req.user, p.brand_id)) return res.status(403).json({ error: 'No access to this brand' });
    const list = Array.isArray(req.body?.items) ? req.body.items : [];
    if (!list.length || list.length > 200) return res.status(400).json({ error: 'Send 1–200 files' });
    const items = list.map(cleanItem);
    const who = req.user?.name || req.user?.email || null;
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      const { rows: [{ n }] } = await client.query('SELECT COALESCE(MAX(sort), 0) AS n FROM library_items WHERE production_id = $1', [p.id]);
      let sort = Number(n);
      for (const it of items) {
        // The same file twice is one entry
        await client.query(
          `INSERT INTO library_items (production_id, category, title, url, entry_key, file_name, ext, file_kind, size_bytes, specs, notes, sort, added_by, brand_id, production_locked)
           SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,TRUE
            WHERE NOT EXISTS (SELECT 1 FROM library_items WHERE production_id = $1 AND url = $4 AND COALESCE(entry_key, '') = COALESCE($5, ''))`,
          [p.id, it.category, it.title, it.url, it.entry_key, it.file_name, it.ext, it.file_kind, it.size_bytes, JSON.stringify(it.specs), it.notes, ++sort, who, p.brand_id]
        );
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK').catch(() => {}); throw e; } finally { client.release(); }
    logAction({ production_id: p.id, action: 'create', entity: 'library', summary: `Added ${items.length} file${items.length > 1 ? 's' : ''} to The Library`, user_id: req.user?.id, user_name: who });
    const { productions: [row] } = await libraryFor(p.brand_id, p.id);
    res.json({ ok: true, production: row });
  } catch (err) { errorJson(res, err); }
});

router.patch('/items/:id', async (req, res) => {
  try {
    if (!isEditor(req.user)) return res.status(403).json({ error: 'Editor access required' });
    const it = await itemWithBrand(req.params.id);
    if (!canBrand(req.user, it.brand_id)) return res.status(403).json({ error: 'No access to this brand' });
    const b = req.body || {};
    const sets = [];
    const vals = [it.id];
    if ('category' in b) { if (!lib.CATEGORIES.includes(b.category)) throw fail(400, 'Unknown category'); sets.push(`category = $${vals.push(b.category)}`); }
    if ('title' in b) sets.push(`title = $${vals.push(str(b.title, 200) || it.title)}`);
    if ('notes' in b) sets.push(`notes = $${vals.push(str(b.notes, 2000) || null)}`);
    if ('specs' in b) sets.push(`specs = $${vals.push(JSON.stringify(cleanItem({ ...it, category: it.category, specs: b.specs }, 0).specs))}::jsonb`);
    if ('sort' in b && Number.isFinite(Number(b.sort))) sets.push(`sort = $${vals.push(Math.round(Number(b.sort)))}`);
    if ('production_id' in b) {
      // Chosen by hand (or back to Before 2026 with null) — the sheet sync never moves it again
      if (b.production_id) {
        const p = await productionBrand(String(b.production_id));
        if (p.brand_id !== it.brand_id) throw fail(400, 'That production is in another brand');
        sets.push(`production_id = $${vals.push(p.id)}`);
      } else sets.push('production_id = NULL');
      sets.push('production_locked = TRUE');
    }
    if (!sets.length) return res.status(400).json({ error: 'Nothing to change' });
    const { rows } = await db.query(`UPDATE library_items SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1 RETURNING ${ITEM_COLS}`, vals);
    res.json({ ok: true, item: withThumb(rows[0]) });
  } catch (err) { errorJson(res, err); }
});

router.delete('/items/:id', async (req, res) => {
  try {
    if (!isEditor(req.user)) return res.status(403).json({ error: 'Editor access required' });
    const it = await itemWithBrand(req.params.id);
    if (!canBrand(req.user, it.brand_id)) return res.status(403).json({ error: 'No access to this brand' });
    if (it.source === 'sheet') return res.status(400).json({ error: 'This file comes from the synced sheet — remove its row there' });
    await db.query('DELETE FROM library_items WHERE id = $1', [it.id]);
    logAction({ production_id: it.production_id, action: 'delete', entity: 'library', summary: `Removed “${it.title}” from The Library`, user_id: req.user?.id, user_name: req.user?.name || req.user?.email || null });
    res.json({ ok: true });
  } catch (err) { errorJson(res, err); }
});

/** → { url } a direct download (the file stays in Dropbox) */
router.get('/items/:id/download', async (req, res) => {
  try {
    const it = await itemWithBrand(req.params.id);
    if (!canBrand(req.user, it.brand_id)) return res.status(403).json({ error: 'No access to this brand' });
    res.json({ url: await lib.downloadUrl(it) });
  } catch (err) { errorJson(res, err); }
});

// ── Google Sheets the Library syncs from ──
router.post('/sources', async (req, res) => {
  try {
    if (!isEditor(req.user)) return res.status(403).json({ error: 'Editor access required' });
    const brandId = String(req.body?.brand_id || '');
    if (!canBrand(req.user, brandId)) return res.status(403).json({ error: 'No access to this brand' });
    const sheetId = sheet.sheetIdOf(req.body?.url);
    if (!sheetId) return res.status(400).json({ error: 'Paste the Google Sheet’s link' });
    const { rows } = await db.query(
      `INSERT INTO library_sources (brand_id, sheet_id, created_by) VALUES ($1, $2, $3)
       ON CONFLICT (brand_id, sheet_id) DO UPDATE SET created_by = library_sources.created_by RETURNING id`,
      [brandId, sheetId, req.user?.name || req.user?.email || null]
    );
    const result = await sheet.syncSource(rows[0].id, { by: req.user?.name || 'someone' });
    res.json({ ok: result.ok, result, sources: await sourcesFor(brandId) });
  } catch (err) { errorJson(res, err); }
});

router.post('/sources/:id/sync', async (req, res) => {
  try {
    if (!isEditor(req.user)) return res.status(403).json({ error: 'Editor access required' });
    const { rows: [src] } = await db.query('SELECT id, brand_id FROM library_sources WHERE id = $1', [req.params.id]);
    if (!src || !canBrand(req.user, src.brand_id)) return res.status(404).json({ error: 'Sheet not found' });
    const result = await sheet.syncSource(src.id, { by: req.user?.name || 'someone' });
    res.json({ ok: result.ok, result });
  } catch (err) { errorJson(res, err); }
});

/** Stop syncing (the files already in the Library stay). */
router.delete('/sources/:id', async (req, res) => {
  try {
    if (!isEditor(req.user)) return res.status(403).json({ error: 'Editor access required' });
    const { rows: [src] } = await db.query('SELECT id, brand_id FROM library_sources WHERE id = $1', [req.params.id]);
    if (!src || !canBrand(req.user, src.brand_id)) return res.status(404).json({ error: 'Sheet not found' });
    await db.query('DELETE FROM library_sources WHERE id = $1', [src.id]);
    res.json({ ok: true });
  } catch (err) { errorJson(res, err); }
});

module.exports = router;

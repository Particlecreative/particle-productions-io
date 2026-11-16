/**
 * MEDIUM — the picture behind a named template. A design brief that names a house template ("Search Bar",
 * "Hero 25 / Hero 30" …) opens "Please look at attached reference (the Search Bar static…)", but a template is only a
 * name. Its picture is on the last Monday ticket that used it — the Relevant Files the requester attached (IEFC Search
 * Bar, 21 Oct 2026 → the search-bar static it copies). Tomer, 16 Nov 2026: "where is the attached reference".
 *
 *   matchTemplate(text, templates) — pure (tested): the brief's template field → a template row, longest match wins
 *   withTemplate(b, opts)          — referencesOf(b), plus the template's example when the brief has no picture of its own
 *   assetUrl(id) / checkAsset()    — short-lived signed URLs (Monday's own file links expire after an hour; never stored)
 */
const crypto = require('crypto');
const db = require('../../db');
const monday = require('../monday');
const { BOARDS } = require('./config');
const { referencesOf } = require('./references');

const IMAGE = /\.(jpe?g|png|webp|gif)$/i;
const VIDEO = /\.(mp4|mov|m4v|webm)$/i;
const MAX_FILES = 3;

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9%]+/g, ' ').trim();

/** The template a brief's template field names ("Search Bar (static)" → Search Bar), or null (pure). */
function matchTemplate(text, templates) {
  const t = ` ${norm(text)} `;
  if (!t.trim()) return null;
  let best = null, bestLen = 0;
  for (const row of templates || []) {
    const words = [row.name, ...String(row.name || '').split(/\s+\/\s+/), ...(row.match || [])].map(norm).filter(w => w.length >= 3);
    for (const w of words) {
      if (t.includes(` ${w} `) && w.length > bestLen) { best = row; bestLen = w.length; }
    }
  }
  return best;
}

// ── signed asset URLs ────────────────────────────────────────────────────────
const sign = (id, exp) => crypto.createHmac('sha256', process.env.JWT_SECRET || 'x').update(`medium-asset:${id}:${exp}`).digest('hex').slice(0, 32);
function assetUrl(id) {
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  return `/api/medium/asset/${encodeURIComponent(id)}?exp=${exp}&sig=${sign(id, exp)}`;
}
function checkAsset(id, exp, sig) {
  if (!/^\d{1,15}$/.test(String(id)) || !Number(exp) || Number(exp) < Date.now() / 1000) return false;
  const want = sign(id, Number(exp)), got = String(sig || '');
  return got.length === want.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(want));
}
/** Monday's fresh link for one file (valid ~1h; cached 40 min so a redirect always has time left). */
async function assetLink(id) {
  const [a] = await monday.cached(`medium:asset:${id}`, 40 * 60 * 1000, () => monday.assetsByIds([id]));
  return a?.public_url ? { url: a.public_url, name: a.name, ext: String(a.file_extension || '').replace(/^\./, '').toLowerCase() } : null;
}

// ── a template's example, from Monday ────────────────────────────────────────
const activeTemplates = () => monday.cached('medium:templates', 10 * 60 * 1000,
  () => db.query('SELECT name, format, description, match FROM medium_templates WHERE active').then(r => r.rows));

/** The Relevant Files of the latest ticket that used the template (same board first) → { item, files } | null. */
function exampleOf(name, format) {
  return monday.cached(`medium:tplref:${name}:${format}`, 30 * 60 * 1000, async () => {
    const { rows } = await db.query(
      `SELECT item_id, name, format, board_id, monday_created FROM medium_exemplars
        WHERE NOT excluded AND template = $1 ORDER BY (format = $2) DESC, monday_created DESC LIMIT 6`, [name, format]);
    if (!rows.length) return null;
    const cols = [...new Set(Object.values(BOARDS).map(b => b.columns.files))];
    const d = await monday.mondayQuery(`query ($ids: [ID!]) { items(ids: $ids) { id name column_values(ids: ${JSON.stringify(cols)}) { id value } } }`, { ids: rows.map(r => r.item_id) });
    const byId = new Map((d?.items || []).map(it => [String(it.id), it]));
    for (const row of rows) {
      const it = byId.get(String(row.item_id));
      const col = (it?.column_values || []).find(c => c.id === BOARDS[row.format]?.columns.files);
      let v = null;
      try { v = col?.value ? JSON.parse(col.value) : null; } catch { v = null; }
      const files = (v?.files || [])
        .filter(f => f?.assetId && (!f.fileType || f.fileType === 'ASSET') && (IMAGE.test(f.name || '') || VIDEO.test(f.name || '')))
        .slice(0, MAX_FILES)
        .map(f => ({ asset_id: String(f.assetId), name: String(f.name), kind: VIDEO.test(f.name) ? 'video' : 'image' }));
      if (files.length) {
        return { item: { item_id: String(row.item_id), name: it.name || row.name, board_id: String(row.board_id || BOARDS[row.format]?.board_id || ''), date: row.monday_created }, files };
      }
    }
    return null;
  });
}

const itemUrl = (item) => (item.board_id ? `https://particle-for-men.monday.com/boards/${item.board_id}/pulses/${item.item_id}` : null);

/** The template's example as references (signed URLs — never stored), [] when it has none. */
async function templateReferences(b) {
  const label = b?.fields?.template;
  if (!label) return [];
  const t = matchTemplate(label, await activeTemplates());
  if (!t) return [];
  const ex = await exampleOf(t.name, b.format === 'design' ? 'design' : 'video');
  if (!ex) return [];
  return ex.files.map((f, i) => ({
    kind: 'template', key: `template:${f.asset_id}`, template: t.name,
    label: ex.files.length > 1 ? `${t.name} template (${i + 1} of ${ex.files.length})` : `${t.name} template`,
    image: f.kind === 'image' ? assetUrl(f.asset_id) : null, video: f.kind === 'video' ? assetUrl(f.asset_id) : null,
    asset_id: f.asset_id, file_name: f.name, format: f.kind === 'video' ? 'video' : 'static',
    link: itemUrl(ex.item), note: t.description || null, example: ex.item,
  }));
}

/**
 * Everything the brief is written from: its own references (the winner, Freeform ones) — and, when none of them is a
 * picture, the named template's example from Monday. Never throws: Monday being slow only drops the template part.
 */
async function withTemplate(b, opts = {}) {
  const refs = referencesOf(b, opts);
  if (refs.some(r => r.image || r.video)) return refs;
  let timer;
  const extra = await Promise.race([
    templateReferences(b),
    new Promise(resolve => { timer = setTimeout(() => resolve([]), opts.timeoutMs || 8000); }),
  ]).catch(e => { console.warn('[medium] template reference:', e.message); return []; }).finally(() => clearTimeout(timer));
  return [...extra, ...refs].slice(0, 8);
}

module.exports = { matchTemplate, templateReferences, withTemplate, assetUrl, checkAsset, assetLink };

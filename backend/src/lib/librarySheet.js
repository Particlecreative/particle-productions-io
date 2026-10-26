/**
 * The Library ← a Google Sheet of TV commercials (e.g. "TV Commercials": a tab per product, a row per version,
 * and per market [US | CA | AUS | UK | ITALY…]: a checkbox, the file LINK, the landing URL and a creative/promo code).
 *
 * Sync (every 15 minutes and on demand): each row × market with a link is one Library file (a TV master).
 *  - new rows appear, edited rows update, rows removed from the sheet drop out (only files that came from the sheet)
 *  - a row joins a CP production when the name clearly matches it AND the file is from the production's time;
 *    everything else is "Before 2026". A production chosen by hand always wins over the sync.
 */
const crypto = require('crypto');
const { google } = require('googleapis');
const db = require('../db');
const lib = require('./library');
const dbx = require('./creative/providers/dropbox');
const W = require('./creative/week');
const { canonicalUrl, linkKind } = require('./creative/snapshot');
const { tokens } = require('./studio/tvLinks');

const FIELDS = { name: /^(name|title|commercial)$/i, link: /^(link|file|mov|dropbox)$/i, url: /^(url|landing|landing page)$/i, code: /(creative|promo)\s*code|^code$/i, notes: /^notes?$/i };
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const sha = (s) => crypto.createHash('sha1').update(s).digest('hex');

/** Spreadsheet id from a link or the id itself. */
function sheetIdOf(input) {
  const s = String(input || '').trim();
  const m = s.match(/\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/);
  if (m) return m[1];
  return /^[A-Za-z0-9_-]{20,}$/.test(s) ? s : null;
}

/** "particlemen.com - https://…" → { vanity, url } */
function parseLanding(s) {
  const t = String(s || '').trim();
  if (!t) return { vanity: null, url: null };
  const url = (t.match(/https?:\/\/\S+/) || [])[0] || null;
  const before = url ? t.slice(0, t.indexOf(url)).replace(/[\s\-–—:|]+$/, '').trim() : t;
  return { vanity: before || null, url };
}

/**
 * One tab → rows. Headers are read, not assumed: NAME, then for each market a column holding the market's
 * name (its checkbox) followed by LINK / URL / CODE columns, and NOTES.
 * cells: [[{ text, link }]] (row-major, header first)
 */
function parseTab(cells) {
  const header = (cells[0] || []).map(c => String(c?.text || '').trim());
  let nameCol = header.findIndex(h => FIELDS.name.test(h));
  if (nameCol < 0) nameCol = 0;
  const notesCol = header.findIndex(h => FIELDS.notes.test(h));
  const groups = [];
  let g = null;
  header.forEach((h, i) => {
    if (!h || i === nameCol || i === notesCol) return;
    if (FIELDS.link.test(h)) { if (g) g.link = i; else groups.push(g = { market: null, flag: null, link: i }); return; }
    if (FIELDS.url.test(h)) { if (g) g.url = i; return; }
    if (FIELDS.code.test(h)) { if (g) g.code = i; return; }
    groups.push(g = { market: h.toUpperCase().slice(0, 20), flag: i }); // a market column (its checkbox)
  });
  const rows = [];
  for (const r of cells.slice(1)) {
    const name = String(r?.[nameCol]?.text || '').trim();
    if (!name) continue;
    const markets = [];
    for (const grp of groups) {
      if (grp.link == null) continue;
      const cell = r[grp.link] || {};
      const raw = cell.link || ((String(cell.text || '').match(/https?:\/\/\S+/) || [])[0]) || '';
      if (!raw) continue;
      const flag = String(r[grp.flag]?.text || '').trim().toUpperCase();
      const landing = parseLanding(r[grp.url]?.text);
      markets.push({
        market: grp.market || 'US',
        on_air: flag === 'TRUE' ? true : flag === 'FALSE' ? false : null,
        link: raw.trim(),
        vanity: landing.vanity,
        landing_url: landing.url,
        code: String(r[grp.code]?.text || '').trim() || null,
      });
    }
    if (markets.length) rows.push({ name, notes: notesCol >= 0 ? String(r[notesCol]?.text || '').trim() || null : null, markets });
  }
  return rows;
}

/** Every file the sheet lists, keyed so the next sync updates it in place. */
function sheetEntries(sheetId, tabs) {
  const out = [];
  for (const tab of tabs) {
    const product = /^all\b/i.test(tab.title) ? null : tab.title;
    const seen = {};
    for (const row of parseTab(tab.cells)) {
      const base = `${tab.title}|${norm(row.name)}`;
      const occ = (seen[base] = (seen[base] || 0) + 1);
      const group = sha(`${sheetId}|${base}|${occ}`).slice(0, 16);
      const { specs } = lib.classify(`${row.name}.mov`);
      for (const m of row.markets) {
        const url = canonicalUrl(m.link) || m.link;
        out.push({
          source_key: `sheet:${sha(`${sheetId}|${base}|${occ}|${m.market}`)}`,
          group, tab: tab.title, product, title: row.name, notes: row.notes,
          url, market: m.market, on_air: m.on_air, code: m.code, vanity: m.vanity, landing_url: m.landing_url,
          specs: { ...(specs.duration ? { duration: specs.duration } : {}), ...(specs.version ? { version: specs.version } : {}), group },
        });
      }
    }
  }
  return out;
}

async function sheetsClient() {
  const { oauth2 } = await require('../routes/scripts').getGoogleDrive();
  return { sheets: google.sheets({ version: 'v4', auth: oauth2 }), drive: google.drive({ version: 'v3', auth: oauth2 }) };
}

/** → { title, tabs: [{ title, cells }] } — text and real hyperlinks, every visible tab. */
async function readSheet(sheetId) {
  const { sheets } = await sheetsClient();
  const res = await sheets.spreadsheets.get({
    spreadsheetId: sheetId,
    includeGridData: true,
    fields: 'properties.title,sheets(properties(title,hidden),data(rowData(values(formattedValue,hyperlink))))',
  });
  const tabs = (res.data.sheets || [])
    .filter(s => !s.properties?.hidden)
    .map(s => ({
      title: s.properties.title,
      cells: (s.data?.[0]?.rowData || []).map(r => (r.values || []).map(v => ({ text: v.formattedValue || '', link: v.hyperlink || null }))),
    }));
  return { title: res.data.properties?.title || null, tabs };
}

/** File name / size / date for a link (Dropbox, Google Drive), best effort. */
async function fileMeta(url, drive) {
  try {
    const kind = linkKind(url);
    if (kind === 'dropbox_file') {
      const [e] = await dbx.sharedFileEntry(url);
      return e ? { file_name: e.name, size_bytes: e.size, file_modified: e.modified, entry_key: null } : null;
    }
    if (kind === 'dropbox_folder') {
      // A folder of finals: point at its main video, so the poster and download work
      const entries = await dbx.listSharedFolder(url, { maxDepth: 1, maxFiles: 30 });
      const v = entries.filter(e => e.kind === 'video').sort((a, b) => (b.preferred - a.preferred) || ((b.size || 0) - (a.size || 0)))[0];
      return v ? { file_name: v.name, size_bytes: v.size, file_modified: v.modified, entry_key: v.key } : { file_name: null, size_bytes: null, file_modified: null, entry_key: null };
    }
    const g = String(url).match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?id=)([A-Za-z0-9_-]{20,})/);
    if (g && drive) {
      const r = await drive.files.get({ fileId: g[1], fields: 'name,size,createdTime,modifiedTime', supportsAllDrives: true });
      return { file_name: r.data.name, size_bytes: Number(r.data.size) || null, file_modified: r.data.createdTime || r.data.modifiedTime, entry_key: null };
    }
  } catch { /* the link may be private or gone — keep it anyway */ }
  return null;
}

// A market in the row can point at a production made for it ("Italian Aggressive + Most Men")
const MARKET_WORDS = { ITALY: ['italian', 'italy'], UK: ['uk', 'british', 'britain'], AUS: ['australia', 'australian', 'aussie'], CA: ['canada', 'canadian'], ES: ['spanish', 'spain'] };
const ANY_MARKET = new Set(Object.values(MARKET_WORDS).flat());
// Words too common to point at a production on their own ("Most Men", "Why Would You")
const WEAK = new Set(['you', 'your', 'our', 'most', 'men', 'man', 'guys', 'guy', 'all', 'more']);

function inTime(p, fileDate) {
  if (!fileDate) return null;
  const at = W.localDate(new Date(fileDate).getTime());
  const created = p.created_at ? W.localDate(new Date(p.created_at).getTime()) : null;
  const from = p.planned_start || created;
  const to = p.air_date || p.delivery_date || p.planned_end || W.localDate(Date.now());
  return !(from && at < W.addDays(from, -60)) && !(at > W.addDays(to, 120));
}

/**
 * Productions a sheet row could belong to, best first. Product-aware: a row on the Hand Cream tab only ever
 * matches a Hand Cream production; then shared name words, the market and the file's date decide.
 * → [{ id, name, score, why, hits, coverage, in_time }]
 */
function rankProductions(entry, productions, fileDate) {
  const rowTok = new Set(tokens(entry.title));
  const product = entry.product ? norm(entry.product) : null;
  const out = [];
  for (const p of productions) {
    const pProducts = (p.product_type || []).map(norm);
    const productMatch = product ? (pProducts.includes(product) || norm(p.name).includes(product)) : false;
    if (product && !productMatch) continue;
    const productTok = new Set([...(entry.product ? tokens(entry.product) : []), ...pProducts.flatMap(tokens)]);
    const pTok = [...new Set(tokens(p.name))].filter(t => !productTok.has(t));
    const marketHit = (MARKET_WORDS[entry.market] || []).filter(w => pTok.includes(w));
    // A production made for a market ("Italian …") is only for that market's files
    if (pTok.some(t => ANY_MARKET.has(t)) && !marketHit.length) continue;
    const hits = pTok.filter(t => rowTok.has(t) || marketHit.includes(t));
    const strong = hits.filter(t => !WEAK.has(t));
    const coverage = pTok.length ? hits.length / pTok.length : null; // null: the production is just its product
    // A suggestion needs a real word in common, or every word of the production's name, or a production that's just its product
    if (!strong.length && coverage !== 1 && !(productMatch && coverage === null)) continue;
    const time = inTime(p, fileDate);
    const score = (productMatch ? 2 : 0) + strong.length * 2 + (hits.length - strong.length) + (coverage === 1 ? 1 : 0) + (time === true ? 1 : time === false ? -3 : 0);
    const why = [productMatch && entry.product, hits.length && `“${hits.join(' ')}”`, time === true && 'same time'].filter(Boolean).join(' · ');
    out.push({ id: p.id, name: p.name, score, why, hits: hits.length, coverage, in_time: time });
  }
  return out.sort((a, b) => b.score - a.score);
}

/** Linked automatically only when it's clear: every word of the production's name, the file from its time, no close second. */
function matchProduction(entry, productions, fileDate) {
  const [best, second] = rankProductions(entry, productions, fileDate);
  if (!best || best.coverage !== 1 || best.in_time !== true || (second && second.score >= best.score)) return null;
  return best.id;
}

let running = null;
async function syncSource(sourceId, { by = 'sync' } = {}) {
  const { rows: [source] } = await db.query('SELECT * FROM library_sources WHERE id = $1', [sourceId]);
  if (!source) throw Object.assign(new Error('Sheet not found'), { status: 404 });
  const t0 = Date.now();
  let result;
  try {
    const sheet = await readSheet(source.sheet_id);
    const entries = sheetEntries(source.sheet_id, sheet.tabs);
    const { rows: existing } = await db.query(
      `SELECT id, source_key, url, file_name, file_modified, production_id, production_locked FROM library_items WHERE brand_id = $1 AND source = 'sheet'`,
      [source.brand_id]
    );
    const have = Object.fromEntries(existing.map(r => [r.source_key, r]));
    const { rows: productions } = await db.query(
      `SELECT id, project_name AS name, product_type, created_at, planned_start::text AS planned_start, planned_end::text AS planned_end,
              delivery_date::text AS delivery_date, air_date::text AS air_date
         FROM productions WHERE brand_id = $1 AND COALESCE(stage, '') NOT ILIKE '%cancel%'`,
      [source.brand_id]
    );
    for (const p of productions) p.product_type = Array.isArray(p.product_type) ? p.product_type : [];

    // File details for new / changed links (a few at a time; the rest on the next sync)
    const { drive } = await sheetsClient().catch(() => ({}));
    const todo = entries.filter(e => !have[e.source_key] || have[e.source_key].url !== e.url || (!have[e.source_key].file_name && !have[e.source_key].file_modified)).slice(0, 80);
    const meta = {};
    for (let i = 0; i < todo.length; i += 6) {
      await Promise.all(todo.slice(i, i + 6).map(async e => { meta[e.source_key] = await fileMeta(e.url, drive); }));
    }

    let added = 0;
    let updated = 0;
    let linked = 0;
    for (const e of entries) {
      const prev = have[e.source_key];
      const m = meta[e.source_key] || null;
      const fileName = m?.file_name ?? prev?.file_name ?? null;
      const fileDate = m?.file_modified ?? prev?.file_modified ?? null;
      const productionId = prev?.production_locked ? prev.production_id : matchProduction(e, productions, fileDate);
      if (productionId) linked++;
      const ext = fileName ? dbx.extOf(fileName) : null;
      const vals = [
        source.brand_id, productionId, e.title, e.product, e.url, m ? m.entry_key : undefined, fileName, ext,
        fileName ? lib.fileKind(fileName) : 'video', m?.size_bytes ?? null, fileDate, JSON.stringify(e.specs),
        e.market, e.on_air, e.code, e.vanity, e.landing_url, e.notes, e.source_key,
      ];
      if (!prev) {
        await db.query(
          `INSERT INTO library_items (brand_id, production_id, category, title, product, url, entry_key, file_name, ext, file_kind, size_bytes, file_modified, specs,
                                      market, on_air, code, vanity, landing_url, notes, source, source_key, added_by)
           VALUES ($1,$2,'tv_master',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'sheet',$19,'Sheet sync')
           ON CONFLICT (source_key) DO NOTHING`,
          vals.map(v => (v === undefined ? null : v))
        );
        added++;
      } else {
        const r = await db.query(
          `UPDATE library_items SET
              production_id = CASE WHEN production_locked THEN production_id ELSE $2 END,
              title = $3, product = $4, url = $5,
              entry_key = CASE WHEN $20 THEN $6 ELSE entry_key END,
              file_name = COALESCE($7, file_name), ext = COALESCE($8, ext), file_kind = COALESCE($9, file_kind),
              size_bytes = COALESCE($10, size_bytes), file_modified = COALESCE($11, file_modified), specs = $12,
              market = $13, on_air = $14, code = $15, vanity = $16, landing_url = $17, notes = $18, updated_at = NOW()
            WHERE source_key = $19 AND brand_id = $1 AND (
              production_id IS DISTINCT FROM (CASE WHEN production_locked THEN production_id ELSE $2 END) OR title IS DISTINCT FROM $3 OR product IS DISTINCT FROM $4
              OR url IS DISTINCT FROM $5 OR specs IS DISTINCT FROM $12::jsonb OR market IS DISTINCT FROM $13 OR on_air IS DISTINCT FROM $14
              OR code IS DISTINCT FROM $15 OR vanity IS DISTINCT FROM $16 OR landing_url IS DISTINCT FROM $17 OR notes IS DISTINCT FROM $18
              OR ($7::text IS NOT NULL AND file_name IS DISTINCT FROM $7) OR $20)`,
          [...vals.map(v => (v === undefined ? null : v)), m ? true : false]
        );
        updated += r.rowCount;
      }
    }
    // Rows gone from the sheet — only when the sheet read back something, so an empty read never wipes the Library
    let removed = 0;
    if (entries.length) {
      const keep = new Set(entries.map(e => e.source_key));
      const gone = existing.filter(r => !keep.has(r.source_key)).map(r => r.id);
      if (gone.length) removed = (await db.query('DELETE FROM library_items WHERE id = ANY($1::uuid[])', [gone])).rowCount;
    }
    result = {
      ok: true, by, ms: Date.now() - t0, tabs: sheet.tabs.map(t => t.title), files: entries.length,
      commercials: new Set(entries.map(e => e.specs.group)).size, added, updated, removed, linked,
      pending_details: Math.max(0, entries.filter(e => !have[e.source_key] || have[e.source_key].url !== e.url).length - todo.length),
    };
    await db.query('UPDATE library_sources SET title = COALESCE($2, title), last_synced_at = NOW(), last_result = $3 WHERE id = $1', [source.id, sheet.title, JSON.stringify(result)]);
  } catch (e) {
    result = { ok: false, by, ms: Date.now() - t0, error: e.message };
    await db.query('UPDATE library_sources SET last_synced_at = NOW(), last_result = $2 WHERE id = $1', [source.id, JSON.stringify(result)]).catch(() => {});
  }
  return result;
}

/** Every connected sheet (the 15-minute job). Never two syncs at once. */
async function syncAll() {
  if (running) return running;
  running = (async () => {
    const { rows } = await db.query('SELECT id FROM library_sources').catch(() => ({ rows: [] }));
    const out = [];
    for (const r of rows) out.push(await syncSource(r.id));
    return out;
  })().finally(() => { running = null; });
  return running;
}

module.exports = { sheetIdOf, parseLanding, parseTab, sheetEntries, readSheet, syncSource, syncAll, matchProduction, rankProductions };

/**
 * The CP weekly report (productions + general updates) for a week: imported into decks, and — when edited from a
 * deck — written back field by field (saveCpWeekly), so the old Weekly shows the same text.
 */
const crypto = require('crypto');
const db = require('../../db');
const W = require('./week');

/**
 * Which CP weekly a deck shows: the FOLLOWING week's. The deck is presented on Sunday about the Sun–Thu that just
 * ended (e.g. Oct 18–22), while TV & productions look ahead — that's the weekly of Oct 25.
 */
const cpWeekFor = (deckWeekStart) => W.addDays(deckWeekStart, 7);

async function importCpWeekly(brandId, weekStart) {
  const { rows } = await db.query(
    `SELECT id, week_start, title, entries, general_updates, creative_link, updated_at
       FROM weekly_reports WHERE brand_id = $1 AND week_start = $2`,
    [brandId, weekStart]
  );
  const wr = rows[0];
  if (!wr) return { found: false, week_start: weekStart, weekly_report_id: null, updated_at: null, productions: [], general_updates: [] };

  const entries = Array.isArray(wr.entries) ? wr.entries : [];
  const prodIds = [...new Set(entries.map(e => e.production_id).filter(Boolean))];
  const prodMap = {};
  if (prodIds.length) {
    const { rows: prods } = await db.query(
      `SELECT id, project_name, stage, brand_id, production_type, product_type,
              planned_start::text AS planned_start, planned_end::text AS planned_end,
              delivery_date::text AS delivery_date, shoot_dates, producer
         FROM productions WHERE id = ANY($1)`,
      [prodIds]
    );
    for (const p of prods) prodMap[p.id] = p;
  }
  const { rows: brands } = await db.query('SELECT id, name, primary_color FROM brands');
  const brandMap = Object.fromEntries(brands.map(b => [b.id, b]));

  const productions = entries
    .filter(e => e.production_id)
    .map(e => {
      const p = prodMap[e.production_id] || {};
      const bId = e.brand_id || p.brand_id || brandId;
      const b = brandMap[bId] || {};
      return {
        production_id: e.production_id,
        name: p.project_name || e.production_id,
        stage: p.stage || '',
        production_type: p.production_type || '',
        product_type: Array.isArray(p.product_type) ? p.product_type : [],
        planned_start: p.planned_start || null,
        planned_end: p.planned_end || null,
        delivery_date: p.delivery_date || null,
        shoot_dates: (Array.isArray(p.shoot_dates) ? p.shoot_dates : []).map(d => String(d).slice(0, 10)).filter(Boolean),
        producer: p.producer || null,
        brand: { id: bId, name: b.name || bId, color: b.primary_color || null },
        cross_brand: bId !== brandId,
        note: (e.long_text ?? e.note ?? '').toString(),
        bullets: (Array.isArray(e.bullets) ? e.bullets : [])
          .filter(x => x && (x.text || '').trim())
          .map(x => ({ id: x.id || null, text: x.text, link: x.link || null })),
        links: (Array.isArray(e.weekly_links) ? e.weekly_links : [])
          .filter(l => l && l.url)
          .map(l => ({ id: l.id || null, title: l.title || l.url, url: l.url })),
      };
    });

  const general_updates = (Array.isArray(wr.general_updates) ? wr.general_updates : [])
    .filter(u => u && ((u.text || '').trim() || u.file))
    .map(u => ({
      id: u.id || null,
      text: u.text || '',
      link: u.link || null,
      file: u.file ? { name: u.file.name, view_url: u.file.view_url || null, mime_type: u.file.mime_type || null } : null,
    }));

  return {
    found: true,
    week_start: weekStart,
    weekly_report_id: wr.id,
    updated_at: wr.updated_at ? new Date(wr.updated_at).toISOString() : null,
    creative_link: wr.creative_link || null,
    productions,
    general_updates,
  };
}

/** Cheap staleness check: has the CP weekly changed since we imported it? */
async function cpWeeklyUpdatedAt(brandId, weekStart) {
  const { rows } = await db.query(
    'SELECT updated_at FROM weekly_reports WHERE brand_id = $1 AND week_start = $2',
    [brandId, weekStart]
  );
  return rows[0]?.updated_at ? new Date(rows[0].updated_at).toISOString() : null;
}

const safeUrl = (u) => (/^https?:\/\/\S+$/i.test(String(u || '').trim()) ? String(u).trim().slice(0, 2000) : '');
const clip = (t, n) => String(t ?? '').slice(0, n);
const conflict = () => Object.assign(new Error('The CP weekly was edited elsewhere since this deck imported it'), { status: 409, code: 'CP_WEEKLY_CHANGED' });

/**
 * Write a deck's edits back to the CP weekly — only the fields edited, on the latest saved version, in one
 * transaction — and refuse when the weekly changed after the deck imported it (baseUpdatedAt), so nobody's edit in
 * the old Weekly is overwritten.
 *  production: { production_id, long_text?, bullets?: [{ id, text, link }], links?: [{ id, title, url }] }
 *  generalUpdates: [{ id, text, link }] — files on existing updates are kept
 */
async function saveCpWeekly(brandId, weekStart, { baseUpdatedAt = null, production = null, generalUpdates = null } = {}) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id, entries, general_updates, updated_at FROM weekly_reports WHERE brand_id = $1 AND week_start = $2 FOR UPDATE', [brandId, weekStart]);
    let wr = rows[0];
    const current = wr?.updated_at ? new Date(wr.updated_at).toISOString() : null;
    if ((baseUpdatedAt || null) !== current) throw conflict();
    if (!wr) {
      if (production) throw Object.assign(new Error('There is no CP weekly for that week yet'), { status: 404 });
      const ins = await client.query(
        `INSERT INTO weekly_reports (id, brand_id, week_start, entries, general_updates, title, updated_at)
         VALUES ($1, $2, $3, '[]', '[]', '', NOW()) RETURNING id, entries, general_updates, updated_at`,
        [crypto.randomUUID(), brandId, weekStart]);
      wr = ins.rows[0];
    }
    let entries = Array.isArray(wr.entries) ? wr.entries : [];
    if (production) {
      const i = entries.findIndex(e => e.production_id === production.production_id);
      if (i < 0) throw Object.assign(new Error('That production is no longer in the CP weekly'), { status: 404 });
      const e = { ...entries[i] };
      if (production.long_text !== undefined) e.long_text = clip(production.long_text, 8000);
      if (Array.isArray(production.bullets)) {
        e.bullets = production.bullets.filter(b => b && String(b.text || '').trim()).slice(0, 40)
          .map(b => ({ id: b.id || crypto.randomUUID(), text: clip(b.text, 1000), link: safeUrl(b.link) }));
      }
      if (Array.isArray(production.links)) {
        const old = Array.isArray(e.weekly_links) ? e.weekly_links : [];
        e.weekly_links = production.links.map(l => ({ ...l, url: safeUrl(l.url) })).filter(l => l.url).slice(0, 30).map(l => {
          const prev = old.find(o => o.id && o.id === l.id);
          return prev ? { ...prev, title: clip(l.title || l.url, 300), url: l.url }
            : { id: `wl-${crypto.randomUUID().slice(0, 8)}`, type: 'custom', link_id: null, title: clip(l.title || l.url, 300), url: l.url, approved: false };
        });
      }
      entries = entries.map((x, j) => (j === i ? e : x));
    }
    let general = Array.isArray(wr.general_updates) ? wr.general_updates : [];
    if (Array.isArray(generalUpdates)) {
      const old = general;
      general = generalUpdates.slice(0, 40).map(u => {
        const prev = old.find(o => o.id && o.id === u.id);
        return { ...(prev || { id: crypto.randomUUID(), file: null }), text: clip(u.text, 4000), link: safeUrl(u.link) };
      }).filter(u => u.text.trim() || u.link || u.file);
    }
    await client.query('UPDATE weekly_reports SET entries = $2, general_updates = $3, updated_at = NOW() WHERE id = $1',
      [wr.id, JSON.stringify(entries), JSON.stringify(general)]);
    await client.query('COMMIT');
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch { /* already rolled back */ }
    throw e;
  } finally { client.release(); }
}

module.exports = { importCpWeekly, cpWeeklyUpdatedAt, cpWeekFor, saveCpWeekly };

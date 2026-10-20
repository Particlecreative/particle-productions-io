/**
 * Read-only import of the CP weekly report (productions + general updates) for a week.
 * Never writes weekly_reports — the existing Weekly feature stays untouched.
 */
const db = require('../../db');

async function importCpWeekly(brandId, weekStart) {
  const { rows } = await db.query(
    `SELECT id, week_start, title, entries, general_updates, creative_link, updated_at
       FROM weekly_reports WHERE brand_id = $1 AND week_start = $2`,
    [brandId, weekStart]
  );
  const wr = rows[0];
  if (!wr) return { found: false, weekly_report_id: null, updated_at: null, productions: [], general_updates: [] };

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
          .map(x => ({ text: x.text, link: x.link || null })),
        links: (Array.isArray(e.weekly_links) ? e.weekly_links : [])
          .filter(l => l && l.url)
          .map(l => ({ title: l.title || l.url, url: l.url })),
      };
    });

  const general_updates = (Array.isArray(wr.general_updates) ? wr.general_updates : [])
    .filter(u => u && ((u.text || '').trim() || u.file))
    .map(u => ({
      text: u.text || '',
      link: u.link || null,
      file: u.file ? { name: u.file.name, view_url: u.file.view_url || null, mime_type: u.file.mime_type || null } : null,
    }));

  return {
    found: true,
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

module.exports = { importCpWeekly, cpWeeklyUpdatedAt };

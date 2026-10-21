/**
 * TV tickets ↔ CP productions. The CP production is the core; Monday TV tickets are matched to it by name.
 *  - confident match (production id in the ticket name, or every distinctive word of the production
 *    name present and clearly ahead of the runner-up) → linked automatically
 *  - plausible but not certain → "needs you": the studio panel asks, with ranked suggestions
 *  - a human decision (link / not a production) is stored and always wins
 */
const db = require('../../db');

const STOP = new Set([
  'particle', 'campaign', 'campaigns', 'the', 'and', 'for', 'with', 'from', 'into', 'our', 'your', 'tv', 'meta', 'video', 'videos',
  'static', 'statics', 'version', 'versions', 'cut', 'cuts', 'edit', 'edits', 'editing', 'digital', 'offline', 'online', 'export',
  'commercial', 'commercials', 'test', 'new', 'ads', 'shoot', 'production', 'project', 'ugc', 'creator', 'creators', 'hook', 'hooks',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'final', 'main', 'tbd', 'brand', 'spot',
  'x16', 'x9', '16x9', '9x16', '4x5', '1x1',
]);

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
function tokens(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !STOP.has(t) && !/^\d+s?$/.test(t));
}

function score(production, item) {
  const name = norm(item.name);
  if (production.id && name.includes(production.id.toLowerCase())) return { score: 100, why: 'production id in the ticket name' };
  const productTokens = new Set([...(production.product_type || []).flatMap(tokens), ...tokens(item.product?.label)]);
  const pTok = [...new Set(tokens(production.name))].filter(t => !productTokens.has(t));
  if (!pTok.length) return { score: 0 };
  const iTok = new Set([...tokens(item.name), ...tokens(item.campaign)]);
  const hit = pTok.filter(t => iTok.has(t));
  if (!hit.length) return { score: 0 };
  const coverage = hit.length / pTok.length;
  const productMatch = (production.product_type || []).some(p => norm(p) === norm(item.product?.label));
  const s = hit.length * 2 * coverage + (productMatch ? 1 : 0);
  return { score: Math.round(s * 10) / 10, coverage, why: `matches “${hit.join(' ')}”${productMatch ? ' + product' : ''}` };
}

async function loadProductions(brandId) {
  const { rows } = await db.query(
    `SELECT id, project_name AS name, stage, production_type, product_type, producer,
            planned_start::text AS planned_start, planned_end::text AS planned_end
       FROM productions
      WHERE brand_id = $1 AND COALESCE(stage, '') NOT ILIKE '%cancel%'
      ORDER BY id DESC`,
    [brandId]
  );
  return rows.map(r => ({ ...r, product_type: Array.isArray(r.product_type) ? r.product_type : [] }));
}

async function loadDecisions(itemIds) {
  if (!itemIds.length) return {};
  try {
    const { rows } = await db.query('SELECT item_id, production_id, decision, decided_by_name, decided_at FROM studio_ticket_links WHERE item_id = ANY($1)', [itemIds]);
    return Object.fromEntries(rows.map(r => [r.item_id, r]));
  } catch (e) {
    if (/studio_ticket_links/.test(e.message)) return {}; // migration not applied yet
    throw e;
  }
}

/** → { productions: [{id,name,stage}], links: { itemId: { production_id, name, source, confidence, why, suggestions } } } */
async function linkTvItems(brandId, tvItems) {
  const productions = await loadProductions(brandId);
  const byId = Object.fromEntries(productions.map(p => [p.id, p]));
  const decisions = await loadDecisions(tvItems.map(it => String(it.id)));
  const links = {};
  for (const it of tvItems) {
    const ranked = productions
      .map(p => ({ p, ...score(p, it) }))
      .filter(x => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);
    const suggestions = ranked.map(x => ({ id: x.p.id, name: x.p.name, stage: x.p.stage, score: x.score, why: x.why }));
    const d = decisions[String(it.id)];
    if (d) {
      const p = d.production_id ? byId[d.production_id] : null;
      links[it.id] = {
        production_id: p?.id || null, name: p?.name || null, stage: p?.stage || null,
        source: d.decision === 'none' ? 'none' : 'confirmed', confidence: 'human',
        decided_by: d.decided_by_name || null, decided_at: d.decided_at, suggestions,
      };
      continue;
    }
    const [best, second] = ranked;
    if (best && (best.score >= 100 || (best.score >= 3 && (!second || second.score <= best.score * 0.6)))) {
      links[it.id] = { production_id: best.p.id, name: best.p.name, stage: best.p.stage, source: 'auto', confidence: 'high', why: best.why, suggestions };
    } else {
      links[it.id] = { production_id: null, name: null, stage: null, source: 'ask', confidence: best ? 'low' : 'none', suggestions };
    }
  }
  return { productions: productions.map(p => ({ id: p.id, name: p.name, stage: p.stage, producer: p.producer })), links };
}

/** Store a human decision: productionId = link; null with decision 'none' = "not a production ticket"; clear = back to auto. */
async function decide(itemId, { productionId = null, decision = 'linked', board = null, user = null }) {
  if (decision === 'clear') {
    await db.query('DELETE FROM studio_ticket_links WHERE item_id = $1', [String(itemId)]);
    return;
  }
  await db.query(
    `INSERT INTO studio_ticket_links (item_id, board, production_id, decision, decided_by_name, decided_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (item_id) DO UPDATE SET production_id = EXCLUDED.production_id, decision = EXCLUDED.decision,
       decided_by_name = EXCLUDED.decided_by_name, decided_at = NOW(), board = COALESCE(EXCLUDED.board, studio_ticket_links.board)`,
    [String(itemId), board, decision === 'none' ? null : productionId, decision === 'none' ? 'none' : 'linked', user?.name || user?.email || null]
  );
}

module.exports = { linkTvItems, decide, score, tokens };

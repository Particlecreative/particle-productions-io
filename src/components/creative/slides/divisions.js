// The creative department's three divisions + per-person project selection + production↔ticket linking (pure).

export const DIVISIONS = {
  design: { key: 'design', label: 'Design', short: 'Design', role: 'design', personLabel: 'Designer', peopleLabel: 'designer', accent: '#a78bfa' },
  video: { key: 'video', label: 'Video', short: 'Video', role: 'video', personLabel: 'Video editor', peopleLabel: 'editor', accent: '#5b67ff' },
  tv: { key: 'tv', label: 'TV & Special Productions', short: 'TV & SP', role: null, personLabel: 'Producer', peopleLabel: 'producer', accent: '#ff8a3d' },
};
export const DIVISION_ORDER = ['design', 'video', 'tv'];

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
const TV_DEPARTMENTS = new Set(['tv', 'special project (sp)', 'special project']);

/** Division of an item (snapshots from v2 carry it; older ones are classified here). */
export function divisionOf(item) {
  if (!item) return null;
  if (item.division) return item.division;
  if (TV_DEPARTMENTS.has(norm(item.department?.label)) || norm(item.type?.label) === 'tv') return 'tv';
  return item.board;
}

export function isTv(item) { return divisionOf(item) === 'tv'; }

const ACTIVE_SECTIONS = ['review', 'in_progress', 'fixes', 'stuck'];

/**
 * Every ticket a person could present for the reviewed week, grouped:
 *   delivered (last week), active (review / in progress / fixes / stuck), worked (timeline overlapped the week).
 */
export function personCandidates(snapshot, uid) {
  const S = snapshot.sections || {};
  const mine = (list) => (list || []).filter(id => snapshot.items?.[id]?.people?.includes(uid));
  const delivered = mine(S.delivered);
  const seen = new Set(delivered);
  const active = [...new Set(ACTIVE_SECTIONS.flatMap(k => mine(S[k])))].filter(id => !seen.has(id));
  active.forEach(id => seen.add(id));
  const worked = mine(S.active_this_week).filter(id => !seen.has(id));
  return { delivered, active, worked };
}

/** Tickets shown on a person's slides: the editor's ordered selection, else everything they delivered. */
export function personSelection(snapshot, overrides, uid) {
  const sel = overrides?.people?.[uid]?.selection;
  const hidden = (id) => !!overrides?.tickets?.[id]?.hidden;
  if (Array.isArray(sel)) return sel.filter(id => snapshot.items?.[id] && !hidden(id));
  const { delivered } = personCandidates(snapshot, uid);
  const ov = overrides?.tickets || {};
  return delivered
    .filter(id => !hidden(id))
    .sort((a, b) => (Number(!!ov[b]?.highlighted) - Number(!!ov[a]?.highlighted)) || ((snapshot.items[b].delivered_at || 0) - (snapshot.items[a].delivered_at || 0)));
}

// ── Production ↔ Monday ticket linking ──────────────────────────────────────
const STOP = new Set([
  'particle', 'campaign', 'campaigns', 'the', 'and', 'for', 'with', 'from', 'into', 'our', 'your', 'tv', 'meta', 'video', 'videos',
  'static', 'statics', 'version', 'versions', 'cut', 'cuts', 'edit', 'edits', 'editing', 'digital', 'offline', 'online', 'export',
  'commercial', 'commercials', 'test', 'new', 'ads', 'shoot', 'production', 'claude', 'ugc', 'creator', 'creators', 'hook', 'hooks',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'final', 'main', 'tbd', 'brand',
]);

export function tokens(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 3 && !STOP.has(t) && !/^\d+s?$/.test(t));
}

/**
 * Score how strongly a Monday ticket belongs to a CP production.
 * Product words alone aren't enough (every Face Cream ticket shares them) — we need a campaign/concept word in common.
 */
export function productionMatchScore(production, item) {
  const prodTokens = new Set(tokens(production.name));
  const productTokens = new Set([
    ...tokens(item.product?.label),
    ...(production.product_type || []).flatMap(p => tokens(p)),
  ]);
  const itemTokens = new Set([...tokens(item.name), ...tokens(item.campaign)]);
  let concept = 0;
  for (const t of itemTokens) if (prodTokens.has(t) && !productTokens.has(t)) concept++;
  const productMatch = [...productTokens].some(t => prodTokens.has(t)) || (production.product_type || []).some(p => norm(p) === norm(item.product?.label));
  if (concept >= 2 || (concept >= 1 && productMatch)) return concept + (productMatch ? 1 : 0);
  return 0;
}

/** Tickets linked to a production: the editor's explicit list, else the auto-match (best first). */
export function productionTickets(snapshot, overrides, production) {
  const manual = overrides?.productions?.[production.production_id]?.tickets;
  const hidden = (id) => !!overrides?.tickets?.[id]?.hidden;
  if (Array.isArray(manual)) return manual.filter(id => snapshot.items?.[id] && !hidden(id));
  return autoProductionTickets(snapshot, production).filter(id => !hidden(id));
}

export function autoProductionTickets(snapshot, production) {
  const S = snapshot.sections || {};
  const pool = new Set([...(S.delivered || []), ...(S.review || []), ...(S.in_progress || []), ...(S.fixes || []), ...(S.stuck || []),
    ...(S.active_this_week || []), ...(S.planned_next_week || [])]);
  // The Studio's TV ↔ production link (auto or decided by hand in TV ↔ Productions) wins over name matching
  const score = (it) => {
    if (it.tv?.production_id) return String(it.tv.production_id) === String(production.production_id) ? 1000 : 0;
    if (it.tv?.source === 'none') return 0;
    return productionMatchScore(production, it);
  };
  // Only TV & SP tickets — digital pieces made from the same footage don't belong on a production slide
  return [...pool]
    .filter(id => snapshot.items?.[id] && isTv(snapshot.items[id]))
    .map(id => ({ id, it: snapshot.items[id], score: score(snapshot.items[id]) }))
    .filter(x => x.score > 0)
    .sort((a, b) => (b.score - a.score) || (Number(isTv(b.it)) - Number(isTv(a.it))) || ((b.it.delivered_at || 0) - (a.it.delivered_at || 0)))
    .slice(0, 12)
    .map(x => x.id);
}

/** Visible productions from the CP weekly, minus ones hidden in the editor. */
export function visibleProductions(snapshot, overrides) {
  return (snapshot.cp_weekly?.productions || []).filter(p => !overrides?.productions?.[p.production_id]?.hidden);
}

/** Does a production have something happening in [from, to]? (shoot, delivery, start/end) */
export function productionDatesIn(p, from, to) {
  const hits = [];
  for (const d of p.shoot_dates || []) if (d >= from && d <= to) hits.push({ kind: 'Shoot', date: d });
  if (p.delivery_date && p.delivery_date >= from && p.delivery_date <= to) hits.push({ kind: 'Delivery', date: p.delivery_date });
  if (p.planned_start && p.planned_start >= from && p.planned_start <= to) hits.push({ kind: 'Kick-off', date: p.planned_start });
  if (p.planned_end && p.planned_end >= from && p.planned_end <= to) hits.push({ kind: 'Wrap', date: p.planned_end });
  return hits.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The Creative team's own tasks (Tomer, 25 Nov 2026: each video editor / designer gets one place in CP instead of
 * Monday). Every Video + Design ticket where they're the editor / designer on Monday — open ones, plus the ones finished
 * lately — whatever their timeline (the Studio dashboard only holds a date window). Who they are on Monday: their
 * connected Monday, else their CP email looked up on Monday (mondayIdOf).
 */
const monday = require('../monday');
const { getCreativeConfig } = require('../creative/config');
const { normalizeItem, knownProductsOf } = require('../creative/snapshot');
const { boardStatuses } = require('./data');
const { mondayIdOf } = require('./myRequests');

const SKIP = new Set(['working_time', 'files', 'concept', 'hook', 'finished_files']);
const DAY = 86400000;

async function buildMyTasks({ brandId = 'particle', user, now = Date.now() }) {
  const me = await mondayIdOf(user);
  if (!me) return { me: null, items: [], people: {}, boards: {}, warnings: ['We couldn’t find you on Monday — connect your Monday so your tasks show here.'] };
  const config = await getCreativeConfig(brandId);
  const keys = Object.keys(config.boards);
  const metas = {};
  await Promise.all(keys.map(async bk => { metas[bk] = await monday.boardMeta(config.boards[bk].board_id); }));
  const knownProducts = new Set();
  for (const bk of keys) knownProductsOf(metas[bk], config.boards[bk].columns, knownProducts);
  const boards = {}, items = [], warnings = [];
  await Promise.all(keys.map(async (bk) => {
    const board = config.boards[bk];
    const meta = metas[bk];
    const c = board.columns;
    const { statusCategory, legend } = boardStatuses(bk, board, meta);
    boards[bk] = legend;
    if (!c.person || !meta.columns[c.person]) return;
    const cols = [...new Set(Object.entries(c).filter(([role, id]) => id && !SKIP.has(role)).map(([, id]) => id))].filter(id => meta.columns[id]);
    const { items: raws, truncated } = await monday.fetchAllItems(board.board_id, {
      cols, maxPages: 4, deadline: now + 40000,
      queryParams: { rules: [{ column_id: c.person, compare_value: [`person-${me.id}`], operator: 'any_of' }] },
    });
    if (truncated) warnings.push(`${board.label}: more than 2,000 of your tasks — the oldest are missing`);
    const ctx = { boardKey: bk, board, meta, config, bounds: { fromMs: now, toMs: now }, now, knownProducts, statusCategory };
    for (const raw of raws) {
      const it = normalizeItem(raw, ctx);
      if (!it.people.includes(me.id)) continue;
      it.open = statusCategory(it.status.label) !== 'delivered';
      // finished ones stay 45 days (by creation — Monday's item list has no "done on" date), so Done isn't empty
      if (!it.open && now - (Date.parse(it.created_at || 0) || 0) > 45 * DAY) continue;
      for (const k of ['_iv', 'tracked_s_week', 'tracked_days', 'assets', 'media_refs']) delete it[k];
      items.push(it);
    }
  }));
  // who's on them and who asked
  const ids = [...new Set(items.flatMap(it => [...it.people, ...(it.requested_by || [])]))];
  let users = [];
  try { users = await monday.usersByIds(ids); } catch (e) { warnings.push(`People lookup failed (${e.message})`); }
  const people = {};
  for (const u of users) {
    const t = config.team?.[String(u.id)] || {};
    people[String(u.id)] = { id: String(u.id), name: t.display_name || u.name, photo: u.photo_small || u.photo_thumb_small || null, role: t.role || null };
  }
  return { me, items, people, boards, warnings, generated_at: new Date(now).toISOString() };
}

/** Per person, shared for a minute (a status change from CP clears it). */
function getMyTasks({ brandId = 'particle', user, force = false }) {
  const key = `studio:${brandId}:mytasks:${user.id}`;
  if (force) monday.clearCache(key);
  return monday.cached(key, 60 * 1000, () => buildMyTasks({ brandId, user }));
}

/**
 * Is this ticket theirs — the editor / designer, or the one who asked for it? The Creative team only changes and
 * comments on their own tickets. One small read of the item's people columns.
 */
async function isMine({ brandId = 'particle', user, itemId }) {
  if (!/^\d+$/.test(String(itemId))) return false;
  const me = await mondayIdOf(user);
  if (!me) return false;
  const config = await getCreativeConfig(brandId);
  const colIds = [...new Set(Object.values(config.boards).flatMap(b => [b.columns.person, b.columns.requested_by]).filter(Boolean))];
  const d = await monday.mondayQuery('query ($ids: [ID!], $cols: [String!]) { items(ids: $ids) { id column_values(ids: $cols) { id value } } }', { ids: [String(itemId)], cols: colIds });
  for (const cv of d?.items?.[0]?.column_values || []) {
    let v = null;
    try { v = JSON.parse(cv.value || 'null'); } catch { v = null; }
    if ((v?.personsAndTeams || []).some(p => p.kind !== 'team' && String(p.id) === me.id)) return true;
  }
  return false;
}

module.exports = { getMyTasks, buildMyTasks, isMine };

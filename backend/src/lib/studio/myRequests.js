/**
 * Creative Studio → My requests (Tomer, 17 Nov 2026): the Video + Design tickets the signed-in person asked for —
 * the "Requested by" column on Monday is their Monday user. Who they are on Monday: their connected Monday
 * (lib/mondayUser.js), else their CP email looked up on Monday. Open tickets + the ones finished in the last 60 days.
 */
const monday = require('../monday');
const { getCreativeConfig } = require('../creative/config');
const { normalizeItem, knownProductsOf } = require('../creative/snapshot');
const { boardStatuses } = require('./data');

const SKIP = new Set(['working_time', 'files', 'concept', 'hook', 'finished_files']);
const DAY = 86400000;

/** Their Monday user id: { id, source: 'connected' | 'email' } or null. */
async function mondayIdOf(user) {
  const st = await require('../mondayUser').status(user.id).catch(() => null);
  if (st?.monday_user_id) return { id: String(st.monday_user_id), source: 'connected', name: st.name };
  if (!user.email) return null;
  const key = `studio:mid:${String(user.email).toLowerCase()}`;
  const d = await monday.cached(key, 6 * 3600000, () => monday.mondayQuery('query ($e: [String]) { users(emails: $e) { id name } }', { e: [String(user.email)] })).catch(() => null);
  const u = d?.users?.[0];
  return u?.id ? { id: String(u.id), source: 'email', name: u.name } : null;
}

async function buildMyRequests({ brandId = 'particle', user, now = Date.now() }) {
  const me = await mondayIdOf(user);
  if (!me) return { me: null, items: [], people: {}, boards: {}, warnings: ['We couldn’t find you on Monday — connect your Monday (Creative Studio → Connect) so your requests show here.'] };
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
    if (!c.requested_by || !meta.columns[c.requested_by]) return;
    const { statusCategory, legend } = boardStatuses(bk, board, meta);
    boards[bk] = legend;
    const cols = [...new Set(Object.entries(c).filter(([role, id]) => id && !SKIP.has(role)).map(([, id]) => id))].filter(id => meta.columns[id]);
    const { items: raws, truncated } = await monday.fetchAllItems(board.board_id, {
      cols, maxPages: 4, deadline: now + 40000,
      queryParams: { rules: [{ column_id: c.requested_by, compare_value: [`person-${me.id}`], operator: 'any_of' }] },
    });
    if (truncated) warnings.push(`${board.label}: more than 2,000 of your tickets — the oldest are missing`);
    const ctx = { boardKey: bk, board, meta, config, bounds: { fromMs: now, toMs: now }, now, knownProducts, statusCategory };
    for (const raw of raws) {
      const it = normalizeItem(raw, ctx);
      if (!it.requested_by.includes(me.id)) continue;
      it.open = statusCategory(it.status.label) !== 'delivered';
      const touched = Date.parse(it.updated_at || it.created_at || 0) || 0;
      if (!it.open && now - touched > 60 * DAY) continue;   // finished long ago
      for (const k of ['_iv', 'tracked_s_week', 'tracked_days', 'assets', 'media_refs']) delete it[k];
      items.push(it);
    }
  }));
  // who's working on them
  const ids = [...new Set(items.flatMap(it => it.people))];
  let users = [];
  try { users = await monday.usersByIds(ids); } catch (e) { warnings.push(`People lookup failed (${e.message})`); }
  const people = {};
  for (const u of users) {
    const t = config.team?.[String(u.id)] || {};
    people[String(u.id)] = { id: String(u.id), name: t.display_name || u.name, photo: u.photo_small || u.photo_thumb_small || null, role: t.role || null };
  }
  return { me, items, people, boards, warnings, generated_at: new Date(now).toISOString() };
}

/** Per person, shared for 2 minutes. */
function getMyRequests({ brandId = 'particle', user, force = false }) {
  const key = `studio:${brandId}:myreq:${user.id}`;
  if (force) monday.clearCache(key);
  return monday.cached(key, 2 * 60 * 1000, () => buildMyRequests({ brandId, user }));
}

module.exports = { getMyRequests, buildMyRequests, mondayIdOf };

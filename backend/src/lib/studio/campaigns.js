/**
 * Studio → Campaigns: every Video + Design ticket that has a Campaign, live from Monday
 * (the "Campaign Tracker" dashboard). Grouping and filtering happen in the browser.
 */
const monday = require('../monday');
const { getCreativeConfig } = require('../creative/config');
const { normalizeItem } = require('../creative/snapshot');
const { boardStatuses } = require('./data');

const norm = monday.normLabel;
// Timers, files and brief text aren't shown here — leaving them out keeps ~800 items quick
const SKIP = new Set(['working_time', 'files', 'concept', 'hook', 'finished_files']);
const ACTIVE = new Set(['in_progress', 'fixes']);

async function buildCampaigns({ brandId = 'particle', now = Date.now(), force = false } = {}) {
  const t0 = Date.now();
  const deadline = t0 + 50000;
  const config = await getCreativeConfig(brandId);
  const warnings = [];
  if (force) monday.clearCache('meta:');

  const keys = Object.keys(config.boards);
  const metas = {};
  await Promise.all(keys.map(async bk => { metas[bk] = await monday.boardMeta(config.boards[bk].board_id, { force }); }));
  const knownProducts = new Set();
  for (const bk of keys) {
    const pm = metas[bk].statusMaps[config.boards[bk].columns.product];
    for (const v of Object.values(pm?.byIndex || {})) if (v.label) knownProducts.add(norm(v.label));
  }

  const boards = {};
  const items = [];
  await Promise.all(keys.map(async (bk) => {
    const board = config.boards[bk];
    const meta = metas[bk];
    const c = board.columns;
    const { statusCategory, legend } = boardStatuses(bk, board, meta);
    boards[bk] = legend;
    if (!c.campaign || !meta.columns[c.campaign]) { warnings.push(`${board.label}: no Campaign column on the board`); return; }
    const cols = [...new Set(Object.entries(c).filter(([role, id]) => id && !SKIP.has(role)).map(([, id]) => id))].filter(id => meta.columns[id]);
    const { items: raws, truncated } = await monday.fetchAllItems(board.board_id, {
      cols, maxPages: 10, deadline,
      queryParams: { rules: [{ column_id: c.campaign, compare_value: [], operator: 'is_not_empty' }] },
    });
    if (truncated) warnings.push(`${board.label}: more than 5,000 campaign tickets — the oldest are missing`);
    const ctx = { boardKey: bk, board, meta, config, bounds: { fromMs: now, toMs: now }, now, knownProducts, statusCategory };
    for (const raw of raws) {
      const it = normalizeItem(raw, ctx);
      const cv = (raw.column_values || []).find(x => x.id === c.campaign);
      it.campaigns = (cv?.values || []).map(v => v.label).filter(Boolean);
      if (!it.campaigns.length && it.campaign) it.campaigns = [it.campaign];
      if (!it.campaigns.length) continue;
      it.open = statusCategory(it.status.label) !== 'delivered';
      it.active_now = ACTIVE.has(statusCategory(it.status.label));
      for (const k of ['_iv', 'tracked_s_week', 'tracked_days', 'assets', 'media_refs']) delete it[k];
      items.push(it);
    }
  }));

  // People on these tickets (assignees + requesters), named the way the rest of Studio names them
  const roleCount = {};
  const reqIds = new Set();
  for (const it of items) {
    for (const uid of it.people) {
      roleCount[uid] = roleCount[uid] || { video: 0, design: 0 };
      roleCount[uid][it.board] = (roleCount[uid][it.board] || 0) + 1;
    }
    for (const uid of it.requested_by) reqIds.add(uid);
  }
  let users = [];
  try { users = await monday.usersByIds([...new Set([...Object.keys(roleCount), ...reqIds])]); } catch (e) { warnings.push(`People lookup failed (${e.message})`); }
  const userMap = Object.fromEntries(users.map(u => [String(u.id), u]));
  const nameOf = (uid) => {
    const raw = config.team?.[uid]?.display_name || userMap[uid]?.name || `User ${uid}`;
    return /@/.test(raw) ? raw.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase()) : raw;
  };
  const photoOf = (uid) => userMap[uid]?.photo_small || userMap[uid]?.photo_thumb_small || null;
  const people = {};
  for (const [uid, rc] of Object.entries(roleCount)) {
    const t = config.team?.[uid] || {};
    if (t.hidden) continue;
    people[uid] = { id: uid, name: nameOf(uid), photo: photoOf(uid), role: t.role || ((rc.video || 0) > (rc.design || 0) ? 'video' : 'design'), counts: rc };
  }
  const requesters = {};
  for (const uid of reqIds) requesters[uid] = { id: uid, name: nameOf(uid), photo: photoOf(uid) };

  return {
    generated_at: new Date(now).toISOString(),
    build_ms: Date.now() - t0,
    boards,
    people,
    requesters,
    items,
    warnings,
  };
}

/** Shared for 3 minutes, like the dashboard. */
function getCampaigns({ brandId = 'particle', force = false } = {}) {
  const key = `studio:${brandId}:campaigns`;
  if (force) monday.clearCache(key);
  return monday.cached(key, 3 * 60 * 1000, () => buildCampaigns({ brandId, force }));
}

module.exports = { getCampaigns, buildCampaigns };

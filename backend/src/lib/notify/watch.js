/**
 * What CP notices on Monday and AfterLife, every two minutes (captain-worker), and turns into notifications
 * (Tomer, 25 Nov 2026):
 *   • a task's status moves → its editor / designer (not the one who moved it); the requester when it's ready for
 *     review, done, back in fixes or stuck
 *   • someone is put on a task → them
 *   • "Uploaded to Meta" is set → the editor / designer ("waiting to spend")
 *   • a new update or reply → the task's people and requester; @mentions → the person tagged; a reply → the update's author
 *   • AfterLife: a creative starts spending on Meta → its maker (a quiet one — AfterLife's data is daily)
 * Cursors + seen ids per source, so nothing is notified twice and the first run starts "from now". Reads only.
 */
const monday = require('../monday');
const { getCreativeConfig } = require('../creative/config');
const { boardStatuses } = require('../studio/data');
const store = require('./store');
const people = require('./people');

const API = '2025-10';
const MIN = 60 * 1000;
const short = (s, n = 110) => { const t = String(s || '').replace(/﻿/g, '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const parse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };
const personIds = (raw) => (parse(raw)?.personsAndTeams || parse(raw)?.persons_and_teams || []).filter(p => p.kind !== 'team').map(p => String(p.id));
const first = (name) => String(name || 'Someone').split(' ')[0];
const itemTitle = (name) => short(String(name || '').split('|').map(s => s.trim()).filter(Boolean).slice(-2).join(' · ') || name, 70);

/** The people and requester of some items (one query). → { itemId: { name, board, people[], requesters[] } } */
async function itemsPeople(itemIds, personCols, requesterCols) {
  if (!itemIds.length) return {};
  const cols = [...new Set([...personCols, ...requesterCols].filter(Boolean))];
  const d = await monday.mondayQuery('query ($ids: [ID!], $cols: [String!]) { items(ids: $ids, limit: 100) { id name board { id } column_values(ids: $cols) { id value } } }', { ids: itemIds.slice(0, 100), cols });
  const out = {};
  for (const it of d?.items || []) {
    const cv = Object.fromEntries((it.column_values || []).map(c => [c.id, c.value]));
    out[String(it.id)] = {
      name: it.name, board: String(it.board?.id || ''),
      people: [...new Set(personCols.flatMap(c => personIds(cv[c])))],
      requesters: [...new Set(requesterCols.flatMap(c => personIds(cv[c])))],
    };
  }
  return out;
}

/** Monday ids → names (for "Lior moved…"). */
async function namesOf(ids) {
  const users = await monday.usersByIds([...new Set(ids.filter(Boolean))]).catch(() => []);
  return Object.fromEntries(users.map(u => [String(u.id), u.name]));
}

const boardUrl = (cfg, boardId, itemId) => `https://${process.env.MONDAY_ACCOUNT_SLUG || 'particle-for-men'}.monday.com/boards/${boardId}/pulses/${itemId}`;

/** Status / people / "Uploaded to Meta" changes on one board → notifications. */
async function watchBoard(cfg, bk) {
  const board = cfg.boards[bk];
  if (!board) return 0;
  const c = board.columns;
  const meta = await monday.boardMeta(board.board_id);
  const { statusCategory, legend } = boardStatuses(bk, board, meta);
  const colorOf = (label) => (legend?.statuses || []).find(s => String(s.label).toLowerCase() === String(label || '').toLowerCase())?.color || null;
  const colList = Array.isArray(meta.columns) ? meta.columns : Object.values(meta.columns || {});
  const metaCol = colList.find(col => /uploaded\s*to\s*meta/i.test(col.title || ''))?.id || null;
  const watched = [c.status, c.person, metaCol].filter(Boolean);
  const name = `monday:${board.board_id}`;
  const cur = await store.cursor(name);
  const now = Date.now();
  const since = cur ? cur.last - 5 * MIN : now - 3 * MIN;
  const seen = cur?.seen || new Set();
  const { events } = await monday.activityLogs(board.board_id, { fromIso: new Date(since).toISOString(), columnIds: watched, limit: 200, maxPages: 3, raw: true });
  let last = cur?.last || now;
  const fresh = [];
  for (const e of events) {
    last = Math.max(last, e.at_ms || 0);
    if (seen.has(e.id) || e.is_undo || !e.pulse_id) continue;
    seen.add(e.id);
    fresh.push(e);
  }
  let n = 0;
  if (fresh.length) {
    const items = await itemsPeople([...new Set(fresh.map(e => e.pulse_id))], [c.person], [c.requested_by]);
    const allIds = Object.values(items).flatMap(i => [...i.people, ...i.requesters]).concat(fresh.map(e => e.user_id));
    for (const e of fresh) if (e.column_id === c.person) allIds.push(...personIds(e.value_raw));
    const [map, names] = await Promise.all([people.cpUsersFor(allIds), namesOf(fresh.map(e => e.user_id))]);
    const cp = (ids, except = []) => [...new Set(ids.filter(id => !except.includes(id)).flatMap(id => map.get(id) || []))];
    for (const e of fresh) {
      const it = items[e.pulse_id];
      if (!it) continue;
      const who = first(names[e.user_id]);
      const base = { link: `task:${e.pulse_id}`, actor: names[e.user_id] || null };
      const metaOf = (extra) => ({ item_id: String(e.pulse_id), board: bk, item: it.name, monday_url: boardUrl(cfg, board.board_id, e.pulse_id), ...extra });
      if (e.column_id === c.status) {
        const from = e.prev?.text || '', to = e.value?.text || '';
        if (!to || from === to) continue;
        const m = metaOf({ from, to, from_color: colorOf(from), to_color: colorOf(to) });
        n += await store.notify({ ...base, userIds: cp(it.people, [e.user_id]), type: 'status', message: `${who} moved “${itemTitle(it.name)}” to ${to}`, meta: m, dedupe: `st:${e.id}` });
        const cat = statusCategory(to);
        if (['review', 'delivered', 'fixes', 'stuck'].includes(cat)) {
          const words = { review: 'is ready for review', delivered: 'is done', fixes: 'went back to fixes', stuck: 'is stuck' }[cat];
          n += await store.notify({ ...base, userIds: cp(it.requesters, [e.user_id, ...it.people]), type: 'requests', message: `Your ticket “${itemTitle(it.name)}” ${words} (${to})`, meta: m, dedupe: `rq:${e.id}` });
        }
      } else if (e.column_id === c.person) {
        const before = personIds(e.prev_raw), after = personIds(e.value_raw);
        const added = after.filter(x => !before.includes(x) && x !== e.user_id);
        if (added.length) n += await store.notify({ ...base, userIds: cp(added), type: 'assigned', message: `${who} put you on “${itemTitle(it.name)}”`, meta: metaOf({}), dedupe: `as:${e.id}` });
      } else if (metaCol && e.column_id === metaCol) {
        const to = e.value?.text || '';
        if (!to || /^(no|not|none|-)\b/i.test(to)) continue;
        n += await store.notify({ ...base, userIds: cp(it.people), type: 'ad_live', message: `📤 “${itemTitle(it.name)}” is uploaded to Meta — you’ll hear when it starts spending`, meta: metaOf({ meta_status: to }), dedupe: `up:${e.pulse_id}` });
      }
    }
  }
  await store.saveCursor(name, last, seen);
  return n;
}

/** New updates and replies on the Studio boards → the task's people, requester, the tagged, the thread's author. */
async function watchComments(cfg) {
  const boards = Object.fromEntries(Object.entries(cfg.boards).map(([bk, b]) => [String(b.board_id), bk]));
  const name = 'monday:updates';
  const cur = await store.cursor(name);
  const now = Date.now();
  const since = cur ? cur.last - 5 * MIN : now - 3 * MIN;
  const seen = cur?.seen || new Set();
  const rows = [];
  const d = await monday.mondayQuery('query { updates(limit: 60) { id body text_body created_at creator { id name } item { id name board { id } } } }', {}, { apiVersion: API });
  for (const u of d?.updates || []) rows.push({ ...u, kind: 'update', item_id: String(u.item?.id || ''), board: String(u.item?.board?.id || '') });
  try {
    // ids and the date written inline (digits and an ISO date only) — the argument types differ across API versions
    const ids = Object.keys(boards).filter(id => /^\d+$/.test(id)).join(', ');
    const from = new Date(since).toISOString();
    const r = await monday.mondayQuery(`query { replies(limit: 60, board_ids: [${ids}], created_at_from: "${from}") { id body text_body created_at creator { id name } item_id parent_id } }`, {}, { apiVersion: API });
    for (const x of r?.replies || []) rows.push({ ...x, kind: 'reply', item_id: String(x.item_id || ''), board: '' });
  } catch (e) { /* older API: updates only */ }
  let last = cur?.last || now;
  const fresh = rows.filter(u => {
    const at = Date.parse(u.created_at) || 0;
    last = Math.max(last, at);
    const k = `${u.kind}:${u.id}`;
    if (at < since || seen.has(k)) return false;
    seen.add(k);
    return u.kind === 'reply' || boards[u.board];
  });
  let n = 0;
  if (fresh.length) {
    const personCols = Object.values(cfg.boards).map(b => b.columns.person);
    const reqCols = Object.values(cfg.boards).map(b => b.columns.requested_by);
    const items = await itemsPeople([...new Set(fresh.map(u => u.item_id).filter(Boolean))], personCols, reqCols);
    // a reply also tells the author of the update it answers
    const parents = {};
    const pids = [...new Set(fresh.filter(u => u.kind === 'reply').map(u => String(u.parent_id)))];
    if (pids.length) {
      const p = await monday.mondayQuery('query ($ids: [ID!]) { updates(ids: $ids) { id creator_id } }', { ids: pids }, { apiVersion: API }).catch(() => null);
      for (const x of p?.updates || []) parents[String(x.id)] = String(x.creator_id || '');
    }
    const mentionsOf = (html) => [...String(html || '').matchAll(/data-mention-id="(\d+)"/g)].map(m => m[1]);
    const allIds = fresh.flatMap(u => [String(u.creator?.id || ''), ...mentionsOf(u.body), parents[String(u.parent_id)] || '', ...(items[u.item_id]?.people || []), ...(items[u.item_id]?.requesters || [])]);
    const map = await people.cpUsersFor(allIds);
    const cp = (ids, except = []) => [...new Set(ids.filter(id => id && !except.includes(id)).flatMap(id => map.get(id) || []))];
    for (const u of fresh) {
      const it = items[u.item_id];
      if (!it || !boards[it.board]) continue;   // only the Studio boards
      const author = String(u.creator?.id || '');
      const who = first(u.creator?.name);
      const tagged = mentionsOf(u.body).filter(x => x !== author);
      const base = { link: `task:${u.item_id}`, actor: u.creator?.name || null };
      const meta = { item_id: u.item_id, board: boards[it.board], item: it.name, monday_url: boardUrl(cfg, it.board, u.item_id), update_id: String(u.id), snippet: short(u.text_body, 220) };
      const say = short(u.text_body, 90);
      n += await store.notify({ ...base, userIds: cp(tagged), type: 'mention', message: `${who} tagged you on “${itemTitle(it.name)}”: ${say}`, meta, dedupe: `mn:${u.kind}:${u.id}` });
      const crowd = [...it.people, ...it.requesters, ...(u.kind === 'reply' ? [parents[String(u.parent_id)]] : [])];
      n += await store.notify({ ...base, userIds: cp(crowd, [author, ...tagged]), type: 'comment', message: `${who} ${u.kind === 'reply' ? 'replied' : 'wrote'} on “${itemTitle(it.name)}”: ${say}`, meta, dedupe: `cm:${u.kind}:${u.id}` });
    }
  }
  await store.saveCursor(name, last, seen);
  return n;
}

/** AfterLife: creatives that started spending in the last 3 days → their maker (once per creative + first day). */
async function watchLaunches() {
  const name = 'afterlife:launches';
  const cur = await store.cursor(name);
  if (cur && Date.now() - cur.last < 30 * MIN) return 0;   // AfterLife's data is daily — every 30 minutes is plenty
  const m = await require('../onair/media').getMedia().catch(() => null);
  const seen = cur?.seen || new Set();
  let n = 0;
  if (m?.ready) {
    const today = new Date().toISOString().slice(0, 10);
    const recent = new Date(Date.now() - 3 * 86400000).toISOString().slice(0, 10);
    for (const c of m.creatives || []) {
      if (!c.first_spend || c.first_spend < recent || !c.maker) continue;
      const k = `${c.key}:${c.first_spend}`;
      if (seen.has(k)) continue;
      seen.add(k);
      const ids = await people.cpUsersByName(c.maker);
      if (!ids.length) continue;
      const when = c.first_spend === today ? 'today' : `on ${new Date(`${c.first_spend}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })}`;
      n += await store.notify({
        userIds: ids, type: 'ad_live', message: `🎬 “${short(c.label, 70)}” started running on Meta ${when}`,
        link: '/on-air', meta: { creative: c.key, label: c.label, thumb: c.thumb || null, product: c.product || null, first_spend: c.first_spend, format: c.format },
        actor: 'AfterLife', dedupe: `live:${k}`,
      });
    }
  }
  await store.saveCursor(name, Date.now(), seen);
  return n;
}

async function tick({ brandId = 'particle' } = {}) {
  await store.ensure();
  const cfg = await getCreativeConfig(brandId);
  const out = {};
  for (const bk of ['video', 'design']) out[bk] = await watchBoard(cfg, bk).catch((e) => { console.warn(`[notify] ${bk}:`, e.message); return 0; });
  out.comments = await watchComments(cfg).catch((e) => { console.warn('[notify] comments:', e.message); return 0; });
  out.launches = await watchLaunches().catch((e) => { console.warn('[notify] launches:', e.message); return 0; });
  return out;
}

module.exports = { tick, watchBoard, watchComments, watchLaunches, itemsPeople, itemTitle, personIds };

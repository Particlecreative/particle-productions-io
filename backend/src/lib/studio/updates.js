/**
 * A task's conversation, Monday-style (Tomer, 25 Nov 2026: "updates on a ticket in CP look very low-tech — make it like
 * Monday or better"). Reads updates with their formatting, files, likes, who saw them, pins and replies; posts updates
 * and replies (with files), likes / unlikes and edits your own — as the person when their Monday is connected.
 * Plus the task's Files (everything uploaded to it) and its Activity (status, people, timeline and deadline changes).
 * Everything from Monday is data.
 */
const monday = require('../monday');
const { boardOf, boardsFor, updateHtml, richOf, postUpdate } = require('./write');

const API = '2025-10';
const LIMIT = 15;
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });

const USER = 'id name';   // photos come from the Studio's people list (photo field names differ across API versions)
const ASSET = 'id name file_extension file_size public_url url_thumbnail created_at uploaded_by { id name }';
const FULL = `id body text_body created_at creator { ${USER} } likes { creator_id reaction_type creator { id name } } viewers(limit: 60) { user_id medium user { id name } } assets { ${ASSET} }`;
const SLIM = `id body text_body created_at creator { ${USER} } likes { creator_id reaction_type } assets { ${ASSET} }`;   // if Monday refuses the full read

const IMAGE = /^(png|jpe?g|gif|webp|avif|bmp|heic)$/;
/** A Monday asset → what the panel shows (pure — tested). public_url works for an hour without signing in. */
function fileOf(a) {
  const ext = String(a?.file_extension || '').replace(/^\./, '').toLowerCase() || (String(a?.name || '').match(/\.([a-z0-9]{2,5})$/i)?.[1] || '').toLowerCase();
  return {
    id: String(a.id), name: a.name || 'file', ext, size: Number(a.file_size) || 0, image: IMAGE.test(ext),
    url: a.public_url || null, thumb: a.url_thumbnail || null, at: a.created_at || null, by: a.uploaded_by?.name || null,
  };
}

/** One update or reply → the panel's shape (pure — tested). */
function shape(u) {
  const by = u.creator ? { id: String(u.creator.id), name: u.creator.name } : null;
  const seen = new Map();
  for (const v of u.viewers || []) {
    const id = String(v.user_id || v.user?.id || '');
    if (id && id !== by?.id && !seen.has(id)) seen.set(id, { id, name: v.user?.name || '' });
  }
  return {
    id: String(u.id), html: u.body || '', text: u.text_body || '', rich: richOf(u.body), at: u.created_at || null, by,
    likes: (u.likes || []).map(l => ({ id: String(l.creator_id || l.creator?.id || ''), name: l.creator?.name || '', reaction: l.reaction_type || null })).filter(l => l.id),
    seen: [...seen.values()],
    files: (u.assets || []).filter(Boolean).map(fileOf),
    pinned: Array.isArray(u.pinned_to_top) && u.pinned_to_top.length > 0,
  };
}

/** Updates newest first (pinned ones flagged), page by page; the first page also brings the task's files. */
async function listUpdates(config, itemId, { page = 1, limit = LIMIT } = {}) {
  await boardOf(config, itemId);
  const p = Math.max(1, Math.min(50, Number(page) || 1));
  const read = (fields, pins) => monday.mondayQuery(
    `query ($ids: [ID!], $limit: Int!, $page: Int!) { items(ids: $ids) { id name ${p === 1 ? `assets { ${ASSET} }` : ''}
       updates(limit: $limit, page: $page) { ${fields} ${pins ? 'pinned_to_top { item_id }' : ''} replies { ${fields} } } } }`,
    { ids: [String(itemId)], limit, page: p }, { apiVersion: API });
  let d;
  try { d = await read(FULL, true); } catch (e) {
    if (e.status === 404 || /not found|permission/i.test(e.message)) throw e;
    console.warn('[studio] full updates read failed — slim read:', e.message);
    d = await read(SLIM, false);
  }
  const item = d?.items?.[0];
  if (!item) throw bad('Task not found', 404);
  const list = item.updates || [];
  return {
    item_name: item.name || '', page: p, more: list.length >= limit,
    updates: list.map(u => ({ ...shape(u), replies: (u.replies || []).map(shape) })),
    ...(p === 1 ? { files: (item.assets || []).filter(Boolean).map(fileOf).sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))) } : {}),
  };
}

/** The update belongs to this task (so a like / edit / reply can't land on some other item). */
async function updateOf(itemId, updateId) {
  if (!/^\d+$/.test(String(updateId))) throw bad('Bad update id');
  const d = await monday.mondayQuery('query ($ids: [ID!]) { updates(ids: $ids) { id item_id creator_id body } }', { ids: [String(updateId)] }, { apiVersion: API });
  const u = d?.updates?.[0];
  if (!u || String(u.item_id) !== String(itemId)) throw bad('That update isn’t on this task', 404);
  return u;
}

/**
 * Post an update — or a reply (parentId) — with up to 5 files. Files go up as the person when their Monday is
 * connected (else CP's account), after the update exists.
 */
async function post(config, itemId, { text, mentions, parentId, files = [], author, mine }) {
  const body = String(text || '').trim() || (files.length ? `📎 ${files.map(f => f.name).join(', ')}` : '');
  if (parentId) { await boardOf(config, itemId); await updateOf(itemId, parentId); }
  const r = await postUpdate(config, itemId, body, author, mentions, { token: mine?.token || null, parentId: parentId || null });
  const token = r.as_user ? mine?.token : null;
  const uploaded = [];
  const failed = [];
  for (const f of files.slice(0, 5)) {
    try { await monday.addFileToUpdate(r.id, f, { token }); uploaded.push(f.name); } catch (e) { failed.push(`${f.name}: ${e.message}`); }
  }
  return { ...r, uploaded, ...(failed.length ? { failed } : {}) };
}

/** Like / unlike — only as the person (a like carries their name). */
async function like(config, itemId, updateId, on, mine) {
  if (!mine?.token) throw bad('Connect your Monday to like updates — a like shows your name');
  await boardOf(config, itemId);
  await updateOf(itemId, updateId);
  const q = on ? 'mutation ($id: ID!) { like_update(update_id: $id) { id } }' : 'mutation ($id: ID!) { unlike_update(update_id: $id) { id } }';
  await monday.mondayQuery(q, { id: String(updateId) }, { token: mine.token, retries: 0, apiVersion: API });
  return { ok: true, liked: !!on };
}

/** Edit your own update (plain text in, Monday HTML out — tags stay chips). */
async function edit(config, itemId, updateId, text, mentions, mine) {
  if (!mine?.token) throw bad('Connect your Monday to edit your updates');
  const body = String(text || '').trim();
  if (!body) throw bad('Write something first');
  if (body.length > 5000) throw bad('That update is too long');
  await boardOf(config, itemId);
  const u = await updateOf(itemId, updateId);
  if (!mine.monday_user_id || String(u.creator_id) !== String(mine.monday_user_id)) throw bad('You can only edit your own updates', 403);
  const { html } = updateHtml(body, null, mentions);
  await monday.mondayQuery('mutation ($id: ID!, $body: String!) { edit_update(id: $id, body: $body) { id } }', { id: String(updateId), body: html }, { token: mine.token, retries: 0, apiVersion: API });
  return { ok: true, html };
}

const dateOfRaw = (v) => { const s = v && typeof v === 'object' ? (v.date || '') : ''; return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
const rangeOfRaw = (v) => (v && typeof v === 'object' && (v.from || v.to) ? { from: String(v.from || '').slice(0, 10) || null, to: String(v.to || '').slice(0, 10) || null } : null);
const peopleOfRaw = (v) => (v && typeof v === 'object' ? (v.personsAndTeams || v.persons_and_teams || []) : []).filter(p => p.kind !== 'team').map(p => String(p.id));

/** Activity log rows → the panel's timeline, newest first (pure — tested). cols: { status, people, timeline, deadline }. */
function activityRows(events, cols, names = {}) {
  const who = (id) => (id ? { id, name: names[id] || '' } : null);
  const out = [];
  for (const e of events || []) {
    if (e.is_undo) continue;
    const base = { id: String(e.id), at: Number.isFinite(e.at_ms) ? new Date(e.at_ms).toISOString() : null, by: who(e.user_id) };
    if (e.event === 'create_pulse') { out.push({ ...base, kind: 'created' }); continue; }
    if (e.event !== 'update_column_value') continue;
    if (e.column_id === cols.status) {
      const from = e.prev?.text || '', to = e.value?.text || '';
      if (from !== to) out.push({ ...base, kind: 'status', from, to });
    } else if (e.column_id === cols.people) {
      const a = new Set(peopleOfRaw(e.prev_raw)), b = new Set(peopleOfRaw(e.value_raw));
      const added = [...b].filter(x => !a.has(x)).map(id => who(id)), removed = [...a].filter(x => !b.has(x)).map(id => who(id));
      if (added.length || removed.length) out.push({ ...base, kind: 'people', added, removed });
    } else if (e.column_id === cols.timeline) {
      const from = rangeOfRaw(e.prev_raw), to = rangeOfRaw(e.value_raw);
      if (JSON.stringify(from) !== JSON.stringify(to)) out.push({ ...base, kind: 'timeline', from, to });
    } else if (e.column_id === cols.deadline) {
      const from = dateOfRaw(e.prev_raw), to = dateOfRaw(e.value_raw);
      if (from !== to) out.push({ ...base, kind: 'deadline', from, to });
    }
  }
  return out.sort((x, y) => String(y.at || '').localeCompare(String(x.at || '')));
}

/** The task's history from Monday's activity log: created, status moves, who was put on / taken off, date moves. */
async function activity(config, itemId) {
  const key = await boardOf(config, itemId);
  const b = boardsFor(config)[key];
  const { events } = await monday.activityLogs(b.board_id, {
    itemIds: [String(itemId)], fromIso: new Date(Date.now() - 400 * 86400000).toISOString(), toIso: new Date(Date.now() + 60000).toISOString(),
    limit: 200, maxPages: 3, raw: true,
  });
  const mine = events.filter(e => !e.pulse_id || e.pulse_id === String(itemId));
  const cols = { status: b.status, people: b.people, timeline: b.timeline, deadline: b.deadline };
  const ids = new Set();
  for (const e of mine) {
    if (e.user_id) ids.add(e.user_id);
    if (e.column_id === cols.people) [...peopleOfRaw(e.prev_raw), ...peopleOfRaw(e.value_raw)].forEach(x => ids.add(x));
  }
  const users = ids.size ? await monday.usersByIds([...ids]).catch(() => []) : [];
  const names = {};
  for (const u of Array.isArray(users) ? users : Object.values(users || {})) if (u?.id) names[String(u.id)] = u.name;
  return { events: activityRows(mine, cols, names).slice(0, 120) };
}

module.exports = { listUpdates, post, like, edit, activity, shape, fileOf, activityRows, LIMIT };

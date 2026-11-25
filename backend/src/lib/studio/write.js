/**
 * Studio → Monday writes (the only place the Studio changes Monday).
 *  - a task's timeline, people, status and deadline (Workload + the task panel)
 *  - updates (comments) on a task
 *  - archive a task (restorable from the board's Archive on Monday)
 *  - create a ticket from the AI ticket creator (in the board's "Form Requests" group)
 * Boards and columns are allow-listed; nothing else can be written from here.
 */
const { mondayQuery, clearCache, boardMeta, normLabel } = require('../monday');

function boardsFor(config) {
  const r = config.retention || {};
  const col = (b) => ({ board_id: b.board_id, timeline: b.columns.timeline, people: b.columns.person, status: b.columns.status, deadline: b.columns.deadline });
  return {
    video: col(config.boards.video),
    design: col(config.boards.design),
    ...(r.board_id ? { retention: { board_id: r.board_id, timeline: r.columns.timeline, people: r.columns.designer, status: r.columns.status, deadline: r.columns.deadline } } : {}),
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function bad(msg) { const e = new Error(msg); e.status = 400; return e; }

/**
 * As the person, when they connected their own Monday (lib/mondayUser.js — Tomer, 18 Nov 2026: "if Omer schedules from
 * the Studio it should be his Monday, same as commenting"). Monday then shows them as the one who moved, assigned,
 * archived or commented. If Monday refuses their token (revoked, or no rights on that board), CP's account does it as
 * before and as_user says so. Other errors (a bad value) are real and are not retried.
 */
const AUTH_RE = /unauthori[sz]ed|not authenticated|authentication|invalid token|permission|forbidden|not allowed|user is not|access denied/i;
const refused = (e) => e?.status === 401 || e?.status === 403 || AUTH_RE.test(`${e?.code || ''} ${e?.message || ''}`);
async function asPerson(token, run) {
  if (!token) return { result: await run(null), as_user: false };
  try { return { result: await run(token), as_user: true }; } catch (e) {
    if (!refused(e)) throw e;
    console.warn('[studio] their own Monday refused this — CP’s account did it:', e.message);
    return { result: await run(null), as_user: false, refused: e.message };
  }
}

/** The board key a Studio item lives on (throws if it's not one of the Studio boards). */
async function boardOf(config, itemId) {
  if (!/^\d+$/.test(String(itemId))) throw bad('Bad item id');
  const check = await mondayQuery('query ($ids: [ID!]) { items(ids: $ids) { id board { id } } }', { ids: [String(itemId)] });
  const id = String(check?.items?.[0]?.board?.id || '');
  const key = Object.entries(boardsFor(config)).find(([, b]) => String(b.board_id) === id)?.[0];
  if (!key) throw bad('Not a Studio task');
  return key;
}

/**
 * Change a task. timeline: { from, to } | null (unschedule); people: [mondayUserId];
 * status: a label from that board's status column; deadline: 'YYYY-MM-DD' | null.
 */
async function updateTask(config, { board, itemId, timeline, people, status, deadline }, { token = null } = {}) {
  const b = boardsFor(config)[board];
  if (!b) throw bad('Unknown board');
  if (!/^\d+$/.test(String(itemId))) throw bad('Bad item id');
  const values = {};
  if (timeline !== undefined) {
    if (timeline === null) values[b.timeline] = {};
    else {
      if (!DATE_RE.test(timeline.from || '') || !DATE_RE.test(timeline.to || '') || timeline.to < timeline.from) throw bad('Bad timeline');
      values[b.timeline] = { from: timeline.from, to: timeline.to };
    }
  }
  if (people !== undefined) {
    if (!Array.isArray(people) || people.some(p => !/^\d+$/.test(String(p)))) throw bad('Bad people');
    values[b.people] = { personsAndTeams: people.map(id => ({ id: Number(id), kind: 'person' })) };
  }
  if (status !== undefined) {
    const sm = (await boardMeta(b.board_id)).statusMaps[b.status];
    const idx = sm?.byLabel[normLabel(String(status || ''))];
    if (idx == null || sm.byIndex[idx]?.deactivated) throw bad('Unknown status');
    values[b.status] = { index: idx };
  }
  if (deadline !== undefined) {
    if (deadline === null) values[b.deadline] = {};
    else if (DATE_RE.test(deadline)) values[b.deadline] = { date: deadline };
    else throw bad('Bad deadline');
  }
  if (!Object.keys(values).length) throw bad('Nothing to change');
  // The item must really live on that board
  const check = await mondayQuery('query ($ids: [ID!]) { items(ids: $ids) { id board { id } } }', { ids: [String(itemId)] });
  if (String(check?.items?.[0]?.board?.id) !== String(b.board_id)) throw bad('Item is not on that board');
  const done = await asPerson(token, (t) => mondayQuery(
    `mutation ($board: ID!, $item: ID!, $vals: JSON!) { change_multiple_column_values(board_id: $board, item_id: $item, column_values: $vals) { id } }`,
    { board: String(b.board_id), item: String(itemId), vals: JSON.stringify(values) },
    { retries: 2, token: t }
  ));
  clearCache('studio:');
  return { ok: true, as_user: done.as_user, ...(done.refused ? { refused: done.refused } : {}) };
}

/** Archive a task on Monday — it leaves the board (and the Studio); it can be restored from the board's Archive. */
async function archiveTask(config, itemId, { token = null } = {}) {
  await boardOf(config, itemId);
  const done = await asPerson(token, (t) => mondayQuery('mutation ($item: ID!) { archive_item(item_id: $item) { id state } }', { item: String(itemId) }, { retries: 0, token: t }));
  clearCache('studio:');
  return { ok: true, as_user: done.as_user, ...(done.refused ? { refused: done.refused } : {}) };
}

const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', hellip: '…' };
const decodeHtml = (t) => String(t || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&([a-z]+);/gi, (m, n) => (ENT[n.toLowerCase()] ?? m));
const htmlText = (h) => decodeHtml(String(h || '')
  .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, '\n').replace(/<li\b[^>]*>/gi, '• ').replace(/<[^>]+>/g, ''));

/**
 * An update's HTML → what the panel shows: text, real links (text_body drops the address — "Uploaded on Dropbox folder"
 * lost its link) and @mention chips. [{ t: 'text', v } | { t: 'link', v, href } | { t: 'mention', v }]. Pure — tested.
 */
function richOf(html) {
  const src = String(html || '');
  if (!src.trim()) return null;
  const out = [];
  const push = (seg) => {
    const last = out[out.length - 1];
    if (seg.t === 'text' && last?.t === 'text') last.v += seg.v; else out.push(seg);
  };
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let at = 0, m;
  while ((m = re.exec(src))) {
    if (m.index > at) push({ t: 'text', v: htmlText(src.slice(at, m.index)) });
    const attrs = m[1];
    const label = htmlText(m[2]).trim();
    const href = decodeHtml((attrs.match(/\bhref\s*=\s*"([^"]*)"/i) || attrs.match(/\bhref\s*=\s*'([^']*)'/i) || [])[1] || '');
    if (/user_mention|data-mention-type/i.test(attrs) || /^@/.test(label)) push({ t: 'mention', v: label.startsWith('@') ? label : `@${label}` });
    else if (/^https?:\/\//i.test(href)) push({ t: 'link', v: label || href, href });
    else if (label) push({ t: 'text', v: label });
    at = re.lastIndex;
  }
  if (at < src.length) push({ t: 'text', v: htmlText(src.slice(at)) });
  // tidy the line breaks Monday's <p> blocks leave behind
  for (const seg of out) if (seg.t === 'text') seg.v = seg.v.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n');
  while (out.length && out[0].t === 'text' && !out[0].v.trim()) out.shift();
  if (out[0]?.t === 'text') out[0].v = out[0].v.replace(/^\s+/, '');
  const last = out[out.length - 1];
  if (last?.t === 'text') last.v = last.v.replace(/\s+$/, '');
  return out.some(seg => seg.t !== 'text') ? out : null;   // plain text needs no segments
}

/** A task's latest updates (comments), newest first. */
async function getUpdates(config, itemId, { limit = 10 } = {}) {
  await boardOf(config, itemId);
  const d = await mondayQuery(
    `query ($ids: [ID!], $limit: Int!) { items(ids: $ids) { updates(limit: $limit) { id body text_body created_at creator { id name } replies { id body text_body created_at creator { id name } } } } }`,
    { ids: [String(itemId)], limit }
  );
  const one = (u) => ({ id: String(u.id), text: u.text_body || '', rich: richOf(u.body), at: u.created_at, by: u.creator ? { id: String(u.creator.id), name: u.creator.name } : null });
  return (d?.items?.[0]?.updates || []).map(u => ({ ...one(u), replies: (u.replies || []).map(one) }));
}

/** Post an update on a task, signed with the CP user's name (Monday shows the API account as the author). */
const MONDAY_ACCOUNT = () => process.env.MONDAY_ACCOUNT_SLUG || 'particle-for-men';

/**
 * Post an update on a Monday task, signed with the CP user's name. mentions = [{ id, name }] of Monday users tagged
 * as "@Name" in the text: each becomes a real Monday mention (the chip + a notification to that person).
 */
/** Update text → Monday HTML: escaped, "@Name" of each tagged person turned into a mention chip, signed. Pure. */
function updateHtml(body, author, mentions = []) {
  const tags = [];
  const seen = new Set();
  for (const m of Array.isArray(mentions) ? mentions.slice(0, 20) : []) {
    const id = String(m?.id || '');
    const name = String(m?.name || '').trim().slice(0, 80);
    if (!/^\d{1,15}$/.test(id) || !name || seen.has(id) || !body.includes(`@${name}`)) continue;   // only people still tagged in the text
    seen.add(id);
    tags.push({ id, name });
  }
  let html = esc(body);
  // Longest names first, so "@Dan" never eats the start of "@Dana Levi"
  for (const t of [...tags].sort((a, b) => b.name.length - a.name.length)) {
    const chip = `<a class="user_mention_editor router" href="https://${MONDAY_ACCOUNT()}.monday.com/users/${t.id}" data-mention-type="User" data-mention-id="${t.id}" target="_blank" rel="noopener noreferrer">\u0000${t.id}\u0000</a>`;
    html = html.split(`@${esc(t.name)}`).join(chip);
  }
  for (const t of tags) html = html.split(`\u0000${t.id}\u0000`).join(`@${esc(t.name)}`);
  html = html.replace(/\n/g, '<br>') + (author ? `<br><br><em>— ${esc(author)}, via CP Studio</em>` : '');
  return { html, tags };
}

const MENTIONS_API_VERSION = '2025-10';

// token: their own Monday → the comment is theirs on Monday, so it carries no "— name, via CP Studio" line
// parentId: a reply to that update (25 Nov 2026) — Monday threads it under the update
async function postUpdate(config, itemId, text, author, mentions = [], { token = null, parentId = null } = {}) {
  const body = String(text || '').trim();
  if (!body) throw bad('Write something first');
  if (body.length > 5000) throw bad('That update is too long');
  if (parentId && !/^\d+$/.test(String(parentId))) throw bad('Bad update id');
  await boardOf(config, itemId);
  const done = await asPerson(token, async (t) => {
    const { html, tags } = updateHtml(body, t ? null : author, mentions);
    const vars = { item: String(itemId), body: html, ...(parentId ? { parent: String(parentId) } : {}) };
    const parentArg = parentId ? ', parent_id: $parent' : '';
    const parentVar = parentId ? ', $parent: ID' : '';
    if (tags.length) {
      vars.mentions = tags.map(x => ({ id: x.id, type: 'User' }));
      // mentions_list only exists from API 2025-07 (CP runs on 2024-10, where tagging failed: "Unknown argument") — 17 Nov 2026
      const r = await mondayQuery(`mutation ($item: ID!, $body: String!, $mentions: [UpdateMention]${parentVar}) { create_update(item_id: $item, body: $body, mentions_list: $mentions${parentArg}) { id } }`, vars, { retries: 0, apiVersion: MENTIONS_API_VERSION, token: t });
      return { id: String(r?.create_update?.id || ''), mentioned: tags.map(x => x.id) };
    }
    const r = await mondayQuery(`mutation ($item: ID!, $body: String!${parentVar}) { create_update(item_id: $item, body: $body${parentArg}) { id } }`, vars, { retries: 0, token: t, ...(parentId ? { apiVersion: MENTIONS_API_VERSION } : {}) });
    return { id: String(r?.create_update?.id || ''), mentioned: [] };
  });
  return { ...done.result, as_user: done.as_user, ...(done.refused ? { refused: done.refused } : {}) };
}

/** Create a Monday item. columnValues is already in Monday's JSON shape. No retries (create isn't idempotent). */
// token: the person's own Monday (lib/mondayUser.js) so the ticket and its brief show as theirs; null → CP's account
async function createItem({ boardId, groupId, name, columnValues, createLabels = false, token = null }) {
  // createLabels: only for a new Brands label (Blurr / Biomella) — every other value is checked against Monday's options first
  const data = await mondayQuery(
    `mutation ($board: ID!, $group: String, $name: String!, $vals: JSON, $create: Boolean) {
       create_item(board_id: $board, group_id: $group, item_name: $name, column_values: $vals, create_labels_if_missing: $create) { id url }
     }`,
    { board: String(boardId), group: groupId || null, name, vals: JSON.stringify(columnValues), create: !!createLabels },
    { retries: 0, token }
  );
  clearCache('studio:');
  return data?.create_item;
}

async function addUpdate(itemId, body, { token = null } = {}) {
  return mondayQuery('mutation ($item: ID!, $body: String!) { create_update(item_id: $item, body: $body) { id } }', { item: String(itemId), body }, { retries: 0, token });
}

const updateSchedule = updateTask; // older name

module.exports = { updateHtml, richOf, updateTask, updateSchedule, createItem, addUpdate, getUpdates, postUpdate, archiveTask, boardsFor, boardOf, asPerson };

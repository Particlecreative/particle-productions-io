/**
 * Studio → Monday writes (the only place the Studio changes Monday).
 *  - a task's timeline, people, status and deadline (Workload + the task panel)
 *  - updates (comments) on a task
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
async function updateTask(config, { board, itemId, timeline, people, status, deadline }) {
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
  await mondayQuery(
    `mutation ($board: ID!, $item: ID!, $vals: JSON!) { change_multiple_column_values(board_id: $board, item_id: $item, column_values: $vals) { id } }`,
    { board: String(b.board_id), item: String(itemId), vals: JSON.stringify(values) },
    { retries: 2 }
  );
  clearCache('studio:');
  return { ok: true };
}

const esc = (t) => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** A task's latest updates (comments), newest first. */
async function getUpdates(config, itemId, { limit = 10 } = {}) {
  await boardOf(config, itemId);
  const d = await mondayQuery(
    `query ($ids: [ID!], $limit: Int!) { items(ids: $ids) { updates(limit: $limit) { id text_body created_at creator { id name } replies { id text_body created_at creator { id name } } } } }`,
    { ids: [String(itemId)], limit }
  );
  const one = (u) => ({ id: String(u.id), text: u.text_body || '', at: u.created_at, by: u.creator ? { id: String(u.creator.id), name: u.creator.name } : null });
  return (d?.items?.[0]?.updates || []).map(u => ({ ...one(u), replies: (u.replies || []).map(one) }));
}

/** Post an update on a task, signed with the CP user's name (Monday shows the API account as the author). */
async function postUpdate(config, itemId, text, author) {
  const body = String(text || '').trim();
  if (!body) throw bad('Write something first');
  if (body.length > 5000) throw bad('That update is too long');
  await boardOf(config, itemId);
  const html = esc(body).replace(/\n/g, '<br>') + (author ? `<br><br><em>— ${esc(author)}, via CP Studio</em>` : '');
  const r = await mondayQuery('mutation ($item: ID!, $body: String!) { create_update(item_id: $item, body: $body) { id } }', { item: String(itemId), body: html }, { retries: 0 });
  return { id: String(r?.create_update?.id || '') };
}

/** Create a Monday item. columnValues is already in Monday's JSON shape. No retries (create isn't idempotent). */
async function createItem({ boardId, groupId, name, columnValues }) {
  const data = await mondayQuery(
    `mutation ($board: ID!, $group: String, $name: String!, $vals: JSON) {
       create_item(board_id: $board, group_id: $group, item_name: $name, column_values: $vals, create_labels_if_missing: false) { id url }
     }`,
    { board: String(boardId), group: groupId || null, name, vals: JSON.stringify(columnValues) },
    { retries: 0 }
  );
  clearCache('studio:');
  return data?.create_item;
}

async function addUpdate(itemId, body) {
  return mondayQuery('mutation ($item: ID!, $body: String!) { create_update(item_id: $item, body: $body) { id } }', { item: String(itemId), body }, { retries: 0 });
}

const updateSchedule = updateTask; // older name

module.exports = { updateTask, updateSchedule, createItem, addUpdate, getUpdates, postUpdate, boardsFor, boardOf };

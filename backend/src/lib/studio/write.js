/**
 * Studio → Monday writes (the only place the Studio changes Monday).
 *  - reschedule / reassign a task from the Workload timeline (timeline + person columns only)
 *  - create a ticket from the AI ticket creator (in the board's "Form Requests" group)
 * Boards and columns are allow-listed; nothing else can be written from here.
 */
const { mondayQuery, clearCache } = require('../monday');

function boardsFor(config) {
  const r = config.retention || {};
  return {
    video: { board_id: config.boards.video.board_id, timeline: config.boards.video.columns.timeline, people: config.boards.video.columns.person },
    design: { board_id: config.boards.design.board_id, timeline: config.boards.design.columns.timeline, people: config.boards.design.columns.person },
    ...(r.board_id ? { retention: { board_id: r.board_id, timeline: r.columns.timeline, people: r.columns.designer } } : {}),
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function bad(msg) { const e = new Error(msg); e.status = 400; return e; }

/** Change a task's timeline and/or assignees. timeline: { from, to } | null (unschedule); people: [mondayUserId] */
async function updateSchedule(config, { board, itemId, timeline, people }) {
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

module.exports = { updateSchedule, createItem, addUpdate, boardsFor };

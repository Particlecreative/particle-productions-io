/**
 * Studio passwords (Tomer, 25 Nov 2026: "take the Access Passwords board to all creatives (and admins / producers) — read,
 * write and add, connected to the Monday board itself"). The Monday boards stay the one place the logins live; CP reads
 * and writes them live and keeps nothing.
 *   · The list never carries a password — only "has one". A password is read from Monday when someone presses Reveal or
 *     Copy, and every reveal / copy / edit / add is written to password_audit (who, which login, when — never the value).
 *   · Money ($/Month, Amount of Credits) is shown to admins and producers only — the creative team doesn't see it.
 *   · Writes go as the person when their Monday is connected (Monday's own history shows who), else as CP's account.
 * Both brands' boards have the same columns ("Password Changed" is called "card" on Blurr's — its title is read live).
 */
const db = require('../../db');
const monday = require('../monday');

const BOARDS = [
  { key: 'particle', name: 'Particle', id: '7946797746' },
  { key: 'blurr', name: 'Blurr', id: '18397582468' },
];
const COL = { link: 'link', login: 'text', password: 'text_1', person: 'person', flag: 'boolean_mkwyt3r2', renewal: 'text_mky8qr8h', credits: 'numeric_mky8j6nq', monthly: 'numeric_mky88psf' };
const MONEY = ['credits', 'monthly'];

const boardOf = (key) => {
  const b = BOARDS.find(x => x.key === String(key || 'particle'));
  if (!b) throw Object.assign(new Error('Unknown passwords board'), { status: 404 });
  return b;
};

let ready = null;
function ensure() {
  if (!ready) {
    ready = db.query(`CREATE TABLE IF NOT EXISTS password_audit (
      id SERIAL PRIMARY KEY, at TIMESTAMPTZ NOT NULL DEFAULT NOW(), user_id TEXT, user_name TEXT, board TEXT NOT NULL,
      item_id TEXT NOT NULL, item_name TEXT, action TEXT NOT NULL, fields TEXT[])`)
      .then(() => db.query('CREATE INDEX IF NOT EXISTS password_audit_at ON password_audit (at DESC)'))
      .catch(e => { ready = null; throw e; });
  }
  return ready;
}

async function audit({ user, board, itemId, itemName, action, fields = null }) {
  try {
    await ensure();
    await db.query('INSERT INTO password_audit (user_id, user_name, board, item_id, item_name, action, fields) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [user?.id ? String(user.id) : null, user?.name || user?.email || null, board, String(itemId), itemName || null, action, fields]);
  } catch (e) { console.warn('[passwords] audit:', e.message); }
  const verb = { reveal: 'Revealed the password of', copy: 'Copied the password of', edit: 'Edited the login', add: 'Added the login' }[action] || action;
  try { require('../activity').record(user, { kind: `password_${action}`, label: `${verb} “${itemName || itemId}”`, ref: String(itemId), meta: { board, fields } }); } catch { /* the feed is optional */ }
}

const parse = (v) => { try { return v ? JSON.parse(v) : null; } catch { return null; } };
const num = (t) => (t === '' || t == null || Number.isNaN(Number(t)) ? null : Number(t));

/** One Monday item → the row the page shows (pure — tested). withMoney false drops $/Month and credits. */
function rowOf(raw, { withMoney = false } = {}) {
  const cv = Object.fromEntries((raw.column_values || []).map(c => [c.id, c]));
  const link = parse(cv[COL.link]?.value);
  const people = parse(cv[COL.person]?.value)?.personsAndTeams || [];
  const row = {
    id: String(raw.id),
    name: raw.name,
    group: raw.group?.id || null,
    link: link?.url || null,
    login: cv[COL.login]?.text || '',
    has_password: !!(cv[COL.password]?.text || '').trim(),
    people: people.filter(p => p.kind !== 'team').map(p => String(p.id)),
    flag: parse(cv[COL.flag]?.value)?.checked === 'true' || parse(cv[COL.flag]?.value)?.checked === true,
    renewal: cv[COL.renewal]?.text || '',
    updated_at: raw.updated_at || null,
  };
  if (withMoney) { row.credits = num(cv[COL.credits]?.text); row.monthly = num(cv[COL.monthly]?.text); }
  return row;
}

const LIST_COLS = Object.values(COL);

/** The board for the page: groups, the checkbox's title, the people, and the rows (no passwords). Cached 20 s. */
async function list(key, { withMoney = false, force = false } = {}) {
  const b = boardOf(key);
  const data = await monday.cached(`passwords:${b.key}`, 20 * 1000, async () => {
    const d = await monday.mondayQuery(`query ($b: [ID!], $c: [String!]) { boards(ids: $b) { name groups { id title color } columns(ids: $c) { id title }
      items_page(limit: 500) { items { id name updated_at group { id } column_values(ids: $c) { id text value } } } } }`,
    { b: [b.id], c: LIST_COLS });
    const board = d?.boards?.[0];
    if (!board) throw Object.assign(new Error('The passwords board isn’t reachable from CP’s Monday account'), { status: 502 });
    // the password text is turned into has_password right here — it's never kept, cached or returned
    const rows = (board.items_page?.items || []).map(raw => rowOf(raw, { withMoney: true }));
    const ids = [...new Set(rows.flatMap(r => r.people))];
    const users = ids.length ? await monday.usersByIds(ids).catch(() => []) : [];
    return {
      board: { key: b.key, name: b.name, monday: board.name },
      groups: board.groups || [],
      flag_title: (board.columns || []).find(c => c.id === COL.flag)?.title || 'Done',
      people: Object.fromEntries((users || []).map(u => [String(u.id), { id: String(u.id), name: u.name, photo: u.photo_thumb || u.photo_small || u.photo || null }])),
      rows,
    };
  }, { force });
  return {
    ...data,
    boards: BOARDS.map(x => ({ key: x.key, name: x.name })),
    money: withMoney,
    rows: withMoney ? data.rows : data.rows.map(r => { const { credits, monthly, ...rest } = r; return rest; }),   // eslint-disable-line no-unused-vars
  };
}

async function itemOf(b, itemId, cols) {
  if (!/^\d+$/.test(String(itemId))) throw Object.assign(new Error('Not found'), { status: 404 });
  const d = await monday.mondayQuery(`query ($i: [ID!], $c: [String!]) { items(ids: $i) { id name board { id } column_values(ids: $c) { id text value } } }`,
    { i: [String(itemId)], c: cols });
  const it = d?.items?.[0];
  if (!it || String(it.board?.id) !== b.id) throw Object.assign(new Error('Not found'), { status: 404 });
  return it;
}

/** The password itself, for Reveal / Copy — logged. */
async function reveal(key, itemId, { user, action = 'reveal' } = {}) {
  const b = boardOf(key);
  const it = await itemOf(b, itemId, [COL.password]);
  const password = it.column_values.find(c => c.id === COL.password)?.text || '';
  await audit({ user, board: b.key, itemId: it.id, itemName: it.name, action: action === 'copy' ? 'copy' : 'reveal' });
  return { password };
}

const clean = (s, max = 500) => String(s ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

/** Monday column values from the page's fields (pure — tested). Only the fields given; money only when allowed. */
function valuesOf(patch, { withMoney = false } = {}) {
  const v = {}, fields = [];
  if (patch.link !== undefined) {
    const url = clean(patch.link, 2000);
    if (url && !/^https?:\/\//i.test(url)) throw Object.assign(new Error('The link must start with http:// or https://'), { status: 400 });
    v[COL.link] = url ? { url, text: url.replace(/^https?:\/\/(www\.)?/i, '').split('/')[0] } : { url: '', text: '' };
    fields.push('link');
  }
  if (patch.login !== undefined) { v[COL.login] = clean(patch.login, 300); fields.push('login'); }
  if (patch.password !== undefined) { v[COL.password] = String(patch.password ?? '').slice(0, 500); fields.push('password'); }
  if (patch.renewal !== undefined) { v[COL.renewal] = clean(patch.renewal, 100); fields.push('renewal'); }
  if (patch.flag !== undefined) { v[COL.flag] = patch.flag ? { checked: 'true' } : null; fields.push('flag'); }
  if (patch.people !== undefined) {
    const ids = (Array.isArray(patch.people) ? patch.people : []).map(String).filter(x => /^\d+$/.test(x)).slice(0, 10);
    v[COL.person] = { personsAndTeams: ids.map(id => ({ id: Number(id), kind: 'person' })) };
    fields.push('people');
  }
  for (const k of MONEY) {
    if (patch[k] === undefined) continue;
    if (!withMoney) throw Object.assign(new Error('Only admins and producers can change money fields'), { status: 403 });
    const n = patch[k] === '' || patch[k] == null ? '' : Number(patch[k]);
    if (n !== '' && (!Number.isFinite(n) || n < 0)) throw Object.assign(new Error('That doesn’t look like a number'), { status: 400 });
    v[COL[k]] = n === '' ? '' : String(n);
    fields.push(k);
  }
  return { values: v, fields };
}

async function tokenOf(user) {
  const t = await require('../mondayUser').tokenFor(user?.id).catch(() => null);
  return t?.token || null;
}

/** Run as the person; their Monday may not see a private board → CP's account. */
async function asPerson(user, query, vars) {
  const token = await tokenOf(user);
  if (token) {
    try { return await monday.mondayQuery(query, vars, { token }); } catch (e) {
      if (!/not authorized|permission|access|unauthorized|not found/i.test(e.message)) throw e;
    }
  }
  return monday.mondayQuery(query, vars);
}

async function update(key, itemId, patch, { user, withMoney = false } = {}) {
  const b = boardOf(key);
  const { values, fields } = valuesOf(patch || {}, { withMoney });
  let name = null;
  if (patch?.name !== undefined) { name = clean(patch.name, 200); if (!name) throw Object.assign(new Error('It needs a name'), { status: 400 }); }
  if (!fields.length && !name) throw Object.assign(new Error('Nothing to change'), { status: 400 });
  const it = await itemOf(b, itemId, [COL.login]);
  if (name) values.name = name;
  await asPerson(user, 'mutation ($b: ID!, $i: ID!, $v: JSON!) { change_multiple_column_values(board_id: $b, item_id: $i, column_values: $v) { id } }',
    { b: b.id, i: String(it.id), v: JSON.stringify(values) });
  monday.clearCache(`passwords:${b.key}`);
  await audit({ user, board: b.key, itemId: it.id, itemName: name || it.name, action: 'edit', fields: [...fields, ...(name ? ['name'] : [])] });
  return { ok: true };
}

async function create(key, body, { user, withMoney = false } = {}) {
  const b = boardOf(key);
  const name = clean(body?.name, 200);
  if (!name) throw Object.assign(new Error('Give it a name (the service — e.g. “Artlist”)'), { status: 400 });
  const { values, fields } = valuesOf(body || {}, { withMoney });
  const { groups } = await list(b.key, { withMoney: true });
  const group = (groups || []).find(g => g.id === body?.group)?.id || groups?.[0]?.id || null;
  const d = await asPerson(user, 'mutation ($b: ID!, $g: String, $n: String!, $v: JSON) { create_item(board_id: $b, group_id: $g, item_name: $n, column_values: $v) { id } }',
    { b: b.id, g: group, n: name, v: JSON.stringify(values) });
  const id = d?.create_item?.id;
  if (!id) throw new Error('Monday didn’t return the new login');
  monday.clearCache(`passwords:${b.key}`);
  await audit({ user, board: b.key, itemId: id, itemName: name, action: 'add', fields });
  return { id: String(id) };
}

/** Who looked at / changed what (admins). */
async function history({ limit = 100, itemId = null } = {}) {
  await ensure();
  const { rows } = await db.query(
    `SELECT at, user_name, board, item_id, item_name, action, fields FROM password_audit ${itemId ? 'WHERE item_id = $2' : ''} ORDER BY at DESC LIMIT $1`,
    itemId ? [Math.min(500, limit), String(itemId)] : [Math.min(500, limit)]);
  return rows;
}

module.exports = { BOARDS, COL, rowOf, valuesOf, list, reveal, update, create, history };

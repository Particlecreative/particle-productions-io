/**
 * Monday for the Captain: read a task (columns + its brief) with CP's token; post updates as the Captain's own
 * Monday user (CAPTAIN_MONDAY_TOKEN). Every update starts with "🧑‍✈️ Captain Caption:".
 */
const { mondayQuery } = require('../monday');
const { BOARDS, disciplineOfBoard } = require('./config');

const PREFIX = '🧑‍✈️ Captain Caption:';

function colText(cv) {
  if (!cv) return null;
  if (cv.type === 'link') {
    try { const v = JSON.parse(cv.value || 'null'); if (v?.url) return v.url; } catch { /* fall through */ }
  }
  return (cv.text ?? '').trim() || null;
}

const FIGMA_RE = /https?:\/\/(?:www\.)?figma\.com\/(?:design|file|proto|board)\/[A-Za-z0-9]{10,}[^\s"'<>)\]]*/gi;
const FRAMEIO_RE = /https?:\/\/(?:next\.|app\.)?frame\.io\/[^\s"'<>)\]]+|https?:\/\/f\.io\/[A-Za-z0-9_-]+/gi;

/**
 * The review link a designer / editor posted in the updates or their replies ("here's the file: …") — for when the
 * link column is empty (Tomer, 12 Nov 2026). Newest first; for Figma a link to a specific frame (node-id) wins.
 * updates: [{ body, text_body, created_at, creator, replies }] → { url, by, at } | null (pure — tested).
 */
function linkFromUpdates(updates, discipline) {
  const re = discipline === 'video' ? FRAMEIO_RE : FIGMA_RE;
  const posts = [];
  for (const u of updates || []) { posts.push(u); for (const r of u.replies || []) posts.push(r); }
  posts.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  const found = [];
  for (const p of posts) {
    const hay = `${String(p.body || '').replace(/&amp;/g, '&')} ${p.text_body || ''}`;
    for (const m of hay.matchAll(re)) found.push({ url: m[0].replace(/[.,;]+$/, ''), by: p.creator?.name || null, at: p.created_at || null });
  }
  if (!found.length) return null;
  if (discipline !== 'video') return found.find(f => /node-id=/i.test(f.url)) || found[0];
  return found[0];
}

/** A Monday item → everything the Captain needs: discipline, scope fields, review link, and the brief. */
async function readItem(itemId) {
  const d = await mondayQuery(`query ($ids: [ID!]) {
    items(ids: $ids) {
      id name state
      board { id name }
      group { id title }
      column_values { id type text value }
      updates(limit: 30) { id body text_body created_at creator { id name } replies { id body text_body created_at creator { id name } } }
    }
  }`, { ids: [String(itemId)] });
  const it = d?.items?.[0];
  if (!it) return null;
  const discipline = disciplineOfBoard(it.board?.id);
  const cols = discipline ? BOARDS[discipline].columns : {};
  const byId = Object.fromEntries((it.column_values || []).map(c => [c.id, c]));
  const get = (key) => (cols[key] ? colText(byId[cols[key]]) : null);
  // The brief usually arrives as the FIRST update (the request form), with "Hook Variations" and "Script / Message"
  const updates = [...(it.updates || [])].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const briefUpdate = updates.find(u => /Hook Variations|Script \/ Message|Video Concept|Design Concept|Copy/i.test(u.text_body || '')) || null;
  return {
    id: it.id, name: it.name, state: it.state, board_id: it.board?.id, board_name: it.board?.name, group: it.group?.title, discipline,
    status: get('status'), department: get('department'), type: get('type'), product: get('product'), person: get('person'),
    campaign: get('campaign'), platform: get('platform'),
    // the link column first; else the newest link a designer / editor posted in the updates
    ...(() => { const col = get('link'); if (col) return { link: col, link_from: 'column' }; const u = linkFromUpdates(it.updates, discipline); return u ? { link: u.url, link_from: 'update', link_by: u.by, link_at: u.at } : { link: null, link_from: null }; })(),
    brief: {
      hook: get('hook'), concept: get('concept'), script: get('script'), supporting_text: get('supporting_text'),
      versions_needed: Number(get('versions')) || null, sizes: get('sizes'), other_sizes: get('other_sizes'),
      request_update: briefUpdate ? String(briefUpdate.text_body).slice(0, 8000) : null,
    },
  };
}

/** Hook variations listed in the request update ("Hook Variations\n----\n1. …\n2. …"), falling back to the Hook column. */
function hookVariations(item) {
  const out = [];
  // The request form writes "Hook Variations\n-----\n\n1. …\n2. …\n\nScript / Message\n-----" — take the numbered lines
  const m = String(item?.brief?.request_update || '').match(/Hook Variations\s*\n-{3,}\s*\n([\s\S]*?)(?:\n\s*\n[^\n]+\n-{3,}|$)/i);
  if (m) for (const line of m[1].split('\n')) { const x = line.match(/^\s*\d+[.)]\s*(.+)$/); if (x) out.push(x[1].trim()); }
  if (!out.length && item?.brief?.hook) out.push(item.brief.hook);
  return out;
}

/**
 * The newest item on a board named like `name`. Frame.io strips "|" from folder names, so
 * "Ashford | Bone & Joint | … | Would You Date Him" arrives as "Ashford  Bone & Joint  …  Would You Date Him":
 * try the exact name, then search by its longest part and compare with "|" and spacing ignored.
 */
const looseName = (s) => String(s || '').replace(/[|｜]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
async function findItemByName(boardId, name) {
  const n = String(name || '').trim();
  if (!n) return null;
  const newest = (items) => items.filter(i => i.state !== 'deleted').sort((x, y) => Number(y.id) - Number(x.id))[0]?.id || null;
  const exact = await mondayQuery(`query ($b: ID!, $v: [String]!) {
    items_page_by_column_values(board_id: $b, limit: 10, columns: [{ column_id: "name", column_values: $v }]) { items { id name state } }
  }`, { b: String(boardId), v: [n] });
  const hit = newest((exact?.items_page_by_column_values?.items || []).filter(i => i.name.trim() === n));
  if (hit) return hit;
  const part = n.split(/\s{2,}|\s*[|｜]\s*/).map(x => x.trim()).filter(Boolean).sort((x, y) => y.length - x.length)[0];
  if (!part || part.length < 6) return null;
  const d = await mondayQuery(`query ($b: [ID!], $v: CompareValue!) {
    boards(ids: $b) { items_page(limit: 25, query_params: { rules: [{ column_id: "name", compare_value: $v, operator: contains_text }] }) { items { id name state } } }
  }`, { b: [String(boardId)], v: [part] });
  return newest((d?.boards?.[0]?.items_page?.items || []).filter(i => looseName(i.name) === looseName(n)));
}

async function postUpdate(itemId, body) {
  const token = process.env.CAPTAIN_MONDAY_TOKEN;
  if (!token) throw Object.assign(new Error("The Captain's Monday token isn't set (CAPTAIN_MONDAY_TOKEN)"), { code: 'NOT_CONFIGURED' });
  const text = body.startsWith(PREFIX) ? body : `${PREFIX} ${body}`;
  const d = await mondayQuery('mutation ($item: ID!, $body: String!) { create_update(item_id: $item, body: $body) { id } }', { item: String(itemId), body: text }, { token });
  return d?.create_update?.id || null;
}

async function status() {
  const token = process.env.CAPTAIN_MONDAY_TOKEN;
  if (!token) return { configured: false, connected: false };
  try {
    const d = await mondayQuery('query { me { id name } }', {}, { token, retries: 1 });
    return { configured: true, connected: true, user_name: d?.me?.name || null, user_id: d?.me?.id || null };
  } catch (e) { return { configured: true, connected: false, error: e.message }; }
}

module.exports = { linkFromUpdates, PREFIX, readItem, findItemByName, hookVariations, postUpdate, status };

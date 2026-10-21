/**
 * Shared Monday.com GraphQL client.
 *
 * - Retries 429 / 5xx / complexity + rate-limit errors (honours retry_in_seconds / Retry-After)
 * - At most 4 requests in flight (module-level semaphore)
 * - Helpers: fetchAllItems (items_page + next_items_page), itemsByIds, activityLogs,
 *   boardMeta (status label index <-> text + hex colours), usersByIds, assetsByIds
 * - cached(key, ttl, fn): single-flight in-memory TTL cache
 */

const MONDAY_URL = 'https://api.monday.com/v2';
const API_VERSION = () => process.env.MONDAY_API_VERSION || '2024-10';

class MondayError extends Error {
  constructor(message, { code, status, retryAfter } = {}) {
    super(message);
    this.name = 'MondayError';
    this.code = code;
    this.status = status;
    this.retryAfter = retryAfter;
  }
}

// ── Concurrency limiter ─────────────────────────────────────────────────────
const MAX_IN_FLIGHT = 4;
let inFlight = 0;
const waiters = [];
async function acquire() {
  if (inFlight < MAX_IN_FLIGHT) { inFlight++; return; }
  await new Promise(resolve => waiters.push(resolve));
  inFlight++;
}
function release() {
  inFlight--;
  const next = waiters.shift();
  if (next) next();
}

const RETRYABLE_CODES = new Set([
  'COMPLEXITY_BUDGET_EXHAUSTED', 'ComplexityException', 'RATE_LIMIT_EXCEEDED',
  'maxConcurrencyExceeded', 'IP_RATE_LIMIT_EXCEEDED', 'INTERNAL_SERVER_ERROR',
]);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function retryDelayFromError(err) {
  const ext = err?.extensions || {};
  if (Number.isFinite(ext.retry_in_seconds)) return ext.retry_in_seconds * 1000;
  const m = String(err?.message || '').match(/(\d+)\s*seconds?/i);
  return m ? Number(m[1]) * 1000 : null;
}

/**
 * Run a GraphQL query against Monday.
 * @returns {Promise<object>} data
 */
async function mondayQuery(query, variables = {}, { retries = 3, timeoutMs = 30000, deadline = null } = {}) {
  const token = process.env.MONDAY_API_TOKEN;
  if (!token) throw new MondayError('Monday.com API token not configured (MONDAY_API_TOKEN)', { code: 'NO_TOKEN' });

  let attempt = 0;
  for (;;) {
    attempt++;
    let res, body;
    await acquire();
    try {
      res = await fetch(MONDAY_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: token, 'API-Version': API_VERSION() },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      body = await res.json().catch(() => null);
    } catch (e) {
      release();
      if (attempt <= retries) { await sleep(Math.min(1000 * 2 ** (attempt - 1), 30000)); continue; }
      throw new MondayError(`Monday request failed: ${e.message}`, { code: 'NETWORK' });
    }
    release();

    // HTTP-level rate limit / server errors
    if (res.status === 429 || res.status >= 500) {
      const ra = Number(res.headers.get('retry-after'));
      const wait = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(1000 * 2 ** (attempt - 1), 30000);
      if (attempt <= retries && !(deadline && Date.now() + wait > deadline)) { await sleep(wait); continue; }
      throw new MondayError(`Monday API HTTP ${res.status}`, { status: res.status, retryAfter: wait });
    }

    const errs = body?.errors || (body?.error_message ? [{ message: body.error_message, extensions: { code: body.error_code } }] : null);
    if (errs && errs.length) {
      const e = errs[0];
      const code = e?.extensions?.code || body?.error_code;
      if (RETRYABLE_CODES.has(code) && attempt <= retries) {
        const wait = retryDelayFromError(e) ?? Math.min(1000 * 2 ** (attempt - 1), 30000);
        if (wait > 40000 && deadline) throw new MondayError(e.message, { code, retryAfter: wait });
        if (!(deadline && Date.now() + wait > deadline)) { await sleep(wait); continue; }
      }
      throw new MondayError(e?.message || 'Monday query failed', { code, status: res.status });
    }
    if (!res.ok) throw new MondayError(`Monday API HTTP ${res.status}`, { status: res.status });
    return body?.data || {};
  }
}

// ── Single-flight TTL cache ─────────────────────────────────────────────────
const cache = new Map(); // key -> { at, ttl, value?, promise? }
async function cached(key, ttlMs, fn, { force = false } = {}) {
  const hit = cache.get(key);
  const now = Date.now();
  if (!force && hit) {
    if (hit.promise) return hit.promise;
    if (now - hit.at < hit.ttl) return hit.value;
  }
  const promise = (async () => fn())();
  cache.set(key, { at: now, ttl: ttlMs, promise });
  try {
    const value = await promise;
    cache.set(key, { at: Date.now(), ttl: ttlMs, value });
    return value;
  } catch (e) {
    cache.delete(key);
    throw e;
  }
}
function clearCache(prefix = '') {
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}

// ── Item fragment ───────────────────────────────────────────────────────────
const ITEM_FIELDS = `
  id name url created_at updated_at state
  group { id title }
  board { id }
  column_values(ids: $cols) {
    id type text value
    ... on StatusValue { index label is_done }
    ... on PeopleValue { persons_and_teams { id kind } }
    ... on TimelineValue { from to }
    ... on DateValue { date }
    ... on LinkValue { url url_text }
    ... on NumbersValue { number }
    ... on DropdownValue { values { id label } }
    ... on TimeTrackingValue { running started_at duration history { started_at ended_at } }
    ... on FileValue { files { ... on FileAssetValue { asset_id name is_image } ... on FileLinkValue { url name kind } } }
  }`;

/** Page through every item matching queryParams on a board. */
async function fetchAllItems(boardId, { cols, queryParams = null, limit = 500, maxPages = 20, deadline } = {}) {
  const qp = queryParams ? ', query_params: $qp' : '';
  const qpDecl = queryParams ? ', $qp: ItemsQuery' : '';
  const first = await mondayQuery(
    `query ($board: [ID!], $cols: [String!], $limit: Int!${qpDecl}) {
       boards(ids: $board) { items_page(limit: $limit${qp}) { cursor items { ${ITEM_FIELDS} } } }
     }`,
    { board: [String(boardId)], cols, limit, ...(queryParams ? { qp: queryParams } : {}) },
    { deadline }
  );
  const page = first?.boards?.[0]?.items_page || { items: [], cursor: null };
  const items = [...(page.items || [])];
  let cursor = page.cursor;
  let pages = 1;
  while (cursor && pages < maxPages) {
    const next = await mondayQuery(
      `query ($cursor: String!, $cols: [String!], $limit: Int!) {
         next_items_page(cursor: $cursor, limit: $limit) { cursor items { ${ITEM_FIELDS} } }
       }`,
      { cursor, cols, limit },
      { deadline }
    );
    const np = next?.next_items_page || {};
    items.push(...(np.items || []));
    cursor = np.cursor;
    pages++;
  }
  return { items, truncated: !!cursor };
}

/** Fetch items by id (chunks of 100, two chunks in parallel). */
async function itemsByIds(ids, { cols, deadline } = {}) {
  const unique = [...new Set((ids || []).map(String))];
  const chunks = [];
  for (let i = 0; i < unique.length; i += 100) chunks.push(unique.slice(i, i + 100));
  const out = [];
  for (let i = 0; i < chunks.length; i += 2) {
    const batch = chunks.slice(i, i + 2).map(chunk => mondayQuery(
      `query ($ids: [ID!], $cols: [String!]) { items(ids: $ids, limit: 100) { ${ITEM_FIELDS} } }`,
      { ids: chunk, cols },
      { deadline }
    ));
    const results = await Promise.all(batch);
    for (const r of results) out.push(...(r?.items || []));
  }
  return out;
}

// ── Activity logs ───────────────────────────────────────────────────────────
/** Monday activity log timestamps are 17-digit strings in 100ns units. */
function activityTsToMs(createdAt) {
  try { return Number(BigInt(String(createdAt)) / 10000n); } catch { return NaN; }
}

function parseLabel(v) {
  if (!v || typeof v !== 'object') return null;
  const label = v.label;
  if (label && typeof label === 'object') return { text: label.text ?? '', is_done: !!label.is_done, index: label.index ?? null };
  return null;
}

function normalizeActivity(row, boardId) {
  let data = {};
  try { data = typeof row.data === 'string' ? JSON.parse(row.data) : (row.data || {}); } catch { data = {}; }
  return {
    id: row.id,
    event: row.event,
    board_id: String(boardId),
    pulse_id: data.pulse_id != null ? String(data.pulse_id) : (data.pulse?.id != null ? String(data.pulse.id) : null),
    pulse_name: data.pulse_name || data.pulse?.name || '',
    column_id: data.column_id || null,
    group_id: data.group_id || null,
    parent_item_id: data.parent_item_id || null,
    is_undo: !!data.is_undo_action,
    at_ms: activityTsToMs(row.created_at),
    user_id: row.user_id != null ? String(row.user_id) : null,
    prev: parseLabel(data.previous_value),
    value: parseLabel(data.value),
  };
}

/**
 * All activity log rows for a board in [fromIso, toIso). Pages until a short page.
 * Returns { events, truncated }.
 */
async function activityLogs(boardId, { fromIso, toIso, columnIds = null, itemIds = null, limit = 500, maxPages = 20, deadline } = {}) {
  const events = [];
  const seen = new Set();
  let truncated = false;
  for (let page = 1; page <= maxPages; page++) {
    const data = await mondayQuery(
      `query ($board: [ID!], $from: ISO8601DateTime, $to: ISO8601DateTime, $cols: [String], $items: [ID!], $limit: Int, $page: Int) {
         boards(ids: $board) { activity_logs(from: $from, to: $to, column_ids: $cols, item_ids: $items, limit: $limit, page: $page) { id event data created_at user_id } }
       }`,
      { board: [String(boardId)], from: fromIso, to: toIso, cols: columnIds, items: itemIds, limit, page },
      { deadline }
    );
    const rows = data?.boards?.[0]?.activity_logs || [];
    for (const r of rows) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      events.push(normalizeActivity(r, boardId));
    }
    if (rows.length < limit) break;
    if (page === maxPages) truncated = true;
  }
  return { events, truncated };
}

/**
 * Multiple week windows for one board in a single aliased query (trend backfill).
 * windows: [{ key, fromIso, toIso }] -> { [key]: events[] }
 */
async function activityLogsMulti(boardId, windows, { columnIds = ['status'], limit = 500, deadline } = {}) {
  if (!windows.length) return {};
  const decls = windows.map((_, i) => `$f${i}: ISO8601DateTime, $t${i}: ISO8601DateTime`).join(', ');
  const parts = windows.map((_, i) =>
    `w${i}: boards(ids: $board) { activity_logs(from: $f${i}, to: $t${i}, column_ids: $cols, limit: $limit) { id event data created_at user_id } }`
  ).join('\n');
  const vars = { board: [String(boardId)], cols: columnIds, limit };
  windows.forEach((w, i) => { vars[`f${i}`] = w.fromIso; vars[`t${i}`] = w.toIso; });
  const data = await mondayQuery(`query ($board: [ID!], $cols: [String], $limit: Int, ${decls}) { ${parts} }`, vars, { deadline });
  const out = {};
  for (let i = 0; i < windows.length; i++) {
    const rows = data?.[`w${i}`]?.[0]?.activity_logs || [];
    out[windows[i].key] = { events: rows.map(r => normalizeActivity(r, boardId)), full: rows.length >= limit };
  }
  // Any window that hit the limit gets paged on its own
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i];
    if (out[w.key].full) {
      const { events } = await activityLogs(boardId, { fromIso: w.fromIso, toIso: w.toIso, columnIds, limit, deadline });
      out[w.key] = { events, full: false };
    }
  }
  const flat = {};
  for (const k of Object.keys(out)) flat[k] = out[k].events;
  return flat;
}

// ── Board metadata ──────────────────────────────────────────────────────────
const normLabel = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Columns + groups for a board, with parsed status-label maps.
 * statusMaps[colId] = { byIndex: {idx: {label, color, deactivated}}, byLabel: {normLabel: idx} }
 */
async function boardMeta(boardId, { force = false } = {}) {
  return cached(`meta:${boardId}`, 60 * 60 * 1000, async () => {
    const data = await mondayQuery(
      `query ($board: [ID!]) { boards(ids: $board) { id name columns { id title type settings_str } groups { id title } } }`,
      { board: [String(boardId)] }
    );
    const b = data?.boards?.[0];
    if (!b) throw new MondayError(`Board ${boardId} not found`, { code: 'NOT_FOUND' });
    const columns = {};
    const statusMaps = {};
    const dropdowns = {};
    for (const c of b.columns || []) {
      columns[c.id] = { id: c.id, title: c.title, type: c.type };
      if (c.type === 'status' || c.type === 'color') {
        let s = {};
        try { s = JSON.parse(c.settings_str || '{}'); } catch { s = {}; }
        const labels = s.labels || {};
        const colors = s.labels_colors || {};
        const deactivated = new Set((s.deactivated_labels || []).map(String));
        const byIndex = {};
        const byLabel = {};
        for (const [idx, label] of Object.entries(labels)) {
          const color = colors[idx]?.color || null;
          byIndex[idx] = { label, color, deactivated: deactivated.has(String(idx)) };
          if (label && !(normLabel(label) in byLabel && deactivated.has(String(idx)))) byLabel[normLabel(label)] = Number(idx);
        }
        statusMaps[c.id] = { byIndex, byLabel };
      }
      if (c.type === 'dropdown') {
        let s = {};
        try { s = JSON.parse(c.settings_str || '{}'); } catch { s = {}; }
        dropdowns[c.id] = (Array.isArray(s.labels) ? s.labels : []).filter(l => l && !l.is_deactivated).map(l => l.name).filter(Boolean);
      }
    }
    return { id: String(b.id), name: b.name, columns, groups: b.groups || [], statusMaps, dropdowns };
  }, { force });
}

/** Monday users by id (cached 1h per id set). */
async function usersByIds(ids) {
  const unique = [...new Set((ids || []).map(String))].filter(Boolean).sort();
  if (!unique.length) return [];
  return cached(`users:${unique.join(',')}`, 60 * 60 * 1000, async () => {
    const out = [];
    for (let i = 0; i < unique.length; i += 100) {
      const data = await mondayQuery(
        `query ($ids: [ID!]) { users(ids: $ids, limit: 100) { id name email title photo_thumb_small photo_small enabled } }`,
        { ids: unique.slice(i, i + 100) }
      );
      out.push(...(data?.users || []));
    }
    return out;
  });
}

/** Asset metadata incl. public_url (valid ~1h — never store it). */
async function assetsByIds(ids) {
  const unique = [...new Set((ids || []).map(String))].filter(Boolean);
  if (!unique.length) return [];
  const data = await mondayQuery(
    `query ($ids: [ID!]!) { assets(ids: $ids) { id name file_extension file_size public_url url_thumbnail } }`,
    { ids: unique }
  );
  return data?.assets || [];
}

module.exports = {
  MondayError,
  mondayQuery,
  cached,
  clearCache,
  fetchAllItems,
  itemsByIds,
  activityLogs,
  activityLogsMulti,
  activityTsToMs,
  boardMeta,
  usersByIds,
  assetsByIds,
  normLabel,
};

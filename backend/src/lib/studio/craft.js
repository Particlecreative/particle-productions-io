/**
 * The editor's / designer's bench (Tomer, 25 Nov 2026):
 *   · checklist — "Sizes needed" (× versions) as a delivery checklist on the task, shared by everyone on it (CP keeps it)
 *   · frameStatus — the latest Frame.io version in a task's folder and how many comments it has (read-only, cached 10 min)
 *   · nowWorking — the person's tasks in Working and since when (the status log), for the header timer
 */
const db = require('../../db');
const monday = require('../monday');

// ── checklist ────────────────────────────────────────────────────────────────
let ready = null;
function ensure() {
  if (!ready) {
    ready = db.query(`CREATE TABLE IF NOT EXISTS studio_checklists (item_id TEXT PRIMARY KEY, done JSONB NOT NULL DEFAULT '[]'::jsonb,
      updated_by TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(e => { ready = null; throw e; });
  }
  return ready;
}

/** The boxes for a task (pure): sizes × versions (V1…Vn) when there are 2–6 versions, else one per size. */
function boxesOf(sizes = [], versions = null) {
  const s = [...new Set((sizes || []).map(x => String(x).trim()).filter(Boolean))].slice(0, 12);
  const n = Math.round(Number(versions) || 0);
  if (!s.length) return n >= 2 && n <= 12 ? Array.from({ length: n }, (_, i) => `V${i + 1}`) : [];
  if (n >= 2 && n <= 6) return s.flatMap(size => Array.from({ length: n }, (_, i) => `${size} · V${i + 1}`));
  return s;
}

async function getChecklist(itemId) {
  await ensure();
  const { rows } = await db.query('SELECT done, updated_by, updated_at FROM studio_checklists WHERE item_id = $1', [String(itemId)]);
  return { done: rows[0]?.done || [], updated_by: rows[0]?.updated_by || null, updated_at: rows[0]?.updated_at || null };
}

async function saveChecklist(itemId, done, user) {
  await ensure();
  const list = [...new Set((Array.isArray(done) ? done : []).map(x => String(x).slice(0, 80)))].slice(0, 100);
  await db.query(`INSERT INTO studio_checklists (item_id, done, updated_by, updated_at) VALUES ($1, $2, $3, NOW())
    ON CONFLICT (item_id) DO UPDATE SET done = EXCLUDED.done, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
  [String(itemId), JSON.stringify(list), user?.name || user?.email || null]);
  return { done: list };
}

/** Many tasks' ticks at once (for the board cards). */
async function checklists(itemIds) {
  const ids = [...new Set((itemIds || []).map(String))].slice(0, 500);
  if (!ids.length) return {};
  await ensure();
  const { rows } = await db.query('SELECT item_id, done FROM studio_checklists WHERE item_id = ANY($1::text[])', [ids]);
  return Object.fromEntries(rows.map(r => [r.item_id, r.done || []]));
}

// ── Frame.io ────────────────────────────────────────────────────────────────
/** The newest file in the task's Frame.io link + its comment count. → { name, version, modified, comments, files } | null */
async function frameStatus(link) {
  if (!link || !/frame\.io|f\.io/i.test(link)) return null;
  return monday.cached(`frame-status:${link}`, 10 * 60 * 1000, async () => {
    const fio = require('../creative/providers/frameio');
    const { entries = [] } = await fio.listing(link);
    const latest = entries.filter(e => e.kind === 'video' || e.kind === 'image' || e.kind === 'pdf')[0] || entries[0];
    if (!latest) return { files: 0, name: null, version: null, modified: null, comments: null };
    let comments = null;
    try {
      const acct = await fio.resolveAccount();
      const d = await fio.api(`/accounts/${acct}/files/${latest.key}/comments?page_size=100`);
      comments = (d?.data || []).length;
    } catch { comments = null; }
    return { files: entries.length, name: latest.name, version: latest.version || null, modified: latest.modified || null, comments };
  });
}

/** Several tasks at once (3 at a time) → { itemId: status|{ error } } */
async function frameStatuses(items) {
  const out = {};
  const list = (items || []).filter(it => it.links?.frame).slice(0, 40);
  let i = 0;
  const run = async () => {
    while (i < list.length) {
      const it = list[i++];
      try { out[it.id] = await frameStatus(it.links.frame); } catch (e) { out[it.id] = { error: e.code === 'NOT_CONNECTED' ? 'Frame.io isn’t connected' : 'Frame.io didn’t answer' }; }
    }
  };
  await Promise.all([run(), run(), run()]);
  return out;
}

// ── Now working ─────────────────────────────────────────────────────────────
/**
 * The person's tasks in Working and since when: the latest move into an in-progress status in the last 30 days.
 * items = their my-tasks items. → [{ id, board, name, title, since_ms|null }]
 */
async function nowWorking(items, config, { now = Date.now() } = {}) {
  const working = (items || []).filter(it => it.status?.category === 'in_progress');
  if (!working.length) return [];
  const out = [];
  for (const bk of Object.keys(config.boards)) {
    const mine = working.filter(it => it.board === bk);
    if (!mine.length) continue;
    const b = config.boards[bk];
    const inProgress = new Set((b.statuses?.in_progress || []).map(s => s.toLowerCase()));
    let events = [];
    try {
      ({ events } = await monday.activityLogs(b.board_id, { fromIso: new Date(now - 30 * 86400000).toISOString(), columnIds: [b.columns.status], itemIds: mine.map(it => it.id), limit: 200, maxPages: 2 }));
    } catch { events = []; }
    for (const it of mine) {
      const into = events.filter(e => String(e.pulse_id) === String(it.id) && inProgress.has(String(e.value?.text || '').toLowerCase())).sort((a, z) => z.at_ms - a.at_ms)[0];
      out.push({ id: String(it.id), board: bk, name: it.name, title: it.title || null, product: it.product?.label || null, since_ms: into?.at_ms || null });
    }
  }
  return out.sort((a, z) => (z.since_ms || 0) - (a.since_ms || 0));
}

module.exports = { boxesOf, getChecklist, saveChecklist, checklists, frameStatus, frameStatuses, nowWorking };

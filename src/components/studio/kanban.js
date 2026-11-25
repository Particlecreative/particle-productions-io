// The Creative team's Kanban (Tomer, 25 Nov 2026: "the Kanban look the team loves the most — make it even better and
// smarter, arranged by timelines, deadlines and priority"). Pure — no React — so it's tested directly.

const PRIORITY = { critical: 0, urgent: 0, high: 1, medium: 2, normal: 2, low: 3 };
/** "Critical ⚠️" → 0 … "Low" → 3; none → 4. */
export function priorityRank(p) {
  const label = p && typeof p === 'object' ? p.label : p;   // tasks carry { label, color }; email tasks a plain string
  const k = String(label || '').toLowerCase().replace(/[^a-z]/g, '');
  return k in PRIORITY ? PRIORITY[k] : 4;
}

const dueOf = (it) => it.deadline || it.timeline?.to || null;
const startOf = (it) => it.timeline?.from || null;
const days = (a, b) => Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86400000);

/** How urgent a task is today: overdue / today / soon (≤2 days) / week / later / none. */
export function urgency(it, today) {
  if (!it.open) return 'done';
  const due = dueOf(it);
  if (!due) return 'none';
  const d = days(due, today);
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  if (d <= 2) return 'soon';
  if (d <= 7) return 'week';
  return 'later';
}
const URG = { overdue: 0, today: 1, soon: 2, week: 3, later: 4, none: 5, done: 6 };

/**
 * The smart order inside a column: what's late or due first, then priority, then what starts first, then newest.
 * Deadlines beat priority only when they're close (today / overdue) — a Critical task due next week still floats above
 * a Low task due next week.
 */
export function smartSort(list, today) {
  return [...(list || [])].sort((a, b) => {
    const ua = URG[urgency(a, today)], ub = URG[urgency(b, today)];
    if ((ua <= 1 || ub <= 1) && ua !== ub) return ua - ub;
    const pa = priorityRank(a.priority), pb = priorityRank(b.priority);
    if (pa !== pb) return pa - pb;
    if (ua !== ub) return ua - ub;
    const da = dueOf(a) || '9999', db = dueOf(b) || '9999';
    if (da !== db) return da.localeCompare(db);
    const sa = startOf(a) || '9999', sb = startOf(b) || '9999';
    if (sa !== sb) return sa.localeCompare(sb);
    return String(b.created_at || b.id).localeCompare(String(a.created_at || a.id));
  });
}

/**
 * Status columns in Monday's own order (the board's status list), merged across boards by label — an editor's video
 * board and a designer's design board share most labels. Statuses with no tasks are kept when `keepEmpty` lists them
 * (the main flow), otherwise dropped.
 */
export function statusColumns(items, boards, { keepEmpty = ['queued', 'in_progress', 'review'], hideDone = false } = {}) {
  const cols = new Map();
  const order = [];
  for (const b of Object.values(boards || {})) {
    for (const s of b?.statuses || []) {
      const k = String(s.label).toLowerCase();
      if (!cols.has(k)) { cols.set(k, { key: k, label: s.label, color: s.color, category: s.category, index: order.length, items: [] }); order.push(k); }
    }
  }
  for (const it of items || []) {
    const k = String(it.status?.label || '').toLowerCase();
    if (!cols.has(k)) { cols.set(k, { key: k, label: it.status?.label || 'No status', color: it.status?.color || '#c4c4c4', category: it.status?.category || 'queued', index: order.length, items: [] }); order.push(k); }
    cols.get(k).items.push(it);
  }
  // left → right the way work moves: waiting, working, fixes, review, done — then paused and stuck at the end
  const FLOW = { queued: 0, in_progress: 1, fixes: 2, review: 3, delivered: 4, paused: 5, stuck: 6 };
  const rank = (c) => (c.category in FLOW ? FLOW[c.category] : 7);
  return order.map(k => cols.get(k))
    .filter(c => (c.items.length || keepEmpty.includes(c.category)) && !(hideDone && c.category === 'delivered'))
    .sort((a, b) => rank(a) - rank(b) || a.index - b.index);
}

export const DUE_COLUMNS = [
  ['overdue', 'Overdue', '#e2445c'], ['today', 'Today', '#ff7a00'], ['soon', 'Next 2 days', '#fdab3d'],
  ['week', 'This week', '#579bfc'], ['later', 'Later', '#a25ddc'], ['none', 'No deadline', '#c4c4c4'],
];
/** The same tasks by when they're due — open tasks only. */
export function dueColumns(items, today) {
  const by = Object.fromEntries(DUE_COLUMNS.map(([k, label, color]) => [k, { key: k, label, color, items: [] }]));
  for (const it of items || []) { const u = urgency(it, today); if (by[u]) by[u].items.push(it); }
  return DUE_COLUMNS.map(([k]) => by[k]);
}

/** Next step for a task (one click on the card): the next status forward in the board's flow, or null. */
export function nextStatus(it, statuses) {
  const list = statuses || [];
  const flow = { queued: 'in_progress', paused: 'in_progress', stuck: 'in_progress', in_progress: 'review', fixes: 'review' };
  const want = flow[it.status?.category];
  if (!want) return null;
  return list.find(s => s.category === want) || null;
}

/** One-line deadline words for a card: "Overdue 3d", "Today", "Tomorrow", "Thu", "Dec 4". */
export function dueWords(it, today) {
  const due = dueOf(it);
  if (!due) return '';
  const d = days(due, today);
  if (d < 0) return `Overdue ${-d}d`;
  if (d === 0) return 'Today';
  if (d === 1) return 'Tomorrow';
  if (d < 7) return new Date(`${due}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  return new Date(`${due}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** Search across a task's name, product, brand, type and requester names. */
export function matchTask(it, q, names = {}) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return true;
  return [it.name, it.title, it.product?.label, it.brand?.label, it.type, it.group, ...(it.requested_by || []).map(r => names[r])]
    .filter(Boolean).join(' ').toLowerCase().includes(s);
}

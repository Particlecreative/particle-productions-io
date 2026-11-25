// My Studio, Monday-style (Tomer, 25 Nov 2026: "give them every option to filter and arrange — imitate monday.com"):
// filters by every field, quick filters, sort, group by any field, table columns — pure helpers, no React.
import { priorityRank, smartSort, statusColumns, dueColumns, urgency } from '../studio/kanban';

export const FIELDS = [
  ['status', 'Status'], ['priority', 'Priority'], ['due', 'Deadline'], ['product', 'Product'], ['type', 'Type'], ['campaign', 'Campaign'],
  ['requester', 'Requested by'], ['brand', 'Brand'], ['board', 'Board'], ['links', 'Delivery link'], ['checklist', 'Checklist'],
];
export const GROUPS = [['status', 'Status'], ['due', 'Deadline'], ['priority', 'Priority'], ['product', 'Product'], ['type', 'Type'], ['campaign', 'Campaign'], ['requester', 'Requested by'], ['brand', 'Brand'], ['board', 'Board']];
export const SORTS = [['smart', 'Smart (what’s next)'], ['deadline', 'Deadline'], ['priority', 'Priority'], ['status', 'Status'], ['timeline', 'Timeline start'], ['created', 'Created'], ['name', 'Name'], ['product', 'Product']];
export const COLUMNS = [
  ['status', 'Status'], ['priority', 'Priority'], ['product', 'Product'], ['type', 'Type'], ['brand', 'Brand'], ['campaign', 'Campaign'], ['requester', 'Requested by'],
  ['deadline', 'Deadline'], ['timeline', 'Timeline'], ['links', 'Links'], ['frame', 'Frame.io'], ['checklist', 'Checklist'], ['board', 'Board'], ['created', 'Created'],
];
export const DEFAULT_COLUMNS = ['status', 'priority', 'product', 'deadline', 'timeline', 'frame', 'checklist', 'links'];
export const DUE = [['overdue', 'Overdue'], ['today', 'Today'], ['soon', 'Next 2 days'], ['week', 'This week'], ['later', 'Later'], ['none', 'No deadline'], ['done', 'Done']];
export const QUICK = [
  ['overdue', 'Overdue', { due: ['overdue'] }], ['thisweek', 'Due this week', { due: ['today', 'soon', 'week'] }], ['needlink', 'Needs my link', { links: ['missing'] }],
  ['high', 'High priority', { priority: ['__high'] }], ['review', 'In review', { status: ['__review'] }], ['fixes', 'Fixes', { status: ['__fixes'] }],
];
export const EMPTY_FILTERS = Object.fromEntries(FIELDS.map(([k]) => [k, []]));

const label = (x) => (x && typeof x === 'object' ? x.label : x) || '';
export const campaignsOf = (it) => String(it.campaign || '').split(',').map(s => s.trim()).filter(Boolean);
export const needsLink = (it) => (it.board === 'video' ? !it.links?.frame : it.board === 'design' ? !it.links?.figma : false);

/** The values a task has for a field (for filters and counts). */
export function valuesOf(it, field, { today, checks = {}, boxes = () => [] } = {}) {
  switch (field) {
    case 'status': return [label(it.status) || 'No status'];
    case 'priority': return [label(it.priority) || 'No priority'];
    case 'due': return [it.open === false || it.status?.category === 'delivered' ? 'done' : urgency(it, today) || 'none'];
    case 'product': return [label(it.product) || 'No product'];
    case 'type': return [label(it.type) || 'No type'];
    case 'campaign': { const c = campaignsOf(it); return c.length ? c : ['No campaign']; }
    case 'requester': return it.requested_by?.length ? it.requested_by.map(String) : ['none'];
    case 'brand': return [label(it.brand) || 'Particle'];
    case 'board': return [it.board === 'design' ? 'Design' : 'Video'];
    case 'links': return [needsLink(it) ? 'missing' : 'has'];
    case 'checklist': {
      const b = boxes(it);
      if (!b.length) return ['none'];
      const d = (checks[it.id] || []).filter(x => b.includes(x)).length;
      return [d === b.length ? 'complete' : d ? 'started' : 'not_started'];
    }
    default: return [];
  }
}

/** Does a task pass every filter? Special values: __high (High / Critical), __review / __fixes (status category). */
export function passes(it, filters, ctx) {
  for (const [field, wanted] of Object.entries(filters || {})) {
    if (!wanted?.length) continue;
    if (field === 'status' && wanted.some(w => w.startsWith('__'))) {
      const cats = wanted.filter(w => w.startsWith('__')).map(w => w.slice(2));
      const labels = wanted.filter(w => !w.startsWith('__'));
      if (!(cats.includes(it.status?.category) || labels.includes(label(it.status)))) return false;
      continue;
    }
    if (field === 'priority' && wanted.includes('__high')) {
      const rest = wanted.filter(w => w !== '__high');
      if (!(priorityRank(it.priority) <= 1 && label(it.priority)) && !rest.includes(label(it.priority) || 'No priority')) return false;
      continue;
    }
    const have = valuesOf(it, field, ctx);
    if (!have.some(v => wanted.includes(v))) return false;
  }
  return true;
}

/** Merge a quick filter into the filters (toggle). */
export function toggleQuick(filters, key) {
  const q = QUICK.find(x => x[0] === key);
  if (!q) return filters;
  const next = { ...EMPTY_FILTERS, ...filters };
  const on = isQuickOn(filters, key);
  for (const [field, vals] of Object.entries(q[2])) {
    const cur = new Set(next[field] || []);
    for (const v of vals) { if (on) cur.delete(v); else cur.add(v); }
    next[field] = [...cur];
  }
  return next;
}
export const isQuickOn = (filters, key) => { const q = QUICK.find(x => x[0] === key); return !!q && Object.entries(q[2]).every(([f, vals]) => vals.every(v => (filters?.[f] || []).includes(v))); };
export const activeCount = (filters) => Object.values(filters || {}).reduce((a, v) => a + (v?.length || 0), 0);

/** Options + counts for the filter panel. */
export function optionsOf(items, field, ctx, people = {}) {
  const m = new Map();
  for (const it of items) for (const v of valuesOf(it, field, ctx)) m.set(v, (m.get(v) || 0) + 1);
  const colorOf = (v) => {
    const it = items.find(x => valuesOf(x, field, ctx).includes(v));
    if (!it) return null;
    if (field === 'status') return it.status?.color; if (field === 'priority') return it.priority?.color; if (field === 'product') return it.product?.color;
    if (field === 'type') return it.type?.color; if (field === 'brand') return it.brand?.color; return null;
  };
  const name = (v) => {
    if (field === 'requester') return v === 'none' ? 'Nobody named' : people[v]?.name || 'Someone';
    if (field === 'due') return (DUE.find(d => d[0] === v) || [v, v])[1];
    if (field === 'links') return v === 'missing' ? 'Missing (Frame.io / Figma)' : 'Added';
    if (field === 'checklist') return { complete: 'All done', started: 'Started', not_started: 'Not started', none: 'No checklist' }[v] || v;
    return v;
  };
  let out = [...m.entries()].map(([v, n]) => ({ value: v, label: name(v), count: n, color: colorOf(v) }));
  if (field === 'due') out.sort((a, b) => DUE.findIndex(d => d[0] === a.value) - DUE.findIndex(d => d[0] === b.value));
  else if (field === 'priority') out.sort((a, b) => priorityRank(a.value === 'No priority' ? null : { label: a.value }) - priorityRank(b.value === 'No priority' ? null : { label: b.value }));
  else out.sort((a, b) => b.count - a.count);
  return out;
}

/** Sort a list. */
export function sortItems(list, sort, { today, boards = {} } = {}) {
  const key = sort?.key || 'smart';
  if (key === 'smart') return smartSort(list, today);
  const dir = sort?.dir === 'desc' ? -1 : 1;
  const flow = (it) => {
    const st = boards[it.board]?.statuses || [];
    const i = st.findIndex(s => s.label === label(it.status));
    return i === -1 ? 999 : i;
  };
  const val = {
    deadline: (it) => it.deadline || '9999',
    priority: (it) => priorityRank(it.priority),
    status: flow,
    timeline: (it) => it.timeline?.from || '9999',
    created: (it) => it.created_at || '',
    name: (it) => String(it.title || it.name || '').toLowerCase(),
    product: (it) => String(label(it.product) || '~').toLowerCase(),
  }[key] || ((it) => it.name);
  return [...list].sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * dir || String(a.name).localeCompare(String(b.name)); });
}

/** Group a list by a field → [{ key, label, color, items }] in a sensible order. */
export function groupItems(items, by, { today, boards = {}, people = {}, hideDone = false } = {}) {
  if (by === 'status') return statusColumns(items, boards, { hideDone });
  if (by === 'due') return dueColumns(items, today);
  const list = hideDone ? items.filter(it => it.open !== false && it.status?.category !== 'delivered') : items;
  if (by === 'none') return [{ key: 'all', label: 'All tasks', color: '#0808f8', items: list }];
  const m = new Map();
  const add = (key, lab, color, it) => { if (!m.has(key)) m.set(key, { key, label: lab, color: color || null, items: [] }); m.get(key).items.push(it); };
  for (const it of list) {
    if (by === 'priority') add(label(it.priority) || 'none', label(it.priority) || 'No priority', it.priority?.color || '#c4c4c4', it);
    else if (by === 'product') add(label(it.product) || 'none', label(it.product) || 'No product', it.product?.color, it);
    else if (by === 'type') add(label(it.type) || 'none', label(it.type) || 'No type', it.type?.color, it);
    else if (by === 'brand') add(label(it.brand) || 'Particle', label(it.brand) || 'Particle', it.brand?.color, it);
    else if (by === 'board') add(it.board, it.board === 'design' ? 'Design' : 'Video', it.board === 'design' ? '#a25ddc' : '#0808f8', it);
    else if (by === 'campaign') { const c = campaignsOf(it)[0]; add(c || 'none', c || 'No campaign', null, it); }
    else if (by === 'requester') { const r = it.requested_by?.[0]; add(r ? String(r) : 'none', r ? (people[r]?.name || 'Someone') : 'Nobody named', null, it); }
  }
  const PALETTE = ['#0808f8', '#00c875', '#fdab3d', '#e2445c', '#a25ddc', '#00a9a5', '#ff7a1a', '#579bfc'];
  let out = [...m.values()];
  if (by === 'priority') out.sort((a, b) => priorityRank(a.key === 'none' ? null : { label: a.key }) - priorityRank(b.key === 'none' ? null : { label: b.key }));
  else out.sort((a, b) => (a.key === 'none') - (b.key === 'none') || b.items.length - a.items.length);
  let i = 0;
  for (const g of out) if (!g.color) g.color = g.key === 'none' ? '#c4c4c4' : PALETTE[i++ % PALETTE.length];
  return out;
}

/** Status mix of a group (Monday's "battery"): [{ label, color, n }] */
export function statusMix(items) {
  const m = new Map();
  for (const it of items) { const k = label(it.status) || 'No status'; if (!m.has(k)) m.set(k, { label: k, color: it.status?.color || '#c4c4c4', n: 0 }); m.get(k).n++; }
  return [...m.values()].sort((a, b) => b.n - a.n);
}

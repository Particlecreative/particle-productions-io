// "To schedule" panel — what to schedule first, and the ways to group it (Tomer, 16 Nov 2026).
// Pure: no React, so the order is the same wherever it's shown.

const DAY = 86400000;
const PRIORITY = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_POINTS = { critical: 70, high: 40, medium: 10, low: 0 };
const PRIORITY_COLOR = { critical: '#333333', high: '#e2445c', medium: '#fdab3d', low: '#579bfc' };
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const dayMs = (d) => Date.parse(`${String(d).slice(0, 10)}T12:00:00Z`);
/** Whole days from a to b (b later → positive). */
export const daysBetween = (a, b) => Math.round((dayMs(b) - dayMs(a)) / DAY);

/** "Critical ⚠️️" → "critical"; a label object (Video/Design) or a plain string (email tasks). */
export function priorityKey(p) {
  const label = typeof p === 'string' ? p : p?.label;
  const k = String(label || '').toLowerCase().replace(/[^a-z]/g, '');
  return k in PRIORITY ? k : (k ? 'other' : null);
}
export function priorityOf(it) {
  const k = priorityKey(it.priority);
  if (!k) return null;
  const label = (typeof it.priority === 'string' ? it.priority : it.priority?.label || '').replace(/[⚠️️]/g, '').trim();
  return { key: k, label, color: (typeof it.priority === 'object' && it.priority?.color) || PRIORITY_COLOR[k] || '#c4c4c4' };
}

const first = (name) => (name || '').split(' ')[0];

/**
 * How urgent an unscheduled ticket is — and the one or two reasons to show on its card.
 * Overdue and due-soon weigh most, then priority, then TV, ready-for-assignment and how long it has waited.
 */
export function urgencyOf(it, today) {
  let score = 0;
  const why = [];
  const due = it.deadline ? daysBetween(today, it.deadline) : null;
  if (due != null) {
    if (due < 0) { score += 100 + Math.min(30, -due); why.push({ tone: 'red', text: `${-due}d overdue` }); }
    else if (due === 0) { score += 90; why.push({ tone: 'red', text: 'Due today' }); }
    else if (due === 1) { score += 80; why.push({ tone: 'orange', text: 'Due tomorrow' }); }
    else if (due <= 3) { score += 60; why.push({ tone: 'orange', text: `Due ${DOW[new Date(dayMs(it.deadline)).getUTCDay()]}` }); }
    else if (due <= 7) score += 35;
    else if (due <= 14) score += 15;
  }
  const pr = priorityOf(it);
  if (pr) {
    score += PRIORITY_POINTS[pr.key] || 0;
    if (pr.key === 'critical' || pr.key === 'high') why.push({ tone: 'priority', text: pr.label || (pr.key === 'critical' ? 'Critical' : 'High'), color: pr.color });
  }
  if (it.division === 'tv') { score += 12; why.push({ tone: 'blue', text: 'TV' }); }
  if (/ready\s*for\s*ass/i.test(it.status?.label || '')) score += 12;
  const created = it.created_at ? Date.parse(it.created_at) : NaN;
  const waited = Number.isFinite(created) ? Math.max(0, daysBetween(new Date(created).toISOString().slice(0, 10), today)) : null;
  if (waited != null) {
    score += Math.min(25, waited);
    if (waited >= 7) why.push({ tone: 'gray', text: `Waiting ${waited}d` });
  }
  return { score, due, waited, priority: pr, why: why.slice(0, 2) };
}

/** Most urgent first; ties → earliest deadline → oldest → name. */
export function bySmart(today) {
  const cache = new Map();
  const u = (it) => { const k = `${it.board}:${it.id}`; if (!cache.has(k)) cache.set(k, urgencyOf(it, today)); return cache.get(k); };
  return (a, b) => u(b).score - u(a).score
    || String(a.deadline || '9999').localeCompare(String(b.deadline || '9999'))
    || String(a.created_at || '').localeCompare(String(b.created_at || ''))
    || String(a.title || a.name).localeCompare(String(b.title || b.name));
}

export const SORTS = [
  ['smart', 'Smart order'],
  ['due', 'Due date'],
  ['priority', 'Priority'],
  ['brand', 'Brand'],
  ['requester', 'Requester'],
  ['person', 'Person'],
];

/** Quick filters above the list: [{ key, label, test }] — shown only when something matches. */
export const QUICK = [
  { key: 'overdue', label: 'Overdue', test: (u) => u.due != null && u.due < 0 },
  { key: 'soon', label: 'Due in 3 days', test: (u) => u.due != null && u.due >= 0 && u.due <= 3 },
  { key: 'hot', label: 'Critical · High', test: (u) => ['critical', 'high'].includes(u.priority?.key) },
];

/** Search across the name, product, brand, requesters, status and priority. */
export function matches(it, q, requesters = {}) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return true;
  const hay = [it.name, it.title, it.product?.label, it.brand?.label, it.status?.label, priorityOf(it)?.label,
    ...(it.requested_by || []).map(r => requesters[r]?.name)].filter(Boolean).join(' ').toLowerCase();
  return s.split(/\s+/).every(w => hay.includes(w));
}

const uniq = (items) => {
  const seen = new Set();
  return items.filter(it => { const k = `${it.board}:${it.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
};

/** Every unscheduled ticket once (a ticket with two people sits in both their rows). who = one person only. */
export const poolFor = ({ unassigned = [], rows = [], who = null }) =>
  uniq([...(who ? [] : unassigned), ...rows.filter(r => !who || r.p.id === who).flatMap(r => r.unscheduled)]);

/**
 * The panel's groups for a sort mode.
 *   unassigned: open tickets with nobody on them; rows: [{ p, unscheduled }] per person.
 * → [{ key, title, items, tone?, dot?, person?, requester?, note? }], items smart-ordered inside each group.
 */
export function groupFor(mode, { unassigned = [], rows = [], today, requesters = {}, who = null, keep = () => true }) {
  const smart = bySmart(today);
  const sorted = (items) => items.filter(keep).sort(smart);
  const pool = poolFor({ unassigned, rows, who });
  const done = (groups) => groups.map(g => ({ ...g, items: g.sorted ? g.items : sorted(g.items) })).filter(g => g.items.length);

  if (mode === 'person') {
    return done([
      ...(!who ? [{ key: 'none', title: 'Waiting for someone', tone: 'inbox', items: unassigned }] : []),
      ...rows.filter(r => r.unscheduled.length && (!who || r.p.id === who)).map(r => ({ key: r.p.id, title: r.p.name, person: r.p, items: r.unscheduled })),
    ]);
  }

  if (mode === 'smart') {
    const b = { first: [], week: [], later: [] };
    for (const it of pool) {
      const u = urgencyOf(it, today);
      const k = (u.due != null && u.due <= 1) || u.priority?.key === 'critical' ? 'first'
        : (u.due != null && u.due <= 7) || u.priority?.key === 'high' ? 'week' : 'later';
      b[k].push(it);
    }
    return done([
      { key: 'first', title: 'Schedule first', tone: 'red', note: 'Overdue, due by tomorrow, or critical', items: b.first },
      { key: 'week', title: 'This week', tone: 'orange', note: 'Due within 7 days, or high priority', items: b.week },
      { key: 'later', title: 'When there’s room', tone: 'gray', items: b.later },
    ]);
  }

  if (mode === 'due') {
    const order = [['overdue', 'Overdue', 'red'], ['today', 'Today', 'red'], ['tomorrow', 'Tomorrow', 'orange'], ['week', 'This week', 'orange'],
      ['next', 'Next week', 'gray'], ['later', 'Later', 'gray'], ['none', 'No due date', 'gray']];
    const b = Object.fromEntries(order.map(([k]) => [k, []]));
    for (const it of pool) {
      const d = it.deadline ? daysBetween(today, it.deadline) : null;
      b[d == null ? 'none' : d < 0 ? 'overdue' : d === 0 ? 'today' : d === 1 ? 'tomorrow' : d <= 7 ? 'week' : d <= 14 ? 'next' : 'later'].push(it);
    }
    const byDue = (a, c) => String(a.deadline || '9999').localeCompare(String(c.deadline || '9999')) || smart(a, c);
    return done(order.map(([k, title, tone]) => ({ key: k, title, tone, items: b[k].filter(keep).sort(byDue), sorted: true })));
  }

  if (mode === 'priority') {
    const m = new Map();
    for (const it of pool) {
      const pr = priorityOf(it);
      const k = pr?.key || 'none';
      const g = m.get(k) || { key: k, title: pr?.label || 'No priority', dot: pr?.color || '#c4c4c4', items: [], rank: k === 'none' ? 9 : PRIORITY[k] ?? 5 };
      g.items.push(it);
      m.set(k, g);
    }
    return done([...m.values()].sort((a, b) => a.rank - b.rank));
  }

  if (mode === 'brand') {
    const m = new Map();
    for (const it of pool) {
      const label = it.brand?.label || 'No brand';
      const g = m.get(label) || { key: label, title: label, dot: it.brand?.color || '#c4c4c4', square: true, items: [] };
      g.items.push(it);
      m.set(label, g);
    }
    return done([...m.values()].sort((a, b) => (a.key === 'No brand') - (b.key === 'No brand') || b.items.length - a.items.length || a.title.localeCompare(b.title)));
  }

  if (mode === 'requester') {
    const m = new Map();
    for (const it of pool) {
      const r = (it.requested_by || []).find(id => requesters[id]) || null;   // a ticket sits under its first requester
      const k = r || 'none';
      const g = m.get(k) || { key: k, title: r ? requesters[r].name : 'No requester', requester: r ? requesters[r] : null, items: [] };
      g.items.push(it);
      m.set(k, g);
    }
    return done([...m.values()].sort((a, b) => (a.key === 'none') - (b.key === 'none') || b.items.length - a.items.length || a.title.localeCompare(b.title)));
  }

  return done([{ key: 'all', title: 'To schedule', items: pool }]);
}

/** "for Alon, Efi" */
export const forLine = (it, requesters = {}) => (it.requested_by || []).map(r => first(requesters[r]?.name)).filter(Boolean).join(', ');

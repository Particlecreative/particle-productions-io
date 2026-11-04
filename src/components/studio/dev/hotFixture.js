// Offline dev data for Studio → Hot Projects (synthetic, like fixture.js). Shapes mirror backend/src/lib/studio/hotProjects.js.
import { studioFixture } from './fixture';

const PRIORITIES = [['Critical ⚠️️', '#df2f4a'], ['High', '#ff6d3b'], ['Medium', '#ffcb00'], ['Low', '#00c875']];
const ymd = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const sundayOf = (s) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); };
const addDays = (s, n) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

let week = null;
let pins = null; // [{ id, item_id, board, title, note, related, added_by, added_at }]
let nextId = 10;

function base() {
  if (!week) {
    const from = sundayOf(ymd(new Date()));
    week = studioFixture({ from, to: addDays(from, 6) });
    week.items.forEach((it, i) => { it.priority = { label: PRIORITIES[i % 4][0], color: PRIORITIES[i % 4][1] }; });
  }
  if (!pins) {
    const open = week.items.filter(i => i.open && i.people.length);
    const pick = [open.find(i => i.division === 'tv') || open[0], open.find(i => i.board === 'design' && i.status.category === 'fixes') || open[1], open.find(i => i.status.category === 'stuck') || open[2], open[3]].filter(Boolean);
    pins = pick.map((it, i) => ({ id: String(i + 1), item_id: it.id, board: it.board, title: i === 0 ? 'The Hunt — TV commercial' : null, note: i === 0 ? 'Offline cut due to the network on Thursday. Online + grade next week.' : '', related: i === 0 ? [{ board: 'video', item_id: open[5].id }] : [], added_by: 'Avi Levi', added_at: new Date(Date.now() - (i + 2) * 86400e3).toISOString() }));
  }
  return week;
}

/** Enrich a fixture task with the analytics hotProjects.js adds. */
function enrich(it, r) {
  const now = Date.now();
  const created = Date.parse(it.created_at);
  const cats = it.board === 'video'
    ? [['Ready for Assignment', '#ff007f', 'queued'], ['Pending', '#df2f4a', 'queued'], ['Working', '#fdab3d', 'in_progress'], ['Review', '#9cd326', 'review'], ['Fixes Round', '#cab641', 'fixes'], ['Working', '#fdab3d', 'in_progress'], ['Review', '#9cd326', 'review']]
    : [['Ready For Assigment', '#faa1f1', 'queued'], ['Working', '#fdab3d', 'in_progress'], ['Quality Check', '#579bfc', 'review'], ['Fixes Round', '#cab641', 'fixes'], ['Working', '#fdab3d', 'in_progress']];
  const steps = Math.max(2, Math.min(cats.length, 2 + Math.floor(r * cats.length)));
  const marks = [created];
  for (let i = 1; i < steps; i++) marks.push(created + ((now - created) * i) / steps * (0.8 + r * 0.3));
  const journey = [];
  for (let i = 0; i < steps; i++) {
    const [label, color, category] = i === steps - 1 ? [it.status.label, it.status.color, it.status.category] : cats[i];
    journey.push({ label, color, category, from: new Date(marks[i]).toISOString(), to: new Date(i === steps - 1 ? now : marks[i + 1]).toISOString() });
  }
  const phases = {};
  for (const s of journey) phases[s.category] = (phases[s.category] || 0) + Math.round((Date.parse(s.to) - Date.parse(s.from)) / 1000);
  const fix = journey.filter(s => s.category === 'fixes').length;
  return {
    ...it,
    journey,
    life: { submitted: it.created_at, assigned: new Date(marks[1] || created).toISOString(), started: journey.find(s => s.category === 'in_progress')?.from || null, completed: null, phases, partial: false },
    fix_rounds: fix,
    review_rounds: journey.filter(s => s.category === 'review').length,
    status_since: journey[journey.length - 1].from,
    deadline_moves: r > 0.5 ? [{ at: new Date(now - 5 * 86400e3).toISOString(), by: '301', from: addDays(it.deadline, -4), to: it.deadline }] : [],
    timeline_moves: r > 0.3 ? [{ at: new Date(now - 3 * 86400e3).toISOString(), by: '302', from: { from: it.timeline.from, to: addDays(it.timeline.to, -2) }, to: it.timeline }] : [],
    reassignments: r > 0.7 ? [{ at: new Date(now - 6 * 86400e3).toISOString(), by: '301', from: ['102'], to: it.people }] : [],
    timers: { working: { s: Math.round(it.effort_total_s * 1.3), running: it.status.category === 'in_progress' }, review: { s: Math.round(phases.review || 0) / 3, running: it.status.category === 'review' }, lifecycle: { s: Math.round((now - created) / 1000 / 2.4), running: true }, stuck: { s: 0, running: false } },
    updates: {
      count: 3 + Math.floor(r * 9),
      recent: [
        { id: 'u1', text: 'V2 is up on Frame — tightened the opening and swapped the VO take. Waiting on notes from marketing.', at: new Date(now - 4 * 3600e3).toISOString(), by: { id: it.people[0], name: week.people[it.people[0]]?.name || 'Editor' } },
        { id: 'u2', text: 'Notes: logo lockup at the end is too small, and the CTA needs the 25% off line.', at: new Date(now - 30 * 3600e3).toISOString(), by: { id: it.requested_by[0], name: week.requesters[it.requested_by[0]]?.name || 'Requester' } },
      ],
    },
    effort_week_s: it.effort_s,
    links: { frame: 'https://next.frame.io', dropbox: 'https://www.dropbox.com', figma: it.board === 'design' ? 'https://www.figma.com' : null, project: null },
    last_activity: new Date(now - 4 * 3600e3).toISOString(),
  };
}

function healthOf(it, today) {
  if (!it.open) return { key: 'done', reasons: [] };
  const due = it.deadline || it.timeline?.to;
  const reasons = [];
  const late = due && due < today;
  if (late) reasons.push('2 days past the deadline');
  if (it.status.category === 'stuck') reasons.push('Stuck');
  if (it.fix_rounds >= 3) reasons.push(`${it.fix_rounds} fix rounds`);
  if (it.deadline_moves.length >= 2) reasons.push(`Deadline moved ${it.deadline_moves.length}×`);
  return { key: late ? 'late' : reasons.length ? 'at_risk' : 'on_track', reasons };
}

export function fixtureHot() {
  const w = base();
  const today = ymd(new Date());
  const byId = new Map(w.items.map(i => [i.id, i]));
  const items = {};
  let k = 0;
  for (const p of pins) for (const id of [p.item_id, ...p.related.map(r => r.item_id)]) {
    const it = byId.get(id);
    if (it && !items[id]) items[id] = enrich(it, ((++k * 37) % 100) / 100);
  }
  return {
    generated_at: new Date().toISOString(), today, build_ms: 900, boards: w.boards,
    people: { ...w.requesters, ...w.people }, requesters: { ...w.requesters, ...w.people },
    items: Object.values(items),
    projects: pins.map(p => ({ ...p, health: healthOf(items[p.item_id], today), related_ids: p.related.map(r => r.item_id).filter(id => items[id]) })),
    effort_pending: false, warnings: [],
  };
}

export function fixtureHotSuggestions({ q = '', requester = '' } = {}) {
  const w = base();
  const pinned = new Set(pins.flatMap(p => [p.item_id, ...p.related.map(r => r.item_id)]));
  const rank = { 'Critical ⚠️️': 40, High: 25, Medium: 8, Low: 0 };
  let list = w.items.filter(i => i.open && !pinned.has(i.id)).map((it) => {
    const reasons = [];
    if (rank[it.priority.label] >= 25) reasons.push(`${it.priority.label.startsWith('Critical') ? 'Critical' : 'High'} priority`);
    if (it.division === 'tv') reasons.push('TV & SP');
    if (it.status.category === 'stuck') reasons.push('Stuck');
    if (it.requested_by[0] === '301') reasons.push('Requested by Avi, like 2 hot projects');
    return { item: it, score: rank[it.priority.label] + (it.division === 'tv' ? 15 : 0) + reasons.length * 4, reasons };
  });
  const counts = {};
  for (const s of list) for (const id of s.item.requested_by) counts[id] = (counts[id] || 0) + 1;
  if (requester) list = list.filter(s => s.item.requested_by.includes(requester));
  if (q.trim()) list = list.filter(s => s.item.name.toLowerCase().includes(q.trim().toLowerCase()));
  list.sort((a, b) => b.score - a.score);
  return {
    suggestions: list.slice(0, q || requester ? 40 : 15), total: list.length, today: ymd(new Date()), boards: w.boards,
    requesters: Object.entries(counts).map(([id, n]) => ({ id, name: w.requesters[id]?.name || id, photo: null, n, hot: id === '301' ? 2 : 0 })).sort((a, b) => b.hot - a.hot || b.n - a.n),
    people: { ...w.requesters, ...w.people },
  };
}

export function fixtureHotAdd(itemId) {
  base();
  const it = week.items.find(i => i.id === String(itemId));
  if (!it || pins.some(p => p.item_id === it.id)) return { id: null, already: true };
  pins.push({ id: String(++nextId), item_id: it.id, board: it.board, title: null, note: '', related: [], added_by: 'You', added_at: new Date().toISOString() });
  return { id: String(nextId), already: false };
}
export function fixtureHotUpdate(id, patch) {
  const p = pins.find(x => x.id === String(id));
  if (p) Object.assign(p, patch);
  return { ok: true };
}
export function fixtureHotOrder(ids) {
  pins.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
  return { ok: true };
}
export function fixtureHotRemove(id) {
  pins = pins.filter(p => p.id !== String(id));
  return { ok: true };
}

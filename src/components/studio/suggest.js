// Studio Workload — friendly scheduling ideas (Tomer, 16 Nov 2026): who should take a ticket and when.
// Who: the server's brain (6 months of finished tickets — requester, type, product, brand; lib/studio/fit.js).
// When: worked out here, from what the Workload already knows — everyone's open tasks, capacity and time off.
import { addDays } from './Filters';
import { outOn } from './writes';
import { perDay, loadByDay } from './capacity';

const dowOf = (d) => new Date(`${d}T12:00:00Z`).getUTCDay();
const isWorkday = (d) => dowOf(d) <= 4;   // Sun–Thu
export const nextWorkday = (d) => { let x = d; for (let i = 0; i < 7 && !isWorkday(x); i++) x = addDays(x, 1); return x; };
export const nextWorkdayAfter = (d) => nextWorkday(addDays(d, 1));
const DEFAULT_DAYS = { video: 2, design: 1 };
const first = (n) => String(n || '').split(' ')[0];

/** A person's load per day — the Workload's own rule (capacity.js). */
export const loadOf = (items, personId, data) => loadByDay(items, personId, perDay(data, data?.people?.[personId]?.role));

/** The earliest run of `days` working days, from today, with room every day and none of them off (pure). */
export function whenFor({ person, days, load, capacity, today, horizon = 20 }) {
  const need = 1 / Math.max(1, days);
  let start = nextWorkday(today);
  for (let i = 0; i < horizon; i++) {
    const win = [start];
    while (win.length < days) win.push(nextWorkdayAfter(win[win.length - 1]));
    if (win.every(d => !outOn(person, d) && (load[d] || 0) + need <= capacity + 1e-9)) return { from: win[0], to: win[win.length - 1], wait: i };
    start = nextWorkdayAfter(start);
  }
  return null;
}

/**
 * Up to three ideas for a ticket, best first: the people who fit it (or the person it's already on) with their
 * first good days. fits = the brain's candidates for this ticket; loads = { personId: load } (memoised by the panel).
 */
export function ideasFor(it, { fits, data, loads, today }) {
  const onIt = it.people?.length ? it.people : null;
  let cands = onIt
    ? onIt.map(p => (fits || []).find(f => f.person === p) || { person: p, score: 0, days: DEFAULT_DAYS[it.board] || 1, reasons: [] })
    : (fits || []).filter(c => data.people?.[c.person]?.role === it.board);   // only people on the team today, in that role
  cands = cands.filter(c => data.people?.[c.person]);
  const top = Math.max(0.0001, ...cands.map(c => c.score || 0));
  const out = [];
  for (const c of cands) {
    const p = data.people[c.person];
    const capacity = perDay(data, p.role);
    const when = whenFor({ person: p, days: c.days || DEFAULT_DAYS[it.board] || 1, load: loads[c.person] || {}, capacity, today });
    if (!when) continue;
    // already overdue: every day is late — the card says so; "ends after the deadline" is only for one still ahead
    const tight = !!(it.deadline && it.deadline >= today && when.to > it.deadline);
    // who fits matters most; sooner breaks ties — and counts as much as fit when it's urgent; missing the deadline costs
    const urgent = !!(it.deadline && it.deadline <= addDays(today, 2));
    const wFit = onIt ? 0 : urgent ? 0.5 : 0.7;
    const rank = wFit * ((c.score || 0) / top) + (1 - wFit) * (1 - Math.min(when.wait, 10) / 10) - (tight ? 0.2 : 0);
    out.push({ ...c, p, ...when, tight, rank, assigned: !!onIt });
  }
  return out.sort((a, b) => b.rank - a.rank).slice(0, 3);
}

/** One reason, in plain words, with names (pure). */
export function reasonText(r, data) {
  if (r.kind === 'req') {
    const who = first(data.requesters?.[r.id]?.name || data.people?.[r.id]?.name) || 'this requester';
    return r.of && r.n / r.of >= 0.4 ? `${who}’s go-to (${r.n} tickets)` : `did ${r.n} of ${who}’s tickets`;
  }
  if (r.kind === 'type') return r.spec >= 0.3 ? `${r.label} is their thing (${r.n})` : `${r.n} × ${r.label}`;
  if (r.kind === 'brand') return `${r.n} ${r.label} ticket${r.n === 1 ? '' : 's'}`;
  if (r.kind === 'product') return `knows ${r.label} (${r.n})`;
  return '';
}

const DAY = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const dayText = (d, today) => (d === today ? 'today' : d === addDays(today, 1) ? 'tomorrow' : DAY.format(new Date(`${d}T12:00:00Z`)));
/** "today" · "Tue 18 Nov" · "Tue 18 Nov → Wed 19 Nov" (pure). */
export function whenText(idea, today) {
  return idea.from === idea.to ? dayText(idea.from, today) : `${dayText(idea.from, today)} → ${dayText(idea.to, today)}`;
}

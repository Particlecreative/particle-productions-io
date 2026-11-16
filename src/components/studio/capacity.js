// Studio capacity — one rule for the Workload, Creative Control and the scheduling ideas (Tomer, 16 Nov 2026):
//   · a designer takes 20 tasks a week, a video editor 10 (Sun–Thu → 4 and 2 a day);
//   · a real TV production (an AI-made TV commercial — not its digital versions, cut-downs, recuts or exports) is the
//     only thing its editor does on those days;
//   · something carried over from an earlier week doesn't count toward a later week.
import { addDays } from './Filters';
import { workdays } from './writes';

export const PER_WEEK = { video: 10, design: 20 };
const WORKDAYS = 5;

export const perWeek = (data, role) => data?.capacity_week?.[role] || PER_WEEK[role] || 10;
export const perDay = (data, role) => perWeek(data, role) / WORKDAYS;

const DIGITAL = /digital|cut ?-?downs?|re-?cuts?|upscale|export|\burl\b|casting|resiz|subtit|translat/i;
const PRODUCTION = /commercial|\bspot\b|remake/i;
/** A real TV production — "Born Bare TV commercial", not "The Hunt Digital Versions" or "30s Cut Down" (pure). */
export const isTvProduction = (it) => it?.division === 'tv' && PRODUCTION.test(it?.name || '') && !DIGITAL.test(it?.name || '');

const weekStartOf = (d) => addDays(d, -new Date(`${d}T12:00:00Z`).getUTCDay());

/**
 * A person's load per day, in tasks: each open task's work spread over its working days; a TV production fills its
 * days by itself (capacityPerDay); a task that started in an earlier week isn't counted in a later one (pure).
 */
export function loadByDay(items, personId, capacityPerDay) {
  const load = {};
  for (const it of items || []) {
    if (!it.open || !it.people?.includes(personId) || !it.timeline?.from || !it.timeline?.to) continue;
    const wd = workdays(it.timeline.from, it.timeline.to);
    const tv = isTvProduction(it);
    for (const d of wd) {
      if (it.timeline.from < weekStartOf(d)) continue;   // carried over from an earlier week
      load[d] = (load[d] || 0) + (tv ? capacityPerDay : 1 / Math.max(1, wd.length));
    }
  }
  return load;
}

/** The days a person has a TV production on (for the "TV" mark on the timeline). */
export function tvDays(items, personId) {
  const out = new Set();
  for (const it of items || []) if (it.open && it.people?.includes(personId) && isTvProduction(it) && it.timeline?.from && it.timeline?.to) workdays(it.timeline.from, it.timeline.to).forEach(d => out.add(d));
  return out;
}

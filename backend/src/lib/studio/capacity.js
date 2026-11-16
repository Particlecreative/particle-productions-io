/**
 * Studio capacity — the server's copy of src/components/studio/capacity.js (keep the two the same; both tested):
 *   · a designer takes 20 tasks a week, a video editor 10 (Sun–Thu → 4 and 2 a day);
 *   · a real TV production (an AI-made commercial — not its digital versions, cut-downs, recuts or exports) is the
 *     only thing its editor does on those days;
 *   · something carried over from an earlier week doesn't count toward a later week.
 */
const W = require('../creative/week');

const PER_WEEK = { video: 10, design: 20 };
const perDay = (capWeek, role) => ((capWeek || PER_WEEK)[role] || PER_WEEK[role] || 10) / 5;

const DIGITAL = /digital|cut ?-?downs?|re-?cuts?|upscale|export|\burl\b|casting|resiz|subtit|translat/i;
const PRODUCTION = /commercial|\bspot\b|remake/i;
const isTvProduction = (it) => it?.division === 'tv' && PRODUCTION.test(it?.name || '') && !DIGITAL.test(it?.name || '');

const isWorkday = (d) => W.dow(d) <= 4;
function workdays(from, to) {
  const out = [];
  if (!from || !to || to < from) return out;
  for (let d = from, i = 0; d <= to && i < 120; d = W.addDays(d, 1), i++) if (isWorkday(d)) out.push(d);
  return out;
}
const nextWorkday = (d) => { let x = d; for (let i = 0; i < 7 && !isWorkday(x); i++) x = W.addDays(x, 1); return x; };
/** The day `n` working days after d (n = 0 → d itself if it's a working day, else the next one). */
function addWorkdays(d, n) {
  let x = nextWorkday(d);
  for (let k = 0; k < n; k++) x = nextWorkday(W.addDays(x, 1));
  return x;
}
const weekStartOf = (d) => W.addDays(d, -W.dow(d));

/** A person's load per day, in tasks (same rule as the browser). skipId = leave that task out. */
function loadByDay(items, personId, capacityPerDay, { skipId = null } = {}) {
  const load = {};
  for (const it of items || []) {
    if (String(it.id) === String(skipId)) continue;
    if (!it.open || !it.people?.includes(String(personId)) || !it.timeline?.from || !it.timeline?.to) continue;
    const wd = workdays(it.timeline.from, it.timeline.to);
    const tv = isTvProduction(it);
    for (const d of wd) {
      if (it.timeline.from < weekStartOf(d)) continue;   // carried over from an earlier week
      load[d] = (load[d] || 0) + (tv ? capacityPerDay : 1 / Math.max(1, wd.length));
    }
  }
  return load;
}

module.exports = { PER_WEEK, perDay, isTvProduction, workdays, nextWorkday, addWorkdays, loadByDay, isWorkday };

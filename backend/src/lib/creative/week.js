/**
 * Israel work-week helpers (pure, no deps).
 * Report week = Sunday 00:00 → next Sunday 00:00, Asia/Jerusalem (Fri/Sat deliveries count).
 * Workload days = Sun–Thu.
 * Monday date-only values ("2026-10-20" / "2026-10-20T00:00:00+00:00") are compared as strings — never shifted.
 */

const TZ = 'Asia/Jerusalem';
const DAY_MS = 86400000;

function pad(n) { return String(n).padStart(2, '0'); }

/** "YYYY-MM-DD" → { y, m, d } */
function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) throw new Error(`Invalid date "${s}" (expected YYYY-MM-DD)`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

function ymd(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }

/** Add days to a YYYY-MM-DD string (calendar arithmetic in UTC, safe for date-only values). */
function addDays(dateStr, n) {
  const { y, m, d } = parseYmd(dateStr);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Day of week (0 = Sunday) of a YYYY-MM-DD string. */
function dow(dateStr) {
  const { y, m, d } = parseYmd(dateStr);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Offset (ms) of `tz` from UTC at instant `ms`. */
function tzOffsetMs(ms, tz = TZ) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms));
  const get = (t) => Number(parts.find(p => p.type === t)?.value);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** UTC instant (ms) of local midnight `dateStr` in `tz`. */
function zonedMidnightUtc(dateStr, tz = TZ) {
  const { y, m, d } = parseYmd(dateStr);
  const naive = Date.UTC(y, m - 1, d);
  let guess = naive - tzOffsetMs(naive, tz);
  // Two refinement passes handle DST transitions around midnight
  for (let i = 0; i < 2; i++) guess = naive - tzOffsetMs(guess, tz);
  return guess;
}

/** Local calendar date (YYYY-MM-DD) of an instant in `tz`. */
function localDate(ms, tz = TZ) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const get = (t) => parts.find(p => p.type === t)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Sunday (YYYY-MM-DD) of the Israel week containing instant `ms`. */
function sundayOf(ms = Date.now(), tz = TZ) {
  const today = localDate(ms, tz);
  return addDays(today, -dow(today));
}

/** Monday date-only value → "YYYY-MM-DD" (or null). */
function dateOnly(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortLabel(dateStr) {
  const { m, d } = parseYmd(dateStr);
  return `${MONTHS[m - 1]} ${d}`;
}

function utcDay(dateStr) {
  const { y, m, d } = parseYmd(dateStr);
  return Date.UTC(y, m - 1, d);
}

/** Days between two YYYY-MM-DD strings (b - a). */
function daysBetween(a, b) {
  return Math.round((utcDay(b) - utcDay(a)) / DAY_MS);
}

/** Week number (Sunday-start weeks; week 1 is the week containing Jan 1). */
function weekNumber(weekStart) {
  const jan1 = `${parseYmd(addDays(weekStart, 6)).y}-01-01`;
  const firstSunday = addDays(jan1, -dow(jan1));
  return Math.floor(daysBetween(firstSunday, weekStart) / 7) + 1;
}

/**
 * Bounds for the Israel week starting `weekStart` (must be a Sunday).
 */
function weekBounds(weekStart, { now = Date.now(), tz = TZ } = {}) {
  parseYmd(weekStart);
  if (dow(weekStart) !== 0) throw new Error(`week_start ${weekStart} is not a Sunday`);
  const end = addDays(weekStart, 7);
  const fromMs = zonedMidnightUtc(weekStart, tz);
  const toMs = zonedMidnightUtc(end, tz);
  const workdays = [0, 1, 2, 3, 4].map(i => addDays(weekStart, i));
  const nextStart = end;
  const nextWorkdays = [0, 1, 2, 3, 4].map(i => addDays(nextStart, i));
  const prevStart = addDays(weekStart, -7);
  return {
    start: weekStart,
    end,                                // exclusive
    lastDay: addDays(weekStart, 6),
    fromMs, toMs,
    fromIso: new Date(fromMs).toISOString(),
    toIso: new Date(toMs).toISOString(),
    workdays,
    next: { start: nextStart, end: addDays(nextStart, 7), workdays: nextWorkdays },
    prev: { start: prevStart },
    label: `${shortLabel(weekStart)} – ${shortLabel(workdays[4])}`,
    number: weekNumber(weekStart),
    year: parseYmd(addDays(weekStart, 6)).y,
    partial: toMs > now,
  };
}

/** Does the date range [from, to] (inclusive YYYY-MM-DD) overlap [a, b] (inclusive)? */
function rangesOverlap(from, to, a, b) {
  if (!from && !to) return false;
  const f = from || to;
  const t = to || from;
  return f <= b && t >= a;
}

module.exports = {
  TZ,
  addDays,
  dow,
  zonedMidnightUtc,
  localDate,
  sundayOf,
  dateOnly,
  weekBounds,
  weekNumber,
  daysBetween,
  rangesOverlap,
  shortLabel,
};

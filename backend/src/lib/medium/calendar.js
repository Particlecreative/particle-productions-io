/**
 * MEDIUM — the sale calendar the team briefs against (US holidays Particle runs sales on). Briefs are due 3–5 weeks
 * before each one (spec §17.1). Pure — backend/test/medium.test.js.
 */
const iso = (d) => d.toISOString().slice(0, 10);
const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));
/** The n-th weekday (0 = Sunday) of a month; n = -1 → the last one. */
function nthWeekday(y, m, weekday, n) {
  if (n > 0) { const first = utc(y, m, 1); return utc(y, m, 1 + ((weekday - first.getUTCDay() + 7) % 7) + (n - 1) * 7); }
  const last = utc(y, m + 1, 0);
  return utc(y, m, last.getUTCDate() - ((last.getUTCDay() - weekday + 7) % 7));
}

function holidaysOf(y) {
  const thanksgiving = nthWeekday(y, 11, 4, 4);
  return [
    { name: "Valentine's Day", date: utc(y, 2, 14) },
    { name: "Mother's Day", date: nthWeekday(y, 5, 0, 2) },
    { name: 'Memorial Day', date: nthWeekday(y, 5, 1, -1) },
    { name: "Father's Day", date: nthWeekday(y, 6, 0, 3) },
    { name: '4th of July', date: utc(y, 7, 4) },
    { name: 'Labor Day', date: nthWeekday(y, 9, 1, 1) },
    { name: 'Black Friday', date: utc(y, 11, thanksgiving.getUTCDate() + 1) },
    { name: 'Christmas', date: utc(y, 12, 25) },
  ];
}

/** The next holidays from `today`: { name, date, brief_from, brief_by, days_to_brief_by }. */
function upcoming(today = new Date(), n = 3) {
  const t = utc(today.getUTCFullYear(), today.getUTCMonth() + 1, today.getUTCDate());
  const all = [...holidaysOf(t.getUTCFullYear()), ...holidaysOf(t.getUTCFullYear() + 1)].filter(h => h.date >= t).sort((a, b) => a.date - b.date).slice(0, n);
  return all.map(h => {
    const from = new Date(h.date.getTime() - 35 * 86400000), by = new Date(h.date.getTime() - 21 * 86400000);
    return { name: `${h.name} ${h.date.getUTCFullYear()}`, date: iso(h.date), brief_from: iso(from), brief_by: iso(by), days_to_brief_by: Math.round((by - t) / 86400000) };
  });
}

module.exports = { holidaysOf, upcoming, nthWeekday };

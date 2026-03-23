/**
 * holidayData.js
 * Static 2026 holiday lists for Israeli and American calendars.
 * Used by GanttTab for informational display in the date header.
 */

// Helper to expand a date range into individual ISO date strings
function expandRange(start, end, name) {
  const days = [];
  const cur = new Date(start + 'T00:00:00');
  const last = new Date(end + 'T00:00:00');
  while (cur <= last) {
    days.push({ date: cur.toISOString().slice(0, 10), name });
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

// ─── Israeli 2026 Holidays ───────────────────────────────────────────────────

export const IL_HOLIDAYS_2026 = [
  // Single-day holidays
  { date: '2026-03-14', name: 'פורים (Purim)' },
  { date: '2026-04-29', name: 'יום הזיכרון (Yom HaZikaron)' },
  { date: '2026-04-30', name: 'יום העצמאות (Yom HaAtzmaut)' },
  { date: '2026-05-22', name: 'שבועות (Shavuot)' },
  { date: '2026-05-23', name: 'שבועות שני (Shavuot II)' },
  { date: '2026-05-26', name: 'ל׳׳ג בעומר (Lag BaOmer)' },
  { date: '2026-08-04', name: 'תשעה באב (Tisha B\'Av)' },
  { date: '2026-09-19', name: 'ראש השנה (Rosh Hashana)' },
  { date: '2026-09-20', name: 'ראש השנה שני (Rosh Hashana II)' },
  { date: '2026-09-28', name: 'יום כיפור (Yom Kippur)' },
  { date: '2026-10-10', name: 'שמיני עצרת (Shmini Atzeret)' },
  { date: '2026-10-11', name: 'שמחת תורה (Simchat Torah)' },
  // Multi-day holidays
  ...expandRange('2026-04-02', '2026-04-09', 'פסח (Pesach)'),
  ...expandRange('2026-10-03', '2026-10-09', 'סוכות (Sukkot)'),
  ...expandRange('2026-12-25', '2026-12-31', 'חנוכה (Chanukah)'),
  { date: '2027-01-01', name: 'חנוכה (Chanukah)' }, // 8th night
];

// ─── American 2026 Holidays ──────────────────────────────────────────────────

export const US_HOLIDAYS_2026 = [
  { date: '2026-01-01', name: "New Year's Day" },
  { date: '2026-01-19', name: 'MLK Day' },
  { date: '2026-02-16', name: "Presidents' Day" },
  { date: '2026-05-25', name: 'Memorial Day' },
  { date: '2026-07-04', name: 'Independence Day' },
  { date: '2026-09-07', name: 'Labor Day' },
  { date: '2026-10-12', name: 'Columbus Day' },
  { date: '2026-11-11', name: 'Veterans Day' },
  { date: '2026-11-26', name: 'Thanksgiving' },
  { date: '2026-12-25', name: 'Christmas' },
];

// ─── Lookup helper ────────────────────────────────────────────────────────────

/**
 * Returns { il: string[], us: string[] } for a given ISO date string.
 * Each array contains holiday names on that date.
 */
export function getHolidaysForDate(dateStr) {
  return {
    il: IL_HOLIDAYS_2026.filter(h => h.date === dateStr).map(h => h.name),
    us: US_HOLIDAYS_2026.filter(h => h.date === dateStr).map(h => h.name),
  };
}

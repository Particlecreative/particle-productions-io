// =============================================
// US + Israeli holidays (2024-2028)
// =============================================

export const US_HOLIDAYS = {
  '2024-01-01': "New Year's Day", '2024-01-15': 'MLK Day', '2024-02-19': "Presidents' Day",
  '2024-05-27': 'Memorial Day', '2024-06-19': 'Juneteenth', '2024-07-04': 'Independence Day',
  '2024-09-02': 'Labor Day', '2024-10-14': 'Columbus Day', '2024-11-11': 'Veterans Day',
  '2024-11-28': 'Thanksgiving', '2024-12-25': 'Christmas',
  '2025-01-01': "New Year's Day", '2025-01-20': 'MLK Day', '2025-02-17': "Presidents' Day",
  '2025-05-26': 'Memorial Day', '2025-06-19': 'Juneteenth', '2025-07-04': 'Independence Day',
  '2025-09-01': 'Labor Day', '2025-10-13': 'Columbus Day', '2025-11-11': 'Veterans Day',
  '2025-11-27': 'Thanksgiving', '2025-12-25': 'Christmas',
  '2026-01-01': "New Year's Day", '2026-01-19': 'MLK Day', '2026-02-16': "Presidents' Day",
  '2026-05-25': 'Memorial Day', '2026-06-19': 'Juneteenth', '2026-07-04': 'Independence Day',
  '2026-09-07': 'Labor Day', '2026-10-12': 'Columbus Day', '2026-11-11': 'Veterans Day',
  '2026-11-26': 'Thanksgiving', '2026-12-25': 'Christmas',
  '2027-01-01': "New Year's Day", '2027-01-18': 'MLK Day', '2027-02-15': "Presidents' Day",
  '2027-05-31': 'Memorial Day', '2027-06-19': 'Juneteenth', '2027-07-04': 'Independence Day',
  '2027-09-06': 'Labor Day', '2027-10-11': 'Columbus Day', '2027-11-11': 'Veterans Day',
  '2027-11-25': 'Thanksgiving', '2027-12-25': 'Christmas',
  '2028-01-01': "New Year's Day", '2028-01-17': 'MLK Day', '2028-02-21': "Presidents' Day",
  '2028-05-29': 'Memorial Day', '2028-06-19': 'Juneteenth', '2028-07-04': 'Independence Day',
  '2028-09-04': 'Labor Day', '2028-10-09': 'Columbus Day', '2028-11-11': 'Veterans Day',
  '2028-11-23': 'Thanksgiving', '2028-12-25': 'Christmas',
};

export const IL_HOLIDAYS = {
  '2024-04-22': 'Pesach', '2024-04-23': 'Pesach II', '2024-04-28': 'Pesach VII',
  '2024-05-14': "Yom Ha'atzmaut", '2024-06-11': 'Shavuot', '2024-06-12': 'Shavuot II',
  '2024-10-02': 'Rosh Hashana', '2024-10-03': 'Rosh Hashana II', '2024-10-11': 'Yom Kippur',
  '2024-10-16': 'Sukkot', '2024-10-23': 'Simchat Torah', '2024-12-25': 'Hanukkah Start',
  '2025-04-12': 'Pesach', '2025-04-13': 'Pesach II', '2025-04-18': 'Pesach VII',
  '2025-05-01': "Yom Ha'atzmaut", '2025-06-01': 'Shavuot', '2025-06-02': 'Shavuot II',
  '2025-09-22': 'Rosh Hashana', '2025-09-23': 'Rosh Hashana II', '2025-10-01': 'Yom Kippur',
  '2025-10-06': 'Sukkot', '2025-10-13': 'Simchat Torah', '2025-12-14': 'Hanukkah Start',
  '2026-04-01': 'Pesach', '2026-04-02': 'Pesach II', '2026-04-07': 'Pesach VII',
  '2026-04-22': "Yom Ha'atzmaut", '2026-05-21': 'Shavuot', '2026-05-22': 'Shavuot II',
  '2026-09-11': 'Rosh Hashana', '2026-09-12': 'Rosh Hashana II', '2026-09-20': 'Yom Kippur',
  '2026-09-25': 'Sukkot', '2026-10-02': 'Simchat Torah', '2026-12-04': 'Hanukkah Start',
  '2027-03-22': 'Pesach', '2027-03-23': 'Pesach II', '2027-03-28': 'Pesach VII',
  '2027-04-12': "Yom Ha'atzmaut", '2027-05-11': 'Shavuot', '2027-05-12': 'Shavuot II',
  '2027-10-01': 'Rosh Hashana', '2027-10-02': 'Rosh Hashana II', '2027-10-10': 'Yom Kippur',
  '2027-10-15': 'Sukkot', '2027-10-22': 'Simchat Torah', '2027-11-24': 'Hanukkah Start',
  '2028-04-10': 'Pesach', '2028-04-11': 'Pesach II', '2028-04-16': 'Pesach VII',
  '2028-05-01': "Yom Ha'atzmaut", '2028-05-29': 'Shavuot', '2028-05-30': 'Shavuot II',
  '2028-09-20': 'Rosh Hashana', '2028-09-21': 'Rosh Hashana II', '2028-09-29': 'Yom Kippur',
  '2028-10-04': 'Sukkot', '2028-10-11': 'Simchat Torah', '2028-12-12': 'Hanukkah Start',
};

export function getHoliday(dateStr, showUS = true, showIL = true) {
  const holidays = [];
  if (showUS && US_HOLIDAYS[dateStr]) holidays.push({ flag: '🇺🇸', name: US_HOLIDAYS[dateStr] });
  if (showIL && IL_HOLIDAYS[dateStr]) holidays.push({ flag: '🇮🇱', name: IL_HOLIDAYS[dateStr] });
  return holidays;
}

// =============================================
// US + Israeli holidays (2024-2028)
// Each entry: { date, name, nameHe, country }
// =============================================

const ALL_HOLIDAYS = [
  // ─── 2024 US ──────────────────────────────────────────────────────────────────
  { date: '2024-01-01', name: "New Year's Day",  nameHe: "ראש השנה האזרחית", country: 'US' },
  { date: '2024-01-15', name: 'MLK Day',         nameHe: "יום מרטין לותר קינג", country: 'US' },
  { date: '2024-02-19', name: "Presidents' Day", nameHe: "יום הנשיאים", country: 'US' },
  { date: '2024-05-27', name: 'Memorial Day',    nameHe: "יום הזיכרון (ארה\"ב)", country: 'US' },
  { date: '2024-07-04', name: 'Independence Day',nameHe: "יום העצמאות (ארה\"ב)", country: 'US' },
  { date: '2024-09-02', name: 'Labor Day',       nameHe: "יום העבודה", country: 'US' },
  { date: '2024-10-14', name: 'Columbus Day',    nameHe: "יום קולומבוס", country: 'US' },
  { date: '2024-11-11', name: 'Veterans Day',    nameHe: "יום הוותיקים", country: 'US' },
  { date: '2024-11-28', name: 'Thanksgiving',    nameHe: "חג ההודיה", country: 'US' },
  { date: '2024-12-25', name: 'Christmas',       nameHe: "חג המולד", country: 'US' },

  // ─── 2024 IL ──────────────────────────────────────────────────────────────────
  { date: '2024-03-24', name: 'Purim',           nameHe: "פורים", country: 'IL' },
  { date: '2024-04-22', name: 'Passover',        nameHe: "פסח", country: 'IL' },
  { date: '2024-04-23', name: 'Passover',        nameHe: "פסח", country: 'IL' },
  { date: '2024-04-24', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2024-04-25', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2024-04-26', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2024-04-27', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2024-04-28', name: 'Passover',        nameHe: "פסח שביעי", country: 'IL' },
  { date: '2024-05-06', name: 'Yom HaShoah',     nameHe: "יום השואה", country: 'IL' },
  { date: '2024-05-13', name: 'Yom HaZikaron',   nameHe: "יום הזיכרון", country: 'IL' },
  { date: '2024-05-14', name: 'Yom HaAtzmaut',   nameHe: "יום העצמאות", country: 'IL' },
  { date: '2024-05-26', name: 'Lag BaOmer',      nameHe: "ל\"ג בעומר", country: 'IL' },
  { date: '2024-06-11', name: 'Shavuot',         nameHe: "שבועות", country: 'IL' },
  { date: '2024-06-12', name: 'Shavuot',         nameHe: "שבועות שני", country: 'IL' },
  { date: '2024-10-02', name: 'Rosh Hashana',    nameHe: "ראש השנה", country: 'IL' },
  { date: '2024-10-03', name: 'Rosh Hashana',    nameHe: "ראש השנה שני", country: 'IL' },
  { date: '2024-10-11', name: 'Yom Kippur',      nameHe: "יום כיפור", country: 'IL' },
  { date: '2024-10-16', name: 'Sukkot',          nameHe: "סוכות", country: 'IL' },
  { date: '2024-10-17', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2024-10-18', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2024-10-19', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2024-10-20', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2024-10-21', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2024-10-22', name: 'Sukkot',          nameHe: "הושענא רבה", country: 'IL' },
  { date: '2024-10-23', name: 'Simchat Torah',   nameHe: "שמחת תורה", country: 'IL' },
  { date: '2024-12-25', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2024-12-26', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2024-12-27', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2024-12-28', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2024-12-29', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2024-12-30', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2024-12-31', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },

  // ─── 2025 US ──────────────────────────────────────────────────────────────────
  { date: '2025-01-01', name: "New Year's Day",  nameHe: "ראש השנה האזרחית", country: 'US' },
  { date: '2025-01-20', name: 'MLK Day',         nameHe: "יום מרטין לותר קינג", country: 'US' },
  { date: '2025-02-17', name: "Presidents' Day", nameHe: "יום הנשיאים", country: 'US' },
  { date: '2025-05-26', name: 'Memorial Day',    nameHe: "יום הזיכרון (ארה\"ב)", country: 'US' },
  { date: '2025-07-04', name: 'Independence Day',nameHe: "יום העצמאות (ארה\"ב)", country: 'US' },
  { date: '2025-09-01', name: 'Labor Day',       nameHe: "יום העבודה", country: 'US' },
  { date: '2025-10-13', name: 'Columbus Day',    nameHe: "יום קולומבוס", country: 'US' },
  { date: '2025-11-11', name: 'Veterans Day',    nameHe: "יום הוותיקים", country: 'US' },
  { date: '2025-11-27', name: 'Thanksgiving',    nameHe: "חג ההודיה", country: 'US' },
  { date: '2025-12-25', name: 'Christmas',       nameHe: "חג המולד", country: 'US' },

  // ─── 2025 IL ──────────────────────────────────────────────────────────────────
  { date: '2025-03-14', name: 'Purim',           nameHe: "פורים", country: 'IL' },
  { date: '2025-04-12', name: 'Passover',        nameHe: "פסח", country: 'IL' },
  { date: '2025-04-13', name: 'Passover',        nameHe: "פסח", country: 'IL' },
  { date: '2025-04-14', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2025-04-15', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2025-04-16', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2025-04-17', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2025-04-18', name: 'Passover',        nameHe: "פסח שביעי", country: 'IL' },
  { date: '2025-04-24', name: 'Yom HaShoah',     nameHe: "יום השואה", country: 'IL' },
  { date: '2025-05-01', name: 'Yom HaZikaron',   nameHe: "יום הזיכרון", country: 'IL' },
  { date: '2025-05-02', name: 'Yom HaAtzmaut',   nameHe: "יום העצמאות", country: 'IL' },
  { date: '2025-05-16', name: 'Lag BaOmer',      nameHe: "ל\"ג בעומר", country: 'IL' },
  { date: '2025-06-01', name: 'Shavuot',         nameHe: "שבועות", country: 'IL' },
  { date: '2025-06-02', name: 'Shavuot',         nameHe: "שבועות שני", country: 'IL' },
  { date: '2025-09-22', name: 'Rosh Hashana',    nameHe: "ראש השנה", country: 'IL' },
  { date: '2025-09-23', name: 'Rosh Hashana',    nameHe: "ראש השנה שני", country: 'IL' },
  { date: '2025-10-01', name: 'Yom Kippur',      nameHe: "יום כיפור", country: 'IL' },
  { date: '2025-10-06', name: 'Sukkot',          nameHe: "סוכות", country: 'IL' },
  { date: '2025-10-07', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2025-10-08', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2025-10-09', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2025-10-10', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2025-10-11', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2025-10-12', name: 'Sukkot',          nameHe: "הושענא רבה", country: 'IL' },
  { date: '2025-10-13', name: 'Simchat Torah',   nameHe: "שמחת תורה", country: 'IL' },
  { date: '2025-12-14', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2025-12-15', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2025-12-16', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2025-12-17', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2025-12-18', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2025-12-19', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2025-12-20', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2025-12-21', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },

  // ─── 2026 US ──────────────────────────────────────────────────────────────────
  { date: '2026-01-01', name: "New Year's Day",  nameHe: "ראש השנה האזרחית", country: 'US' },
  { date: '2026-01-19', name: 'MLK Day',         nameHe: "יום מרטין לותר קינג", country: 'US' },
  { date: '2026-02-16', name: "Presidents' Day", nameHe: "יום הנשיאים", country: 'US' },
  { date: '2026-05-25', name: 'Memorial Day',    nameHe: "יום הזיכרון (ארה\"ב)", country: 'US' },
  { date: '2026-07-04', name: 'Independence Day',nameHe: "יום העצמאות (ארה\"ב)", country: 'US' },
  { date: '2026-09-07', name: 'Labor Day',       nameHe: "יום העבודה", country: 'US' },
  { date: '2026-10-12', name: 'Columbus Day',    nameHe: "יום קולומבוס", country: 'US' },
  { date: '2026-11-11', name: 'Veterans Day',    nameHe: "יום הוותיקים", country: 'US' },
  { date: '2026-11-26', name: 'Thanksgiving',    nameHe: "חג ההודיה", country: 'US' },
  { date: '2026-12-25', name: 'Christmas',       nameHe: "חג המולד", country: 'US' },

  // ─── 2026 IL ──────────────────────────────────────────────────────────────────
  { date: '2026-03-17', name: 'Purim',           nameHe: "פורים", country: 'IL' },
  { date: '2026-04-02', name: 'Passover',        nameHe: "פסח", country: 'IL' },
  { date: '2026-04-03', name: 'Passover',        nameHe: "פסח", country: 'IL' },
  { date: '2026-04-04', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2026-04-05', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2026-04-06', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2026-04-07', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2026-04-08', name: 'Passover',        nameHe: "פסח שביעי", country: 'IL' },
  { date: '2026-04-14', name: 'Yom HaShoah',     nameHe: "יום השואה", country: 'IL' },
  { date: '2026-04-21', name: 'Yom HaZikaron',   nameHe: "יום הזיכרון", country: 'IL' },
  { date: '2026-04-22', name: 'Yom HaAtzmaut',   nameHe: "יום העצמאות", country: 'IL' },
  { date: '2026-05-19', name: 'Lag BaOmer',      nameHe: "ל\"ג בעומר", country: 'IL' },
  { date: '2026-05-22', name: 'Shavuot',         nameHe: "שבועות", country: 'IL' },
  { date: '2026-09-12', name: 'Rosh Hashana',    nameHe: "ראש השנה", country: 'IL' },
  { date: '2026-09-13', name: 'Rosh Hashana',    nameHe: "ראש השנה שני", country: 'IL' },
  { date: '2026-09-21', name: 'Yom Kippur',      nameHe: "יום כיפור", country: 'IL' },
  { date: '2026-09-26', name: 'Sukkot',          nameHe: "סוכות", country: 'IL' },
  { date: '2026-09-27', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2026-09-28', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2026-09-29', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2026-09-30', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2026-10-01', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2026-10-02', name: 'Sukkot',          nameHe: "הושענא רבה", country: 'IL' },
  { date: '2026-10-03', name: 'Simchat Torah',   nameHe: "שמחת תורה", country: 'IL' },
  { date: '2026-12-05', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2026-12-06', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2026-12-07', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2026-12-08', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2026-12-09', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2026-12-10', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2026-12-11', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2026-12-12', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },

  // ─── 2027 US ──────────────────────────────────────────────────────────────────
  { date: '2027-01-01', name: "New Year's Day",  nameHe: "ראש השנה האזרחית", country: 'US' },
  { date: '2027-01-18', name: 'MLK Day',         nameHe: "יום מרטין לותר קינג", country: 'US' },
  { date: '2027-02-15', name: "Presidents' Day", nameHe: "יום הנשיאים", country: 'US' },
  { date: '2027-05-31', name: 'Memorial Day',    nameHe: "יום הזיכרון (ארה\"ב)", country: 'US' },
  { date: '2027-07-04', name: 'Independence Day',nameHe: "יום העצמאות (ארה\"ב)", country: 'US' },
  { date: '2027-09-06', name: 'Labor Day',       nameHe: "יום העבודה", country: 'US' },
  { date: '2027-10-11', name: 'Columbus Day',    nameHe: "יום קולומבוס", country: 'US' },
  { date: '2027-11-11', name: 'Veterans Day',    nameHe: "יום הוותיקים", country: 'US' },
  { date: '2027-11-25', name: 'Thanksgiving',    nameHe: "חג ההודיה", country: 'US' },
  { date: '2027-12-25', name: 'Christmas',       nameHe: "חג המולד", country: 'US' },

  // ─── 2027 IL ──────────────────────────────────────────────────────────────────
  { date: '2027-03-04', name: 'Purim',           nameHe: "פורים", country: 'IL' },
  { date: '2027-03-22', name: 'Passover',        nameHe: "פסח", country: 'IL' },
  { date: '2027-03-23', name: 'Passover',        nameHe: "פסח", country: 'IL' },
  { date: '2027-03-24', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2027-03-25', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2027-03-26', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2027-03-27', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2027-03-28', name: 'Passover',        nameHe: "פסח שביעי", country: 'IL' },
  { date: '2027-04-08', name: 'Yom HaShoah',     nameHe: "יום השואה", country: 'IL' },
  { date: '2027-04-15', name: 'Yom HaZikaron',   nameHe: "יום הזיכרון", country: 'IL' },
  { date: '2027-04-16', name: 'Yom HaAtzmaut',   nameHe: "יום העצמאות", country: 'IL' },
  { date: '2027-05-09', name: 'Lag BaOmer',      nameHe: "ל\"ג בעומר", country: 'IL' },
  { date: '2027-05-11', name: 'Shavuot',         nameHe: "שבועות", country: 'IL' },
  { date: '2027-05-12', name: 'Shavuot',         nameHe: "שבועות שני", country: 'IL' },
  { date: '2027-10-02', name: 'Rosh Hashana',    nameHe: "ראש השנה", country: 'IL' },
  { date: '2027-10-03', name: 'Rosh Hashana',    nameHe: "ראש השנה שני", country: 'IL' },
  { date: '2027-10-11', name: 'Yom Kippur',      nameHe: "יום כיפור", country: 'IL' },
  { date: '2027-10-16', name: 'Sukkot',          nameHe: "סוכות", country: 'IL' },
  { date: '2027-10-17', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2027-10-18', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2027-10-19', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2027-10-20', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2027-10-21', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2027-10-22', name: 'Sukkot',          nameHe: "הושענא רבה", country: 'IL' },
  { date: '2027-10-23', name: 'Simchat Torah',   nameHe: "שמחת תורה", country: 'IL' },
  { date: '2027-11-28', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2027-11-29', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2027-11-30', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2027-12-01', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2027-12-02', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2027-12-03', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2027-12-04', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2027-12-05', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },

  // ─── 2028 US ──────────────────────────────────────────────────────────────────
  { date: '2028-01-01', name: "New Year's Day",  nameHe: "ראש השנה האזרחית", country: 'US' },
  { date: '2028-01-17', name: 'MLK Day',         nameHe: "יום מרטין לותר קינג", country: 'US' },
  { date: '2028-02-21', name: "Presidents' Day", nameHe: "יום הנשיאים", country: 'US' },
  { date: '2028-05-29', name: 'Memorial Day',    nameHe: "יום הזיכרון (ארה\"ב)", country: 'US' },
  { date: '2028-07-04', name: 'Independence Day',nameHe: "יום העצמאות (ארה\"ב)", country: 'US' },
  { date: '2028-09-04', name: 'Labor Day',       nameHe: "יום העבודה", country: 'US' },
  { date: '2028-10-09', name: 'Columbus Day',    nameHe: "יום קולומבוס", country: 'US' },
  { date: '2028-11-11', name: 'Veterans Day',    nameHe: "יום הוותיקים", country: 'US' },
  { date: '2028-11-23', name: 'Thanksgiving',    nameHe: "חג ההודיה", country: 'US' },
  { date: '2028-12-25', name: 'Christmas',       nameHe: "חג המולד", country: 'US' },

  // ─── 2028 IL ──────────────────────────────────────────────────────────────────
  { date: '2028-03-23', name: 'Purim',           nameHe: "פורים", country: 'IL' },
  { date: '2028-04-10', name: 'Passover',        nameHe: "פסח", country: 'IL' },
  { date: '2028-04-11', name: 'Passover',        nameHe: "פסח", country: 'IL' },
  { date: '2028-04-12', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2028-04-13', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2028-04-14', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2028-04-15', name: 'Passover',        nameHe: "פסח (חול המועד)", country: 'IL' },
  { date: '2028-04-16', name: 'Passover',        nameHe: "פסח שביעי", country: 'IL' },
  { date: '2028-04-27', name: 'Yom HaShoah',     nameHe: "יום השואה", country: 'IL' },
  { date: '2028-05-04', name: 'Yom HaZikaron',   nameHe: "יום הזיכרון", country: 'IL' },
  { date: '2028-05-05', name: 'Yom HaAtzmaut',   nameHe: "יום העצמאות", country: 'IL' },
  { date: '2028-05-28', name: 'Lag BaOmer',      nameHe: "ל\"ג בעומר", country: 'IL' },
  { date: '2028-05-30', name: 'Shavuot',         nameHe: "שבועות", country: 'IL' },
  { date: '2028-05-31', name: 'Shavuot',         nameHe: "שבועות שני", country: 'IL' },
  { date: '2028-09-20', name: 'Rosh Hashana',    nameHe: "ראש השנה", country: 'IL' },
  { date: '2028-09-21', name: 'Rosh Hashana',    nameHe: "ראש השנה שני", country: 'IL' },
  { date: '2028-09-29', name: 'Yom Kippur',      nameHe: "יום כיפור", country: 'IL' },
  { date: '2028-10-04', name: 'Sukkot',          nameHe: "סוכות", country: 'IL' },
  { date: '2028-10-05', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2028-10-06', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2028-10-07', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2028-10-08', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2028-10-09', name: 'Sukkot',          nameHe: "סוכות (חול המועד)", country: 'IL' },
  { date: '2028-10-10', name: 'Sukkot',          nameHe: "הושענא רבה", country: 'IL' },
  { date: '2028-10-11', name: 'Simchat Torah',   nameHe: "שמחת תורה", country: 'IL' },
  { date: '2028-12-12', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2028-12-13', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2028-12-14', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2028-12-15', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2028-12-16', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2028-12-17', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2028-12-18', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
  { date: '2028-12-19', name: 'Hanukkah',        nameHe: "חנוכה", country: 'IL' },
];

// Build a fast lookup map: dateStr -> array of holidays
const _holidayMap = {};
ALL_HOLIDAYS.forEach(h => {
  if (!_holidayMap[h.date]) _holidayMap[h.date] = [];
  _holidayMap[h.date].push(h);
});

/**
 * Get holidays for a given date string (YYYY-MM-DD).
 * Optionally filter by country flags.
 * Returns array of { date, name, nameHe, country }.
 */
export function getHoliday(dateStr, showUS = true, showIL = true) {
  const all = _holidayMap[dateStr] || [];
  return all.filter(h =>
    (showUS && h.country === 'US') || (showIL && h.country === 'IL')
  );
}

/**
 * Legacy compat — returns [{ flag, name }]
 */
export function getHolidayFlags(dateStr, showUS = true, showIL = true) {
  return getHoliday(dateStr, showUS, showIL).map(h => ({
    flag: h.country === 'US' ? '\u{1F1FA}\u{1F1F8}' : '\u{1F1EE}\u{1F1F1}',
    name: h.name,
  }));
}

export { ALL_HOLIDAYS };

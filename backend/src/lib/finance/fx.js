/**
 * Bank of Israel representative rates (₪ per $), stored in fx_rates and kept in memory.
 * rateOn(date) = the last published rate on or before that date (weekends/holidays use the previous day).
 */
const db = require('../../db');
const { DEFAULT_RATE, ymdOf } = require('./budget');
const W = require('../creative/week');

const SDMX = 'https://edge.boi.gov.il/FusionEdgeServer/sdmx/v2/data/dataflow/BOI.STATISTICS/EXR/1.0/RER_USD_ILS';
const FIRST_DATE = '2025-01-01';

let rates = []; // [[date, rate]] ascending
let loadedAt = 0;

function setRates(list) {
  rates = list.map(([d, r]) => [d, Number(r)]).filter(([d, r]) => d && r > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  loadedAt = Date.now();
}

async function load() {
  const { rows } = await db.query('SELECT rate_date::text AS d, usd_ils AS r FROM fx_rates ORDER BY rate_date');
  setRates(rows.map(x => [x.d, x.r]));
  return rates.length;
}

/** ₪ per $ on a date (YYYY-MM-DD or Date); latest when omitted. */
function rateOn(date) {
  if (!rates.length) return DEFAULT_RATE;
  const d = ymdOf(date) || W.localDate(Date.now());
  if (d < rates[0][0]) return rates[0][1];
  let lo = 0, hi = rates.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (rates[mid][0] <= d) lo = mid; else hi = mid - 1;
  }
  return rates[lo][1];
}

/** { rate, date } of the latest published rate. */
function latest() {
  if (!rates.length) return { rate: DEFAULT_RATE, date: null, fallback: true };
  const [date, rate] = rates[rates.length - 1];
  return { rate, date };
}

/** The rate that applies on a date, with the date it was published. */
function quote(date) {
  if (!rates.length) return { rate: DEFAULT_RATE, date: null, fallback: true };
  const d = ymdOf(date) || W.localDate(Date.now());
  let hit = rates[0];
  for (const x of rates) { if (x[0] <= d) hit = x; else break; }
  return { rate: hit[1], date: hit[0] };
}

/** Pull new rates from the Bank of Israel (CSV) and store them. */
async function refresh({ from } = {}) {
  const today = W.localDate(Date.now());
  const last = rates.length ? rates[rates.length - 1][0] : null;
  const start = from || (last ? W.addDays(last, 1) : FIRST_DATE);
  if (start > today) return { added: 0 };
  const url = `${SDMX}?c%5BDATA_TYPE%5D=OF00&startperiod=${start}&endperiod=${today}&format=csv`;
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (res.status === 404) return { added: 0 }; // nothing published in that range yet
  if (!res.ok) throw new Error(`Bank of Israel rates: HTTP ${res.status}`);
  const text = await res.text();
  const lines = text.trim().split(/\r?\n/);
  const head = (lines.shift() || '').split(',');
  const iDate = head.indexOf('TIME_PERIOD'), iVal = head.indexOf('OBS_VALUE');
  if (iDate < 0 || iVal < 0) throw new Error('Bank of Israel rates: unexpected CSV');
  let added = 0;
  for (const line of lines) {
    const cols = line.split(',');
    const d = cols[iDate], v = parseFloat(cols[iVal]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !(v > 0)) continue;
    const r = await db.query(
      `INSERT INTO fx_rates (rate_date, usd_ils) VALUES ($1, $2)
       ON CONFLICT (rate_date) DO UPDATE SET usd_ils = EXCLUDED.usd_ils, fetched_at = NOW()
       WHERE fx_rates.usd_ils IS DISTINCT FROM EXCLUDED.usd_ils RETURNING 1`, [d, v]);
    added += r.rowCount;
  }
  await load();
  return { added };
}

/** Load on boot; fetch history the first time. Never throws. */
async function init() {
  try {
    await load();
    await refresh();
  } catch (e) {
    console.error('[fx] Bank of Israel rates unavailable:', e.message, rates.length ? `(using ${rates.length} stored rates)` : `(using ${DEFAULT_RATE})`);
  }
}

module.exports = { init, load, refresh, rateOn, latest, quote, setRates, get loadedAt() { return loadedAt; } };

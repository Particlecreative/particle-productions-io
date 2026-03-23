// =============================================
// CURRENCY SERVICE — live USD→ILS rates
// =============================================

let cachedRate = null;
let cacheTimestamp = null;
const CACHE_TTL_MS = 3600000; // 1 hour

export async function fetchExchangeRate() {
  const now = Date.now();
  if (cachedRate && cacheTimestamp && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedRate;
  }
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    const data = await res.json();
    if (data.result === 'success') {
      cachedRate = data.rates.ILS;
      cacheTimestamp = now;
      sessionStorage.setItem('cp_usd_ils_rate', String(cachedRate));
      sessionStorage.setItem('cp_rate_ts', String(cacheTimestamp));
      return cachedRate;
    }
  } catch (e) {
    console.warn('Currency fetch failed, using fallback:', e);
  }
  // Fallback from sessionStorage or default
  const stored = sessionStorage.getItem('cp_usd_ils_rate');
  return stored ? parseFloat(stored) : 3.7;
}

export function getStoredRate() {
  const stored = sessionStorage.getItem('cp_usd_ils_rate');
  return stored ? parseFloat(stored) : 3.7;
}

export function formatCurrency(amount, currency = 'USD', rate = 3.7) {
  if (amount == null || amount === '') return '—';
  const num = parseFloat(amount);
  if (isNaN(num)) return '—';
  if (currency === 'ILS') {
    const ils = num * rate;
    return `₪${ils.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function toILS(usdAmount, rate = 3.7) {
  return usdAmount * rate;
}

export function toUSD(ilsAmount, rate = 3.7) {
  return ilsAmount / rate;
}

// Fetch historical USD→ILS rate from Bank of Israel for a given date (YYYY-MM-DD)
export async function fetchHistoricalRate(dateStr) {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return null;
  const url = `https://boi.org.il/PublicApi/GetExchangeRates?asOfDate=${d}/${m}/${y}&curr=01`;
  try {
    const r = await fetch(url);
    const json = await r.json();
    const val = json?.[0]?.currentExchangeRate;
    return val ? parseFloat(val) : null;
  } catch { return null; }
}

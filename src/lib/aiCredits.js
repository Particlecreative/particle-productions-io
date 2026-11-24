// AI credits on a budget line (Tomer, 24 Nov 2026): "when going to a line of Higgsfield / AI credits, give me the option
// to write how many credits and calculate it yourself." Same rules as the server (backend/src/lib/finance/autoRules.js
// isAiCredits, backend/src/lib/finance/aiCredits.js) — keep them in step; backend/test/financeAiCredits.test.js checks both.

export const DEFAULT_PRICE = 0.065;
const AI_RE = /\bai\s*(?:credits?|tools?|platform)\b|higgsfield/i;

/** An AI-credits / Higgsfield line (by its item, supplier name or supplier). */
export function isAiCredits(line) {
  return AI_RE.test([line?.item, line?.full_name, line?.supplier].filter(Boolean).join(' '));
}

/** Credits saved on the line (custom_fields.custom_ai_credits), or null. */
export function creditsOf(line) {
  let cf = line?.custom_fields || {};
  if (typeof cf === 'string') { try { cf = JSON.parse(cf); } catch { cf = {}; } }
  const v = cf.custom_ai_credits ?? cf.ai_credits;
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/** credits → { usd, amount } — amount in the line's currency (ILS = usd × rate). */
export function creditCost(credits, { price = DEFAULT_PRICE, currency = 'USD', rate = 3.7 } = {}) {
  const usd = round2(Math.max(0, Number(credits) || 0) * price);
  return { usd, amount: String(currency).toUpperCase() === 'ILS' ? round2(usd * rate) : usd };
}

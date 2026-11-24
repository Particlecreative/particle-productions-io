/**
 * AI credits before Wrap-up (Tomer, 24 Nov 2026): "before a production moves to Wrap-up, if it has Higgsfield / AI
 * credits in the budget lines, ask me how many credits it spent. Our price is $0.065 per credit — do the calculation."
 *
 * The answer goes on each AI line: actual = credits × price (in the line's currency at today's rate), and the credits
 * are kept in custom_fields.custom_ai_credits so the question isn't asked again. Pure — the route writes through the finance service.
 */
const AUTO = require('./autoRules');
const B = require('./budget');

const DEFAULT_PRICE = 0.065;
const round2 = (n) => Math.round(Number(n) * 100) / 100;
// Saved through the finance service as a custom field: custom_fields.custom_ai_credits
const creditsOf = (l) => { const cf = l?.custom_fields || {}; const v = cf.custom_ai_credits ?? cf.ai_credits; return v === null || v === undefined || v === '' ? null : Number(v); };
const credited = (l) => Number.isFinite(creditsOf(l));

const aiLines = (lines) => (lines || []).filter(l => AUTO.isAiCredits(l));
/** AI lines whose credits haven't been entered yet */
const pending = (lines) => aiLines(lines).filter(l => !credited(l));

/** credits → { usd, amount } (amount in the line's currency) */
function costOf(credits, { price = DEFAULT_PRICE, currency = 'USD', rate = 3.7 } = {}) {
  const usd = round2(Math.max(0, Number(credits) || 0) * price);
  return { usd, amount: String(currency).toUpperCase() === 'ILS' ? round2(usd * rate) : usd };
}

/** The question for the browser (409 code "ai_credits"). */
function prompt({ prod, lines, to, price = DEFAULT_PRICE, rate }) {
  const ask = aiLines(lines);
  return {
    code: 'ai_credits',
    error: `${prod.project_name} has AI credits in its budget — how many credits did it use?`,
    production_id: prod.id, production: prod.project_name, stage: to, price, rate,
    lines: ask.map(l => ({
      id: l.id, label: String(l.item || '').trim(), supplier: String(l.full_name || l.supplier || '').trim(),
      planned: B.num(l.planned_budget), actual: B.num(l.actual_spent), currency: String(l.currency_code || 'USD').toUpperCase() === 'ILS' ? 'ILS' : 'USD',
      credits: credited(l) ? creditsOf(l) : null, done: credited(l),
    })),
  };
}

/** The browser's answer → { [lineId]: credits } for this production's AI lines only (whole, non-negative numbers). */
function parseAnswer(answer, lines) {
  const ids = new Set(aiLines(lines).map(l => String(l.id)));
  const out = {};
  for (const [id, v] of Object.entries(answer || {})) {
    if (!ids.has(String(id))) continue;
    const n = Math.round(Number(String(v).replace(/[,\s]/g, '')));
    if (Number.isFinite(n) && n >= 0 && n < 1e9) out[id] = n;
  }
  return out;
}

/** Line updates for the finance service. */
function updatesFor(credits, lines, { price = DEFAULT_PRICE, rate } = {}) {
  const byId = new Map((lines || []).map(l => [String(l.id), l]));
  return Object.entries(credits).map(([id, n]) => {
    const l = byId.get(String(id));
    const { amount } = costOf(n, { price, currency: l?.currency_code, rate });
    return { op: 'update', id, values: { actual_spent: amount, custom_ai_credits: n, custom_ai_credit_price: price } };
  });
}

module.exports = { DEFAULT_PRICE, aiLines, pending, costOf, prompt, parseAnswer, updatesFor, credited, creditsOf };

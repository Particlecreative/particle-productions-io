/**
 * Claude design QC — frame renders (images) + the exact text layers, structured JSON out.
 * Same call shape CP's Creative Weekly narrative uses in production (beta stream + output_config json_schema).
 */
const { getAnthropic } = require('../../anthropic');

// USD per 1M tokens — ESTIMATES for the cost column; check Anthropic's pricing page and adjust in Settings → prices.
const DEFAULT_PRICES = {
  'claude-sonnet-5-5': { in: 3, out: 15 },
  'claude-opus-5-5': { in: 5, out: 25 },
  'claude-haiku-5-5': { in: 1, out: 5 },
};

const ISSUE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['issues'],
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['node_id', 'frame_id', 'found', 'fix', 'type', 'severity', 'note'],
        properties: {
          node_id: { type: 'string' },
          frame_id: { type: 'string' },
          found: { type: 'string' },
          fix: { type: 'string' },
          type: { type: 'string', enum: ['spelling', 'wrong_word', 'inconsistent', 'brand_name', 'placeholder', 'overflow', 'size_mismatch', 'baked_text', 'script_mismatch'] },
          severity: { type: 'string', enum: ['must_fix', 'check'] },
          note: { type: 'string' },
        },
      },
    },
  },
};

const configured = () => !!process.env.ANTHROPIC_API_KEY;

/**
 * images: [{ label, mime, data (base64) }] — one per frame, in the same order as the layer list.
 * Returns { issues, model, usage, ms, cost_usd }.
 */
async function checkDesign({ images, prompt, model = 'claude-sonnet-5-5', prices = {} }) {
  const client = getAnthropic();
  const t0 = Date.now();
  const content = [];
  for (const img of images) {
    content.push({ type: 'text', text: img.label });
    content.push({ type: 'image', source: { type: 'base64', media_type: img.mime || 'image/jpeg', data: img.data } });
  }
  content.push({ type: 'text', text: prompt });

  const req = {
    model,
    max_tokens: 16000,
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: ISSUE_SCHEMA } },
    messages: [{ role: 'user', content }],
  };
  let msg;
  try {
    msg = await client.beta.messages.stream({ ...req, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }).finalMessage();
  } catch (e) {
    if (e?.status !== 400) throw e;
    msg = await client.beta.messages.stream(req).finalMessage();   // model without fallback support
  }
  if (msg.stop_reason === 'refusal') throw new Error('Claude declined to check this design');
  if (msg.stop_reason === 'max_tokens') throw new Error('The design check was cut off — try again');
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('Claude returned an unreadable answer'); }
  const u = msg.usage || {};
  const p = prices[model] || DEFAULT_PRICES[model] || DEFAULT_PRICES['claude-sonnet-5-5'];
  const inTok = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  const cost = (inTok * p.in + (u.output_tokens || 0) * p.out) / 1e6;
  return { issues: Array.isArray(json.issues) ? json.issues : [], model: msg.model || model, usage: u, ms: Date.now() - t0, cost_usd: Number(cost.toFixed(5)) };
}

module.exports = { configured, checkDesign, DEFAULT_PRICES, ISSUE_SCHEMA };

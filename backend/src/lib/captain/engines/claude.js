/**
 * Claude design QC — frame renders (images) + the exact text layers, structured JSON out.
 * Same call shape CP's Creative Weekly narrative uses in production (beta stream + output_config json_schema).
 */
const { getAnthropic } = require('../../anthropic');

// USD per 1M tokens (Anthropic list prices, Nov 2026) for the cost column; override in Settings → prices.
const DEFAULT_PRICES = {
  'claude-sonnet-5-5': { in: 2, out: 10 },
  'claude-opus-5-5': { in: 4, out: 20 },
  'claude-haiku-5-5': { in: 0.1, out: 0.5 },
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
 * One structured Claude call: content blocks in, JSON matching `schema` out (output_config json_schema).
 * Returns { json, model, usage, ms, cost_usd }.
 */
async function ask({ content, schema, model = 'claude-sonnet-5-5', effort = 'medium', maxTokens = 16000, prices = {}, what = 'check' }) {
  const client = getAnthropic();
  const t0 = Date.now();
  const req = {
    model,
    max_tokens: maxTokens,
    output_config: { effort, format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content }],
  };
  let msg;
  try {
    msg = await client.beta.messages.stream({ ...req, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' }).finalMessage();
  } catch (e) {
    if (e?.status !== 400) throw e;
    msg = await client.beta.messages.stream(req).finalMessage();   // model without fallback support
  }
  if (msg.stop_reason === 'refusal') throw new Error(`Claude declined the ${what}`);
  if (msg.stop_reason === 'max_tokens') throw new Error(`The ${what} was cut off — try again`);
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  let json;
  try { json = JSON.parse(text); } catch { throw new Error('Claude returned an unreadable answer'); }
  const u = msg.usage || {};
  const p = prices[model] || DEFAULT_PRICES[model] || DEFAULT_PRICES['claude-sonnet-5-5'];
  const inTok = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);
  const cost = (inTok * p.in + (u.output_tokens || 0) * p.out) / 1e6;
  return { json, model: msg.model || model, usage: u, ms: Date.now() - t0, cost_usd: Number(cost.toFixed(5)) };
}

/**
 * images: [{ label, mime, data (base64) }] — one per frame, in the same order as the layer list.
 * Returns { issues, model, usage, ms, cost_usd }.
 */
async function checkDesign({ images, prompt, model = 'claude-sonnet-5-5', prices = {} }) {
  const content = [];
  for (const img of images) {
    content.push({ type: 'text', text: img.label });
    content.push({ type: 'image', source: { type: 'base64', media_type: img.mime || 'image/jpeg', data: img.data } });
  }
  content.push({ type: 'text', text: prompt });
  const { json, ...r } = await ask({ content, schema: ISSUE_SCHEMA, model, prices, what: 'design check' });
  return { issues: Array.isArray(json.issues) ? json.issues : [], ...r };
}

// Brief pre-flight: text only — issues on lines, plus every claim the brief makes (checked against the claims sheet)
const BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['issues', 'claims'],
  properties: {
    issues: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['line_id', 'found', 'fix', 'type', 'severity', 'rule'],
        properties: {
          line_id: { type: 'string' },
          found: { type: 'string' },
          fix: { type: 'string' },
          type: { type: 'string', enum: ['spelling', 'wrong_word', 'grammar', 'inconsistent', 'brand_name', 'rule', 'placeholder', 'translation', 'lane'] },
          severity: { type: 'string', enum: ['must_fix', 'should_fix', 'info'] },
          rule: { type: 'string' },
        },
      },
    },
    claims: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['line_id', 'claim', 'in_sheet', 'in_article', 'note'],
        properties: {
          line_id: { type: 'string' },
          claim: { type: 'string' },
          in_sheet: { type: 'string', enum: ['yes', 'no', 'no_sheet'] },
          in_article: { type: 'string', enum: ['yes', 'no', 'n/a'] },
          note: { type: 'string' },
        },
      },
    },
  },
};

async function checkBrief({ prompt, model = 'claude-sonnet-5-5', prices = {} }) {
  const { json, ...r } = await ask({ content: [{ type: 'text', text: prompt }], schema: BRIEF_SCHEMA, model, effort: 'medium', maxTokens: 12000, prices, what: 'brief check' });
  return { issues: Array.isArray(json.issues) ? json.issues : [], claims: Array.isArray(json.claims) ? json.claims : [], ...r };
}

module.exports = { configured, ask, checkDesign, checkBrief, DEFAULT_PRICES, ISSUE_SCHEMA, BRIEF_SCHEMA };

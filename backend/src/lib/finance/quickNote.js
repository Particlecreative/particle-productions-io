/**
 * "Quick note": the producer pastes or dictates what was decided ("Ayal approved 60s instead of 30s in today's screening,
 * +4K for the edit") and Claude fills the structured fields — reason, approved by, date, note, link. The producer confirms.
 */
const { getAnthropic } = require('../anthropic');
const W = require('../creative/week');
const { REASONS } = require('./events');

const MODEL = 'claude-opus-5-5';
const nul = (x) => ({ anyOf: [x, { type: 'null' }] });
const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['reason', 'approved_by', 'approved_at', 'note', 'link', 'new_planned', 'work_this_month'],
  properties: {
    reason: { type: 'string', enum: REASONS },
    approved_by: nul({ type: 'string', description: 'One of the approvers when the note names them, else the name as written, else null' }),
    approved_at: nul({ type: 'string', description: 'YYYY-MM-DD of the decision (resolve "today", "yesterday", weekdays against the given date)' }),
    note: { type: 'string', description: 'One or two short sentences finance can read: what was decided and why. Same language as the input.' },
    link: nul({ type: 'string' }),
    new_planned: nul({ type: 'number', description: 'Only when the note states a new total budget in USD' }),
    work_this_month: nul({ type: 'boolean', description: 'Only when the note says whether work / cost happened this month' }),
  },
};
const SYSTEM = `You turn a producer's quick note about a budget decision into structured fields for the finance log.
Reasons: scope_change (the job got bigger/different, e.g. AI → live shoot, 30s → 60s), post_revision (more edit / post work),
rights_renewal (talent usage rights extended), supplier_change (a different or more expensive supplier), other.
Never invent facts. If the note doesn't name who approved, approved_by is null.`;

async function parse({ text, context = {}, approvers = [] }) {
  const t = String(text || '').trim().slice(0, 4000);
  if (!t) throw Object.assign(new Error('Write or dictate the note first'), { status: 400 });
  const client = getAnthropic();
  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 8000, // Opus 5.5 always thinks; the thinking counts toward this
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: 'user', content: `<context>${JSON.stringify({ today: W.localDate(Date.now()), approvers, ...context })}</context>\n<note>${t}</note>` }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Claude declined this note');
  const out = JSON.parse((msg.content || []).filter(b => b.type === 'text').map(b => b.text).join(''));
  const match = approvers.find(a => out.approved_by && a.toLowerCase().split(' ')[0] === String(out.approved_by).toLowerCase().split(' ')[0]);
  if (match) out.approved_by = match;
  if (out.approved_at && !/^\d{4}-\d{2}-\d{2}$/.test(out.approved_at)) out.approved_at = null;
  return out;
}

module.exports = { parse };

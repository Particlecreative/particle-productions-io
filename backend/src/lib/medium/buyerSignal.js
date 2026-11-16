/**
 * MEDIUM — who's buying, from OuterSignal's weekly "The Signal" email (Tomer, 16 Nov 2026: "new data that might be
 * helpful for Medium"). Paste the email (Medium → Sources); Claude pulls out the aggregates only — the personas'
 * share of buyers and how they moved, what's trending with a persona, and the notable-buyer mix. Named customers are
 * never kept (they don't help a brief and they're personal data).
 *
 * signalBlock() gives the writer the latest week (and the change since the one before) for persona, casting and angle.
 */
const db = require('../../db');
const { getAnthropic } = require('../anthropic');

const MODEL = 'claude-sonnet-5-5';
const nul = (x) => ({ anyOf: [x, { type: 'null' }] });
const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['week_from', 'week_to', 'notable_total', 'types', 'personas', 'trending', 'headline'],
  properties: {
    week_from: nul({ type: 'string', description: 'YYYY-MM-DD, first day of the week the email covers' }),
    week_to: nul({ type: 'string', description: 'YYYY-MM-DD, last day' }),
    notable_total: nul({ type: 'number', description: 'How many notable customers bought this week' }),
    types: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['type', 'count'], properties: { type: { type: 'string' }, count: { type: 'number' } } } },
    personas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'share_pct', 'change_pts'],
      properties: { name: { type: 'string' }, share_pct: { type: 'number', description: 'share of buyers this week, %' }, change_pts: nul({ type: 'number', description: 'change in share since last week, points (negative when down)' }) } } },
    trending: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['product', 'persona', 'share_pct', 'prior_share_pct', 'units', 'prior_units_per_week'],
      properties: { product: { type: 'string' }, persona: nul({ type: 'string' }), share_pct: nul({ type: 'number' }), prior_share_pct: nul({ type: 'number' }), units: nul({ type: 'number' }), prior_units_per_week: nul({ type: 'number' }) } } },
    headline: { type: 'string', description: 'One sentence: the most useful thing in this week’s email for an ad strategist. No customer names.' },
  },
};
const SYSTEM = `You read OuterSignal's weekly "The Signal" email for the men's skincare brand Particle and pull out the AGGREGATE buyer data only:
the week, the number of notable customers, the notable-buyer types with counts, every persona with its share of buyers and its change in points,
and every "trending with a persona" item (product, persona, this week's share and the prior share, units). Never output any individual customer's
name, title, employer or purchase — not even in the headline. Use null for anything the email doesn't state.`;

let ready = null;
function ensureTable() {
  if (!ready) {
    ready = db.query(`CREATE TABLE IF NOT EXISTS medium_buyer_signal (
        id SERIAL PRIMARY KEY, week_from DATE, week_to DATE, data JSONB NOT NULL, added_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
      CREATE UNIQUE INDEX IF NOT EXISTS medium_buyer_signal_week ON medium_buyer_signal (week_from, week_to);`).catch(e => { ready = null; throw e; });
  }
  return ready;
}

/** The pasted email → the week's aggregates (Claude, structured output). */
async function parse(text) {
  const t = String(text || '').trim();
  if (t.length < 200) throw Object.assign(new Error('Paste the whole email (select all in Gmail, copy, paste)'), { status: 400 });
  if (!/outersignal|the signal|share of buyers|persona/i.test(t)) throw Object.assign(new Error('That doesn’t look like OuterSignal’s “The Signal” email'), { status: 400 });
  const stream = getAnthropic().beta.messages.stream({
    model: MODEL, max_tokens: 4000, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default',
    output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
    system: SYSTEM, messages: [{ role: 'user', content: `<email>\n${t.slice(0, 30000)}\n</email>` }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Claude declined to read this email');
  const out = JSON.parse((msg.content || []).filter(b => b.type === 'text').map(b => b.text).join(''));
  const date = (s) => (/^\d{4}-\d{2}-\d{2}$/.test(s || '') ? s : null);
  return { ...out, week_from: date(out.week_from), week_to: date(out.week_to), personas: (out.personas || []).sort((a, b) => b.share_pct - a.share_pct) };
}

async function add(text, { user = null } = {}) {
  await ensureTable();
  const d = await parse(text);
  if (!d.personas.length && !d.trending.length) throw Object.assign(new Error('Couldn’t find the personas or trends in that email'), { status: 400 });
  const { rows } = await db.query(`INSERT INTO medium_buyer_signal (week_from, week_to, data, added_by) VALUES ($1, $2, $3, $4)
      ON CONFLICT (week_from, week_to) DO UPDATE SET data = EXCLUDED.data, added_by = EXCLUDED.added_by, created_at = NOW() RETURNING id`,
    [d.week_from, d.week_to, JSON.stringify(d), user?.name || user?.email || null]);
  return { id: rows[0].id, ...d };
}

const sign = (n) => (n == null ? '' : `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(Math.round(n * 10) / 10)} pts`);
const fmtWeek = (d) => (d.week_from && d.week_to ? `${d.week_from} → ${d.week_to}` : 'latest week');

/** The latest week as plain lines for the writer (pure — tested). */
function signalText(d) {
  if (!d) return null;
  const lines = [`Who's buying — OuterSignal's weekly read of Particle's buyers (${fmtWeek(d)}). Use it to choose the persona, the talent and the angle — e.g. lean toward a persona that is rising, or the product trending with it; cite it as source "OuterSignal" in the evidence with the numbers.`];
  if (d.personas?.length) lines.push(`Personas, share of buyers this week: ${d.personas.map(p => `${p.name} ${Math.round(p.share_pct * 10) / 10}%${p.change_pts != null ? ` (${sign(p.change_pts)})` : ''}`).join(' · ')}`);
  for (const t of d.trending || []) lines.push(`Trending: ${t.product}${t.persona ? ` with ${t.persona}` : ''}${t.share_pct != null ? ` — ${t.share_pct}% of what they bought` : ''}${t.prior_share_pct != null ? `, up from ${t.prior_share_pct}%` : ''}${t.units != null ? ` (${t.units} units${t.prior_units_per_week != null ? ` vs ${t.prior_units_per_week}/week before` : ''})` : ''}`);
  if (d.notable_total) lines.push(`Notable buyers this week: ${d.notable_total}${d.types?.length ? ` — ${d.types.map(x => `${x.type} ${x.count}`).join(' · ')}` : ''}`);
  return lines.join('\n');
}

async function latest(n = 1) {
  await ensureTable().catch(() => null);
  const { rows } = await db.query('SELECT id, week_from, week_to, data, added_by, created_at FROM medium_buyer_signal ORDER BY week_to DESC NULLS LAST, created_at DESC LIMIT $1', [n]).catch(() => ({ rows: [] }));
  return rows;
}

/** For the writer: the newest week, if it's no older than 3 weeks. */
async function signalBlock() {
  const [row] = await latest(1);
  if (!row) return null;
  if (row.week_to && Date.now() - new Date(row.week_to).getTime() > 21 * 86400000) return null;
  return signalText(row.data);
}

module.exports = { parse, add, latest, signalBlock, signalText };

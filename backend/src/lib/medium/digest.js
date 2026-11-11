/**
 * MEDIUM — the weekly Growth digest (spec §9.3), posted to the creative Slack channel (SLACK_CREATIVE_WEBHOOK_URL)
 * when switched on: what Medium wrote and what was approved, tests decided, what the transfer map learned, Article
 * Opportunities, the next holiday deadline and the AI cost. Off by default.
 */
const db = require('../../db');
const calendar = require('./calendar');

/** The digest text from the week's numbers (pure — tested). */
function digestText({ briefs = {}, tests = [], edges = [], opportunities = [], holiday = null, cost = 0, link = '' }) {
  const n = (k) => briefs[k] || 0;
  const lines = [
    `*🔮 Medium — the week* (${n('written')} briefs written · ${n('approved')} approved · ${n('submitted')} on Monday · ${n('rejected')} rejected)`,
  ];
  const won = tests.filter(t => t.status === 'won'), failed = tests.filter(t => t.status === 'failed');
  if (won.length || failed.length) lines.push(`*Tests decided:* ${won.length} won, ${failed.length} failed${won.length ? ` — winners: ${won.slice(0, 3).map(t => t.hypothesis).join(' · ')}` : ''}`);
  if (edges.length) lines.push(`*Transfer map learned:* ${edges.slice(0, 3).map(e => `${e.source} → ${e.target} ${Number(e.score).toFixed(2)} (${e.won}/${e.tested})`).join(' · ')}`);
  if (opportunities.length) lines.push(`*Article opportunities:* ${opportunities.slice(0, 3).map(o => `${o.lane}: ${o.title}`).join(' · ')}`);
  if (holiday) lines.push(`*Next holiday:* ${holiday.name} — briefs due ${holiday.days_to_brief_by >= 0 ? `in ${holiday.days_to_brief_by} days (${holiday.brief_by})` : 'now'}`);
  lines.push(`AI cost this week: $${Number(cost).toFixed(2)}${link ? ` · <${link}|Open Medium>` : ''}`);
  return lines.join('\n');
}

async function weekNumbers() {
  const [b, t, e, o, c] = await Promise.all([
    db.query(`SELECT COUNT(*) FILTER (WHERE status NOT IN ('QUEUED', 'WRITING'))::int AS written, COUNT(*) FILTER (WHERE status IN ('APPROVED', 'SUBMITTED'))::int AS approved,
                     COUNT(*) FILTER (WHERE status = 'SUBMITTED')::int AS submitted, COUNT(*) FILTER (WHERE status = 'REJECTED')::int AS rejected
                FROM medium_briefs WHERE created_at > NOW() - INTERVAL '7 days'`),
    db.query(`SELECT hypothesis, status FROM medium_tests WHERE status IN ('won', 'failed') AND (result->>'decided_at')::timestamptz > NOW() - INTERVAL '7 days'`),
    db.query(`SELECT source, target, score, tested, won FROM medium_affinity WHERE tested > 0 ORDER BY won DESC, score DESC LIMIT 5`),
    db.query(`SELECT lane, title FROM medium_articles WHERE opportunity ORDER BY id DESC LIMIT 5`),
    db.query(`SELECT COALESCE(SUM(cost_usd), 0)::float AS c FROM medium_briefs WHERE created_at > NOW() - INTERVAL '7 days'`),
  ]);
  const holiday = calendar.upcoming(new Date(), 3).find(h => h.days_to_brief_by >= -7) || null;
  return { briefs: b.rows[0], tests: t.rows, edges: e.rows, opportunities: o.rows, holiday, cost: c.rows[0].c, link: `${(process.env.APP_URL || 'https://particlepdio.particleface.com').replace(/\/$/, '')}/medium` };
}

async function sendDigest() {
  const url = process.env.SLACK_CREATIVE_WEBHOOK_URL;
  if (!url) return { skipped: 'No Slack webhook (SLACK_CREATIVE_WEBHOOK_URL) on the server' };
  const text = digestText(await weekNumbers());
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Slack ${r.status}`);
  return { sent: true, chars: text.length };
}

module.exports = { digestText, weekNumbers, sendDigest };

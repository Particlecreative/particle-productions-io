/**
 * Claude-written narrative for the Creative Weekly deck: executive summary, highlights, risks,
 * next-week focus and a one-liner per person. Facts come only from the visible deck data.
 */
const { getAnthropic } = require('../anthropic');
const { visibleTicketIds } = require('./deck');

const MODEL = 'claude-opus-5-5';

const NARRATIVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['exec_summary', 'highlights', 'risks', 'next_week_focus', 'focus_by_division', 'per_person'],
  properties: {
    exec_summary: { type: 'array', items: { type: 'string' }, description: '3-5 short bullets for the CEOs' },
    highlights: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    next_week_focus: { type: 'array', items: { type: 'string' } },
    focus_by_division: {
      type: 'object',
      additionalProperties: false,
      required: ['design', 'video', 'tv'],
      properties: {
        design: { type: 'array', items: { type: 'string' } },
        video: { type: 'array', items: { type: 'string' } },
        tv: { type: 'array', items: { type: 'string' } },
      },
    },
    per_person: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['monday_user_id', 'one_liner'],
        properties: { monday_user_id: { type: 'string' }, one_liner: { type: 'string' } },
      },
    },
  },
};

const SYSTEM = `You write the narrative for Particle's weekly creative department report, presented by the head of creative to the two CEOs.
Particle is a men's skincare brand. The creative department has three divisions: Design (statics, web, email), Video (digital ads and edits) and TV & Special Productions (TV commercials and shoots, managed as productions in the CP).
The deck is presented on Sunday: "last week" is the Sunday–Thursday that just ended; "this week" is the week starting now.

Rules:
- Use only facts and numbers present in the JSON you receive. Never invent tickets, people, numbers or causes.
- exec_summary: 3 to 5 bullets, each under 20 words, together under 70 words. Cover the three divisions' output last week, momentum vs the week before, then the one thing that needs CEO attention if any.
- highlights: up to 4 notable deliveries (name the campaign/product), each under 16 words.
- risks: up to 4 concrete risks (stuck, overdue, heavy fixes rounds), each under 16 words. Empty array if none.
- next_week_focus: up to 4 department-wide bullets for this week, each under 14 words.
- focus_by_division: for each of design, video and tv, up to 4 bullets for THIS week drawn from that division's planned work (and, for tv, its productions), each under 14 words. Empty array if there is nothing planned.
- per_person: one line per person listed, under 18 words, describing what they shipped or worked on. Factual and generous; never rank or compare people against each other.
- Plain confident business English. No emojis, no hype words like "amazing" or "crushing".`;

function compactInput(report) {
  const snap = report.snapshot || {};
  const ov = report.overrides || {};
  const visible = visibleTicketIds(report);
  const hiddenPeople = new Set(Object.entries(ov.people || {}).filter(([, v]) => v?.hidden).map(([k]) => k));
  const it = (id) => snap.items?.[id];
  const label = (x) => {
    const t = it(x);
    if (!t) return null;
    return [t.title, t.subtitle, t.product?.label].filter(Boolean).join(' · ');
  };
  const vis = (list) => (list || []).filter(id => visible.has(String(id)));

  const people = Object.values(snap.people || {})
    .filter(p => !hiddenPeople.has(String(p.id)))
    .map(p => {
      const mine = (list) => vis(list).filter(id => it(id)?.people?.includes(p.id));
      const bp = snap.metrics?.by_person?.[p.id] || {};
      return {
        monday_user_id: String(p.id),
        name: p.name,
        role: p.role === 'video' ? 'Video editor' : 'Designer',
        delivered_count: bp.delivered ?? 0,
        delivered: mine(snap.sections?.delivered).slice(0, 8).map(label),
        in_progress_count: bp.in_progress ?? 0,
        planned_next_count: bp.planned_next ?? 0,
        fixes_rounds: bp.fixes ?? 0,
      };
    })
    .filter(p => p.delivered_count || p.in_progress_count || p.planned_next_count);

  const prevTrend = (snap.trend || []).slice(-2, -1)[0] || null;
  const divisionOf = (x) => it(x)?.division || it(x)?.board;
  const byDivision = {};
  for (const dv of ['design', 'video', 'tv']) {
    const m = snap.metrics?.by_division?.[dv] || {};
    byDivision[dv] = {
      delivered_last_week: m.delivered ?? null,
      week_before: prevTrend?.by_division?.[dv] ?? null,
      in_progress: m.in_progress ?? null,
      top_products: (m.by_product || []).slice(0, 4).map(p => `${p.label} (${p.total})`),
      delivered: vis(snap.sections?.delivered).filter(x => divisionOf(x) === dv).slice(0, 10).map(label),
      planned_this_week: vis(snap.sections?.planned_next_week).filter(x => divisionOf(x) === dv).slice(0, 12).map(label),
    };
  }
  return {
    week_reviewed: snap.week?.label,
    this_week: snap.week?.next?.label,
    week_partial: !!snap.week?.partial,
    divisions: byDivision,
    totals: snap.metrics?.totals,
    last_week: prevTrend ? { video: prevTrend.video, design: prevTrend.design } : null,
    turnaround_median_days: snap.metrics?.turnaround?.median_days ?? null,
    on_time_rate_pct: snap.metrics?.on_time?.rate ?? null,
    top_products: (snap.metrics?.by_product || []).slice(0, 5).map(p => ({ product: p.label, video: p.video, design: p.design })),
    people,
    stuck: vis(snap.sections?.stuck).slice(0, 8).map(label),
    overdue: vis(snap.sections?.overdue).slice(0, 8).map(id => ({ ticket: label(id), deadline: it(id)?.deadline })),
    planned_next_week: vis(snap.sections?.planned_next_week).slice(0, 12).map(label),
    cp_productions: (snap.cp_weekly?.productions || []).slice(0, 10).map(p => ({ name: p.name, stage: p.stage, planned_start: p.planned_start, planned_end: p.planned_end, note: String(p.note || '').slice(0, 300) })),
    cp_general_updates: (snap.cp_weekly?.general_updates || []).slice(0, 10).map(u => String(u.text || '').slice(0, 200)),
  };
}

/**
 * Generate the narrative. Fields listed in `locked` (edited by a human) are kept from `previous`.
 */
async function generateNarrative(report, { previous = null, force = false } = {}) {
  const client = getAnthropic();
  const input = compactInput(report);

  const stream = client.beta.messages.stream({
    model: MODEL,
    max_tokens: 16000, // Opus 5.5 always thinks; the thinking counts toward this
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'medium', format: { type: 'json_schema', schema: NARRATIVE_SCHEMA } },
    system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
    messages: [{ role: 'user', content: `Week data (JSON):\n${JSON.stringify(input)}` }],
  });
  const msg = await stream.finalMessage();

  if (msg.stop_reason === 'refusal') throw new Error('Claude declined to write this summary');
  if (msg.stop_reason === 'max_tokens') throw new Error('Summary was cut off — try again');
  const text = (msg.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
  let out;
  try { out = JSON.parse(text); } catch { throw new Error('Claude returned an unreadable summary — try again'); }

  const roster = new Set(Object.keys(report.snapshot?.people || {}));
  out.per_person = (out.per_person || []).filter(p => roster.has(String(p.monday_user_id)));

  const locked = force ? [] : (previous?.locked_fields || []);
  const merged = { ...out };
  for (const f of locked) if (previous && f in previous) merged[f] = previous[f];
  merged.locked_fields = locked;
  merged.generated_at = new Date().toISOString();
  merged.model = msg.model || MODEL;
  return merged;
}

module.exports = { generateNarrative, compactInput, NARRATIVE_SCHEMA };

/**
 * TV Productions for the Growth team (17 Nov 2026): the Production Tracker's view of every production WITHOUT money —
 * no budget, payments, contracts, suppliers or external crew, no notes or updates (they talk money). What's left:
 * stage, type, product, producer, dates (planned, shoot, delivery, on air), the deadline we chose, the current and
 * next Gantt milestone, the internal team, and the Studio tickets behind it (so they can see the editor / designer).
 * Pure — tested in test/growthProductions.test.js.
 */
const SAFE_SIGNALS = new Set(['overdue', 'blocked', 'due_soon', 'stuck_ticket']);

const ticketOf = (t) => ({
  id: t.id, board: t.board, name: t.name, title: t.title, subtitle: t.subtitle,
  status: t.status ? { label: t.status.label, color: t.status.color, category: t.status.category } : null,
  open: !!t.open, product: t.product || null, people: Array.isArray(t.people) ? t.people : [],
  timeline: t.timeline || null, deadline: t.deadline || null, monday_url: t.monday_url || null, campaign: t.campaign || null,
});

function productionForGrowth(p) {
  return {
    id: p.id, name: p.name, stage: p.stage, stage_since: p.stage_since, stage_days: p.stage_days,
    production_type: p.production_type || '', category: p.category || '',
    product_type: Array.isArray(p.product_type) ? p.product_type : [],
    producer: p.producer || null,
    dates: p.dates || {},
    shoot: p.shoot || { days: [], next: null },
    deadline: p.tracker?.deadline ? { date: p.tracker.deadline, label: p.tracker.deadline_label || '' } : null,
    health: p.tracker?.health || null,
    milestone: p.milestone || { current: null, next: null },
    team: (p.team?.internal || []).map(m => ({ name: m.name, role: m.role || '', photo: m.photo || null, monday_id: m.monday_id || null, source: m.source || null })),
    tickets: (p.tickets || []).map(ticketOf),
    signals: (p.signals || []).filter(s => SAFE_SIGNALS.has(s.kind)).map(s => ({ kind: s.kind, level: s.level, text: s.text })),
  };
}

/** The tracker payload → what Growth may see. Only the people on the tickets kept (name + photo). */
function trackerForGrowth(t) {
  const productions = (t.productions || []).map(productionForGrowth);
  const ids = new Set(productions.flatMap(p => p.tickets.flatMap(k => k.people)));
  const people = {};
  for (const id of ids) {
    const u = t.people?.[id];
    if (u) people[id] = { id: String(u.id || id), name: u.name || '', photo: u.photo || null };
  }
  return { brand_id: t.brand_id, today: t.today, generated_at: t.generated_at, productions, people, monday: !!t.monday };
}

module.exports = { trackerForGrowth, productionForGrowth };

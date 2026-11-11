/**
 * MEDIUM — outcomes from AFTERLIFE (daily, on the worker):
 *   1. The corpus: each past ticket → shipped? percentile? winner? Winners become the top-tier examples; never-ran
 *      briefs teach style only (spec §15). AfterLife's winners list carries the monday item ids of each creative.
 *   2. Medium's own tests: a shipped brief's creative reaches the decision floor ($1,000 or 14 days) → won (≥ 60th pct),
 *      failed (< 40th) or inconclusive; transfer results update the affinity map (§6.5).
 */
const db = require('../../db');
const afterlife = require('./afterlife');

/** Best AfterLife result per monday item id for a set of (product, format) pairs. */
async function resultsByItem(pairs) {
  const byItem = new Map();
  for (const { product, format, lane } of pairs) {
    const r = await afterlife.winners({ product, format, lane, limit: 200 });
    if (!r.available) return { available: false, reason: r.reason, byItem };
    for (const w of r.winners || []) {
      for (const t of w.tickets || []) {
        const prev = byItem.get(String(t.item_id));
        if (!prev || (w.percentile ?? -1) > (prev.percentile ?? -1)) byItem.set(String(t.item_id), { percentile: w.percentile, spend: w.spend, roas: w.roas, winner: !!w.winner, label: w.label, last_day: w.last_day });
      }
    }
  }
  return { available: true, byItem };
}

/** 1. The corpus outcome join. */
async function joinExemplars() {
  const { rows: pairs } = await db.query(`SELECT DISTINCT product, format FROM medium_exemplars WHERE NOT excluded AND product IS NOT NULL AND product NOT IN ('-', 'Multiple Products', 'Not a Product Task')`);
  const r = await resultsByItem(pairs.map(p => ({ product: p.product, format: p.format === 'design' ? 'design' : 'video' })));
  if (!r.available) return { skipped: r.reason };
  let matched = 0, winners = 0;
  for (const [itemId, res] of r.byItem) {
    const u = await db.query(`UPDATE medium_exemplars SET afterlife = $2, winner = $3 WHERE item_id = $1 RETURNING id`, [itemId, JSON.stringify({ ran: true, ...res, at: new Date().toISOString() }), res.winner]);
    if (u.rowCount) { matched++; if (res.winner) winners++; }
  }
  return { matched, winners };
}

/** Decision rule (spec §6.5) — pure, tested. */
function decide({ percentile, spend }, { days, floor = { spend: 1000, days: 14, win_pct: 60, fail_pct: 40 } } = {}) {
  if (percentile == null) return 'waiting';
  if ((spend || 0) < floor.spend && (days || 0) < floor.days) return 'running';
  if (percentile >= floor.win_pct) return 'won';
  if (percentile < floor.fail_pct) return 'failed';
  return 'inconclusive';
}

/** Learned transfer score: the old score as a prior worth 4 tests, plus this result. Pure, tested. */
function updatedEdge(score, tested, won) {
  return Math.round(((Number(score) * (4 + tested)) + (won ? 1 : 0)) / (4 + tested + 1) * 100) / 100;
}

/** 2. Score Medium's tests whose brief is on Monday. */
async function scoreTests() {
  const { rows: tests } = await db.query(
    `SELECT t.*, b.id AS brief_id, b.product, b.format, b.lane, b.monday_item_id, b.move, b.evidence, b.updated_at AS submitted_at
       FROM medium_tests t JOIN medium_briefs b ON b.id = ANY(t.brief_ids)
      WHERE t.status IN ('waiting', 'running') AND b.monday_item_id IS NOT NULL`);
  if (!tests.length) return { checked: 0 };
  const pairs = [...new Map(tests.map(t => [`${t.product}|${t.format}|${t.lane}`, { product: t.product, format: t.format, lane: t.lane }])).values()];
  const r = await resultsByItem(pairs);
  if (!r.available) return { skipped: r.reason };
  let decided = 0;
  for (const t of tests) {
    const res = r.byItem.get(String(t.monday_item_id));
    if (!res) continue;
    const days = Math.floor((Date.now() - new Date(t.submitted_at).getTime()) / 86400000);
    const status = decide(res, { days, floor: t.decision_floor || undefined });
    if (status === t.status) continue;
    await db.query(`UPDATE medium_tests SET status = $2, result = $3 WHERE id = $1`, [t.id, status, JSON.stringify({ ...res, days, decided_at: new Date().toISOString() })]);
    if (['won', 'failed'].includes(status)) {
      decided++;
      const tr = t.evidence?.transfer;
      if (tr?.source?.product && tr?.target?.product) {
        const { rows } = await db.query('SELECT id, score, tested FROM medium_affinity WHERE lower(source) = lower($1) AND lower(target) = lower($2)', [tr.source.product, tr.target.product]);
        if (rows[0]) await db.query('UPDATE medium_affinity SET score = $2, tested = tested + 1, won = won + $3 WHERE id = $1', [rows[0].id, updatedEdge(rows[0].score, rows[0].tested, status === 'won'), status === 'won' ? 1 : 0]);
        else await db.query(`INSERT INTO medium_affinity (cluster, source, target, score, tested, won, note) VALUES ('learned', $1, $2, $3, 1, $4, 'learned from a transfer test') ON CONFLICT (source, target) DO NOTHING`,
          [tr.source.product, tr.target.product, status === 'won' ? 0.6 : 0.3, status === 'won' ? 1 : 0]);
      }
    }
  }
  return { checked: tests.length, decided };
}

async function runOutcomes() {
  const exemplars = await joinExemplars().catch(e => ({ error: e.message }));
  const tests = await scoreTests().catch(e => ({ error: e.message }));
  return { exemplars, tests };
}

module.exports = { runOutcomes, joinExemplars, scoreTests, decide, updatedEdge };

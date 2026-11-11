/**
 * MEDIUM — the lane mix learns from results (spec §5.7, §14 phase 4: "mix changes from data, not defaults").
 * Once a week, just before the autopilot run: decided tests from the last 60 days, per lane × format (transfers counted
 * on their own), move weekly slots from the weakest cell to the strongest. Small steps on purpose:
 *   - only cells with ≥ 3 decided tests move;
 *   - each cell moves at most one slot a week; the weekly total never changes;
 *   - every lane (and transfers) keeps at least one slot in total;
 *   - a move needs a real gap: the strong cell's win rate ≥ the weak cell's + 20 points.
 * Every change carries a plain sentence for the strategist; the last 20 rounds are kept in medium_config.state.mix_history.
 */
const db = require('../../db');

const MIN_DECIDED = 3;
const MIN_GAP = 0.2;
const MIN_PER_GROUP = 1;

const FORMAT_WORD = { video: 'videos', static: 'statics' };
const cellName = (lane, format) => (lane === 'transfers' ? `${format === 'video' ? 'Video' : 'Static'} transfers` : `${lane} ${FORMAT_WORD[format] || format}`);
const wonOf = (s) => `won ${s.won} of ${s.decided} test${s.decided === 1 ? '' : 's'}`;

/**
 * Rebalance the weekly mix (pure — tested).
 * mix: { Particle: { video, static }, SFY: {…}, GT: {…}, WAC: {…}, transfers: {…} }
 * stats: [{ lane, format: 'video'|'static', won, failed, inconclusive }]  (lane 'transfers' for transfer tests)
 * Returns { mix, changes: [{ lane, format, from, to, why }] } — mix is a fresh copy; the input is not touched.
 */
function rebalance(mix = {}, stats = []) {
  const next = JSON.parse(JSON.stringify(mix || {}));
  const byCell = new Map();
  for (const s of stats || []) {
    const fmt = s.format === 'design' ? 'static' : s.format;
    const k = `${s.lane}|${fmt}`;
    const cur = byCell.get(k) || { won: 0, failed: 0, inconclusive: 0 };
    byCell.set(k, { won: cur.won + (Number(s.won) || 0), failed: cur.failed + (Number(s.failed) || 0), inconclusive: cur.inconclusive + (Number(s.inconclusive) || 0) });
  }
  const cells = [];
  for (const [lane, m] of Object.entries(next)) {
    if (!m || typeof m !== 'object') continue;
    for (const format of ['video', 'static']) {
      const s = byCell.get(`${lane}|${format}`);
      if (!s) continue;
      const decided = s.won + s.failed + s.inconclusive;
      if (decided < MIN_DECIDED) continue;
      cells.push({ lane, format, won: s.won, failed: s.failed, decided, rate: s.won / decided });
    }
  }
  const total = (lane) => (Number(next[lane]?.video) || 0) + (Number(next[lane]?.static) || 0);
  const changes = [];
  const used = new Set();
  // strongest first (ties: more evidence), weakest last (ties: more evidence)
  const strong = [...cells].sort((a, b) => b.rate - a.rate || b.decided - a.decided);
  const weak = [...cells].sort((a, b) => a.rate - b.rate || b.decided - a.decided);
  for (const up of strong) {
    if (used.has(`${up.lane}|${up.format}`)) continue;
    const down = weak.find(d => !used.has(`${d.lane}|${d.format}`) && `${d.lane}|${d.format}` !== `${up.lane}|${up.format}`
      && up.rate - d.rate >= MIN_GAP && (Number(next[d.lane]?.[d.format]) || 0) >= 1
      && (d.lane === up.lane || total(d.lane) - 1 >= MIN_PER_GROUP));
    if (!down) continue;
    used.add(`${up.lane}|${up.format}`);
    used.add(`${down.lane}|${down.format}`);
    const upFrom = Number(next[up.lane][up.format]) || 0, downFrom = Number(next[down.lane][down.format]) || 0;
    next[up.lane][up.format] = upFrom + 1;
    next[down.lane][down.format] = downFrom - 1;
    changes.push({ lane: up.lane, format: up.format, from: upFrom, to: upFrom + 1,
      why: `${cellName(up.lane, up.format)} ${wonOf(up)} — one more slot a week (${upFrom} → ${upFrom + 1}).` });
    changes.push({ lane: down.lane, format: down.format, from: downFrom, to: downFrom - 1,
      why: `${cellName(down.lane, down.format)} ${wonOf(down)} — one slot moves to ${up.lane === 'transfers' ? cellName(up.lane, up.format).toLowerCase() : cellName(up.lane, up.format)} (${downFrom} → ${downFrom - 1}).` });
  }
  return { mix: next, changes };
}

/** Decided tests per lane × format in the last `days` days (transfer briefs count under "transfers"). */
async function decidedStats(days = 60) {
  const { rows } = await db.query(
    `SELECT CASE WHEN b.move LIKE 'TRANSFER_%' THEN 'transfers' ELSE b.lane END AS lane,
            CASE WHEN b.format = 'design' THEN 'static' ELSE 'video' END AS format,
            COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'won')::int AS won,
            COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'failed')::int AS failed,
            COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'inconclusive')::int AS inconclusive
       FROM medium_tests t JOIN medium_briefs b ON b.id = ANY(t.brief_ids)
      WHERE t.status IN ('won', 'failed', 'inconclusive')
        AND COALESCE((t.result->>'decided_at')::timestamptz, t.created_at) > NOW() - make_interval(days => $1::int)
      GROUP BY 1, 2`, [days]);
  return rows;
}

/** The weekly step: read results, rebalance, save the mix and remember what changed (and why). */
async function runReweight() {
  const { getConfig, saveConfig } = require('./config');
  const cfg = await getConfig();
  const stats = await decidedStats(60);
  const r = rebalance(cfg.lane_mix, stats);
  if (!r.changes.length) return { changed: 0, cells_with_results: stats.length };
  await saveConfig({ lane_mix: r.mix });
  const history = [...(Array.isArray(cfg.state?.mix_history) ? cfg.state.mix_history : []), { at: new Date().toISOString(), changes: r.changes }].slice(-20);
  await db.query(`UPDATE settings SET medium_config = jsonb_set(jsonb_set(COALESCE(medium_config, '{}'::jsonb), '{state}', COALESCE(medium_config->'state', '{}'::jsonb), true),
      '{state,mix_history}', $1::jsonb, true) WHERE brand_id = 'particle'`, [JSON.stringify(history)]);
  return { changed: r.changes.length, changes: r.changes, mix: r.mix };
}

module.exports = { rebalance, decidedStats, runReweight, MIN_DECIDED, MIN_GAP };

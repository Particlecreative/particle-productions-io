/**
 * MEDIUM — the weekly run (spec §12) and the worker's clock.
 *   Autopilot (off until switched on): Sunday 07:00 Asia/Jerusalem — this week's AfterLife winners per lane (lane mix
 *   §5.7), skipping winners briefed in the last 30 days (cap 3 open briefs per winner) → ITERATE for video winners,
 *   REFRESH for static winners, plus transfers along the affinity map's strongest edges (§6.6). Caps: per_week.
 *   Outcomes (always on, free): once a day, AfterLife results → corpus winners + Medium's tests (outcomes.js).
 */
const db = require('../../db');
const { enqueue } = require('../captain/queue');
const afterlife = require('./afterlife');
const { getConfig } = require('./config');

const MONDAY_URL = (board, item) => `https://particle-for-men.monday.com/boards/${board}/pulses/${item}`;

/** Israel weekday / hour / date right now. */
function jerusalemNow(d = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', weekday: 'short', hour: '2-digit', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d).map(x => [x.type, x.value]));
  return { weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), hour: Number(p.hour), date: `${p.year}-${p.month}-${p.day}` };
}

/**
 * Which briefs to write this week (pure — tested).
 * winners: AfterLife rows (with lane, format, key, product, winner, percentile); recent: { key → open count };
 * mix: { Particle: { video, static }, … }; perWeek: cap. Returns [{ lane, format, move, product, winner }].
 */
function planWeek(winners, { mix = {}, recent = {}, perWeek = 12, perWinner = 3, edges = [], hooks = 0, hooked = {} } = {}) {
  const out = [];
  const take = (w, move, extra = {}) => { out.push({ lane: w.lane, format: w.format === 'static' ? 'design' : 'video', move, product: w.product, winner: w, ...extra }); recent[w.key] = (recent[w.key] || 0) + 1; };
  for (const [lane, m] of Object.entries(mix)) {
    if (lane === 'transfers') continue;
    for (const fmt of ['video', 'static']) {
      let need = Number(m?.[fmt]) || 0;
      for (const w of winners.filter(x => x.winner && x.lane === lane && x.format === fmt && x.product && (recent[x.key] || 0) < perWinner)) {
        if (need <= 0 || out.length >= perWeek) break;
        take(w, fmt === 'video' ? 'ITERATE' : 'REFRESH');
        need--;
      }
    }
  }
  // headline hooks: a winning static's headline opens a new video (only statics whose headline is known)
  let hNeed = Number(hooks) || 0;
  for (const w of winners.filter(x => x.winner && x.format === 'static' && x.product && x.headline && !hooked[x.key])) {
    if (hNeed <= 0 || out.length >= perWeek) break;
    out.push({ lane: w.lane, format: 'video', move: 'HEADLINE_HOOK', product: w.product, winner: w, headline: w.headline, headline_from: w.headline_from });
    hooked[w.key] = 1;
    hNeed--;
  }
  // transfers: the strongest untested edge out of each winning product
  let tNeed = (Number(mix.transfers?.video) || 0) + (Number(mix.transfers?.static) || 0);
  for (const w of winners.filter(x => x.winner && x.product)) {
    if (tNeed <= 0 || out.length >= perWeek) break;
    const e = edges.filter(x => x.source.toLowerCase() === w.product.toLowerCase() && Number(x.score) >= 0.6).sort((a, b) => Number(b.score) - Number(a.score))[0];
    if (!e || out.some(o => o.move === 'TRANSFER_PRODUCT' && o.product === e.target)) continue;
    out.push({ lane: w.lane, format: w.format === 'static' ? 'design' : 'video', move: 'TRANSFER_PRODUCT', product: e.target, source_product: w.product, winner: w });
    tNeed--;
  }
  return out.slice(0, perWeek);
}

async function runAutopilot({ actor = 'Medium autopilot', force = false } = {}) {
  const cfg = await getConfig();
  if (!cfg.autopilot?.enabled && !force) return { skipped: 'Autopilot is off' };
  const r = await afterlife.winners({ limit: 200, since: new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10) });
  if (!r.available) return { skipped: `AfterLife unavailable: ${r.reason}` };
  const { rows: rec } = await db.query(`SELECT request->>'source_key' AS k, COUNT(*)::int AS n FROM medium_briefs WHERE request->>'source_key' IS NOT NULL AND created_at > NOW() - INTERVAL '30 days' AND status NOT IN ('REJECTED', 'ERROR') GROUP BY 1`);
  const { rows: thisWeek } = await db.query(`SELECT COUNT(*)::int AS n FROM medium_briefs WHERE created_at > NOW() - INTERVAL '7 days' AND source IN ('autopilot', 'generator', 'holiday')`);
  const { rows: edges } = await db.query('SELECT source, target, score FROM medium_affinity');
  const { rows: hk } = await db.query(`SELECT DISTINCT request->>'source_key' AS k FROM medium_briefs WHERE move = 'HEADLINE_HOOK' AND status NOT IN ('REJECTED', 'ERROR') AND created_at > NOW() - INTERVAL '60 days'`);
  const statics = (r.winners || []).filter(w => w.format === 'static' && w.winner && w.product);
  const withHl = statics.length ? await require('./headlines').attachHeadlines(statics).catch(() => statics) : [];
  const hl = new Map(withHl.map(w => [w.key, w]));
  const winners = (r.winners || []).map(w => hl.get(w.key) || w);
  const room = Math.max(0, Math.min(Number(cfg.autopilot?.per_week) || 12, (Number(cfg.caps?.per_week) || 40) - thisWeek[0].n));
  const plan = planWeek(winners, { mix: cfg.lane_mix, recent: Object.fromEntries(rec.map(x => [x.k, x.n])), perWeek: room, perWinner: Number(cfg.caps?.per_winner) || 3, edges, hooks: Number(cfg.autopilot?.headline_hooks ?? 3), hooked: Object.fromEntries(hk.map(x => [x.k, 1])) });
  const batch = require('crypto').randomUUID();
  const ids = [];
  for (const p of plan) {
    const w = p.winner, t = (w.tickets || [])[0];
    const source = p.move === 'HEADLINE_HOOK' ? require('./headlines').sourceLine(w) : `${w.label} — AfterLife ${w.percentile}th pct in its ${w.peer?.level || 'peer set'}, ROAS ${w.roas != null ? Number(w.roas).toFixed(2) : '?'} on $${Math.round(w.spend || 0).toLocaleString()} spend${t ? ` · Monday: ${MONDAY_URL(t.board_id, t.item_id)}` : ''}`;
    const request = { lane: p.lane, format: p.format, move: p.move, product: p.product, source, source_key: w.key, source_product: p.source_product || null, note: null, author: actor, batch_id: batch, autopilot: true,
      ...(p.move === 'HEADLINE_HOOK' ? { headline: p.headline, headline_from: p.headline_from, thumb: w.thumb || null } : {}) };
    const { rows } = await db.query(`INSERT INTO medium_briefs (status, source, author, lane, product, format, move, request) VALUES ('QUEUED', 'autopilot', $1, $2, $3, $4, $5, $6) RETURNING id`,
      [actor, p.lane, p.product, p.format, p.move, JSON.stringify(request)]);
    ids.push(rows[0].id);
    await enqueue('medium_generate', { brief_id: rows[0].id }, { dedupeKey: `medium_generate:${rows[0].id}`, priority: 6, maxAttempts: 1 });
  }
  return { queued: ids.length, ids, room };
}

/** Remember when a scheduled thing last ran (settings.medium_config.state — not editable from the UI). */
async function stamp(key) {
  await db.query(`UPDATE settings SET medium_config = jsonb_set(COALESCE(medium_config, '{}'::jsonb), $1::text[], to_jsonb($2::text), true) WHERE brand_id = 'particle'`, [['state', key], new Date().toISOString()]);
}

/** The worker calls this every 10 minutes. */
async function tick() {
  const cfg = await getConfig();
  const now = jerusalemNow();
  const state = cfg.state || {};
  const out = {};
  // outcomes once a day, after 05:00 Israel time
  if (now.hour >= 5 && String(state.outcomes_at || '').slice(0, 10) !== now.date) {
    await stamp('outcomes_at');
    out.outcomes = await require('./outcomes').runOutcomes().catch(e => ({ error: e.message }));
  }
  // Market Watch: Sundays 06:00 (before the 07:00 run), and once right away when there is no snapshot yet
  if (require('./upspring').configured() && ((now.weekday === 0 && now.hour >= 6 && String(state.market_at || '').slice(0, 10) !== now.date) || !state.market_at)) {
    await stamp('market_at');
    out.market = await enqueue('medium_market', { reason: 'weekly' }, { dedupeKey: 'medium_market', priority: 5, maxAttempts: 1 }).catch(e => ({ error: e.message }));
  }
  // autopilot once a week, on the set weekday/hour
  const ap = cfg.autopilot || {};
  if (ap.enabled && now.weekday === Number(ap.weekday ?? 0) && now.hour >= Number(ap.hour ?? 7) && String(state.autopilot_at || '').slice(0, 10) !== now.date) {
    await stamp('autopilot_at');
    // the lane mix learns from decided tests first, so this week's plan already uses it
    out.mix = await require('./mix').runReweight().catch(e => ({ error: e.message }));
    out.autopilot = await runAutopilot().catch(e => ({ error: e.message }));
  }
  // the weekly Growth digest to Slack, when switched on
  const dg = cfg.digest || {};
  if (dg.enabled && now.weekday === Number(dg.weekday ?? 1) && now.hour >= Number(dg.hour ?? 9) && String(state.digest_at || '').slice(0, 10) !== now.date) {
    await stamp('digest_at');
    out.digest = await require('./digest').sendDigest().catch(e => ({ error: e.message }));
  }
  return out;
}

module.exports = { runAutopilot, planWeek, tick, jerusalemNow };

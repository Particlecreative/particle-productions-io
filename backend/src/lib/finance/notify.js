/**
 * Turns pending finance_events into emails:
 *   instant → right away (reopen / past-month change / approval / closed), grouped per production
 *   bundle  → one email per production, `bundle_minutes` after its last change (over Planned, postponed, completed, paused)
 * Runs every minute (and right after an instant event). Single-flight + an advisory lock across processes.
 */
const db = require('../../db');
const config = require('./config');
const mailer = require('./mailer');
const tpl = require('./templates');
const ctx = require('./context');
const fx = require('./fx');
const crypto = require('crypto');
const keyOf = (prefix, evs) => `${prefix}:${crypto.createHash('sha1').update(evs.map(e => e.id).join(',')).digest('hex')}`;

let running = null;
function run() {
  if (running) return running;
  running = (async () => {
    const client = await db.connect();
    try {
      const { rows: lk } = await client.query("SELECT pg_try_advisory_lock(hashtext('finance_notify')) AS ok");
      if (!lk[0].ok) return { skipped: true };
      try { return await sendPending(); } finally { await client.query("SELECT pg_advisory_unlock(hashtext('finance_notify'))"); }
    } finally { client.release(); }
  })().finally(() => { running = null; });
  return running;
}

async function sendPending() {
  const cfg = await config.get();
  const { rows } = await db.query(
    `SELECT * FROM finance_events WHERE notified_at IS NULL AND notify IS NOT NULL ORDER BY created_at, id`);
  if (!rows.length) return { sent: 0 };
  const byProd = new Map();
  for (const e of rows) { const k = e.production_id || '_'; if (!byProd.has(k)) byProd.set(k, []); byProd.get(k).push(e); }
  let sent = 0;
  const now = Date.now();
  for (const [pid, evs] of byProd) {
    try { sent += await sendFor(pid, evs, cfg, now); } catch (e) { console.error(`[finance notify] ${pid}:`, e.message); }
  }
  return { sent };
}

async function sendFor(pid, evs, cfg, now) {
  let sent = 0;
  const loaded = pid !== '_' ? await ctx.loadProduction(pid) : null;
  if (!loaded) { await mark(evs); return 0; } // production deleted — the log keeps it, nothing to email
  const { prod, lines, state } = loaded;
  const sheetUrl = prod.finance_sheet_url || null;
  const to = cfg.to, cc = cfg.cc;

  // Approval: its own email
  for (const e of evs.filter(x => x.kind === 'budget_approved')) {
    const mail = tpl.approved({
      prod, state, perCurrency: ctx.perCurrency(lines), rateQuote: { rate: Number(prod.approved_fx_rate) || fx.latest().rate, date: fx.quote(prod.budget_approved_at).date },
      plan: ctx.paymentPlan(prod, lines, cfg), sheetUrl, note: e.note,
    });
    await mailer.queue({ kind: 'approved', production_id: pid, to, cc, subject: mail.subject, html: mail.html, dedupe_key: `approved:${e.id}` });
    await mark([e]); sent++;
  }
  // Closed: its own email
  for (const e of evs.filter(x => x.kind === 'locked')) {
    const mail = tpl.closed({ prod, totals: ctx.totalsOf(lines), missing: ctx.missingInvoiceLines(prod, lines, '9999-12-01'), sheetUrl, note: e.note });
    await mailer.queue({ kind: 'closed', production_id: pid, to, cc, subject: mail.subject, html: mail.html, dedupe_key: `closed:${e.id}` });
    await mark([e]); sent++;
  }
  // Everything else instant: one urgent email
  const instant = evs.filter(x => x.notify === 'instant' && !['budget_approved', 'locked'].includes(x.kind));
  if (instant.length) {
    const mail = tpl.reopen({ prod, events: instant, state, sheetUrl });
    await mailer.queue({ kind: 'reopen', production_id: pid, to, cc, subject: mail.subject, html: mail.html, dedupe_key: keyOf('reopen', instant) });
    await mark(instant); sent++;
  }
  // Bundle: wait until the production has been quiet for bundle_minutes
  const bundle = evs.filter(x => x.notify === 'bundle');
  if (bundle.length) {
    const last = Math.max(...bundle.map(e => new Date(e.created_at).getTime()));
    if (now - last >= (cfg.bundle_minutes ?? 15) * 60000) {
      const mail = tpl.changes({ prod, events: bundle, state, sheetUrl });
      await mailer.queue({ kind: 'changes', production_id: pid, to, cc, subject: mail.subject, html: mail.html, dedupe_key: keyOf('changes', bundle) });
      await mark(bundle); sent++;
    }
  }
  return sent;
}

async function mark(events) {
  if (!events.length) return;
  await db.query('UPDATE finance_events SET notified_at = NOW() WHERE id = ANY($1::bigint[])', [events.map(e => e.id)]);
}

module.exports = { run };

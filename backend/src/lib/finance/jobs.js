/**
 * Finance schedules (Asia/Jerusalem). Each daily job is guarded by an advisory lock and a per-day dedupe,
 * so restarts or a second process never send anything twice.
 */
const db = require('../../db');
const B = require('./budget');
const config = require('./config');
const mailer = require('./mailer');
const tpl = require('./templates');
const ctx = require('./context');
const W = require('../creative/week');

const TZ = 'Asia/Jerusalem';
const today = () => W.localDate(Date.now());
const dayOfMonth = () => Number(today().slice(8, 10));
const thisMonth = () => `${today().slice(0, 7)}-01`;

async function locked(name, fn) {
  const client = await db.connect();
  try {
    const { rows } = await client.query('SELECT pg_try_advisory_lock(hashtext($1)) AS ok', [`finance:${name}`]);
    if (!rows[0].ok) return { skipped: 'locked' };
    try { return await fn(); } finally { await client.query('SELECT pg_advisory_unlock(hashtext($1))', [`finance:${name}`]); }
  } finally { client.release(); }
}
const safely = (name, fn) => () => locked(name, fn).catch(e => console.error(`[finance job] ${name}:`, e.message));

/** Missing invoices → Omer, on the reminder days (21st, 26th). */
async function missingInvoiceReminder({ force = false } = {}) {
  const cfg = await config.get();
  if (!force && !cfg.reminder_days.includes(dayOfMonth())) return { skipped: 'not a reminder day' };
  const all = await ctx.allocationAll();
  const groups = [];
  for (const { prod, lines } of all) {
    const items = ctx.missingInvoiceLines(prod, lines, thisMonth());
    if (items.length) groups.push({ prod, items });
  }
  if (!groups.length) return { sent: 0 };
  const mail = tpl.missingInvoices({ groups, cutoff: cfg.invoice_cutoff_day, paymentDay: cfg.payment_day });
  await mailer.queue({ kind: 'missing_invoices', to: cfg.reminders_to, subject: mail.subject, html: mail.html, dedupe_key: force ? null : `missing:${today()}` });
  return { sent: 1, lines: groups.reduce((s, g) => s + g.items.length, 0) };
}

/** Productions past their end date and still open → the producer, once a day (Sun–Thu). */
async function staleDateNudges({ force = false } = {}) {
  const cfg = await config.get();
  if (!cfg.nudges && !force) return { skipped: 'off' };
  const dow = W.dow(today());
  if (!force && (dow === 5 || dow === 6)) return { skipped: 'weekend' };
  const { rows } = await db.query(
    `${ctx.PROD_SELECT} WHERE locked IS NOT TRUE AND planned_end IS NOT NULL AND planned_end < $1::date ORDER BY planned_end`, [today()]);
  const stale = rows.filter(p => { const s = B.normalizeStage(p.stage); return !B.isDone(s) && s !== 'Paused'; });
  if (!stale.length) return { sent: 0 };
  const byProducer = new Map();
  for (const p of stale) {
    const to = cfg.producer_emails[p.producer] || cfg.reminders_to[0] || cfg.internal[0];
    if (!byProducer.has(to)) byProducer.set(to, []);
    byProducer.get(to).push(p);
  }
  for (const [to, list] of byProducer) {
    const mail = tpl.staleDates({ productions: list });
    await mailer.queue({ kind: 'stale_dates', to, subject: mail.subject, html: mail.html, dedupe_key: force ? null : `stale:${to}:${today()}` });
  }
  return { sent: byProducer.size, productions: stale.length };
}

/** Sunday: every change of the week to budgets finance knows about (incl. the small ones inside the 10%). */
async function weeklyDigest({ force = false } = {}) {
  const cfg = await config.get();
  if (!cfg.weekly_digest && !force) return { skipped: 'off' };
  const to = today(), from = W.addDays(to, -7);   // [from 00:00, today 00:00) Israel time — 7 days, no overlap
  const kinds = ['budget_approved', 'budget_unapproved', 'budget_increase', 'line_added', 'line_removed', 'amount_changed', 'currency_changed',
    'historical_change', 'postponed', 'completed', 'paused', 'reopened', 'locked', 'unlocked', 'rights_renewed', 'invoice_flagged', 'sync_conflict', 'buffer_warning'];
  const { rows: evs } = await db.query(
    `SELECT * FROM finance_events WHERE created_at >= $1 AND created_at < $2 AND kind = ANY($3) ORDER BY production_id, created_at`,
    [new Date(W.zonedMidnightUtc(from)).toISOString(), new Date(W.zonedMidnightUtc(to)).toISOString(), kinds]);
  const byProd = new Map();
  for (const e of evs) { if (!byProd.has(e.production_id)) byProd.set(e.production_id, []); byProd.get(e.production_id).push(e); }
  const groups = [];
  for (const [pid, list] of byProd) {
    const loaded = pid ? await ctx.loadProduction(pid) : null;
    if (!loaded || !B.financeKnows(loaded.prod)) continue;
    groups.push({ prod: loaded.prod, events: list });
  }
  const mail = tpl.digest({ fromDay: from, toDay: to, groups });
  await mailer.queue({ kind: 'weekly_digest', to: cfg.to, cc: cfg.cc, subject: mail.subject, html: mail.html, dedupe_key: force ? null : `digest:${to}` });
  return { sent: 1, productions: groups.length };
}

/** Cast rights ending within 30 days → Omer + Tomer, once per person. */
async function rightsExpiring() {
  const cfg = await config.get();
  const { rows } = await db.query(
    `SELECT c.*, c.end_date::text AS end_date, p.project_name FROM casting c LEFT JOIN productions p ON p.id = c.production_id
      WHERE c.end_date IS NOT NULL AND c.end_date >= $1::date AND c.end_date <= $1::date + 30
        AND c.renewal_alert_sent_at IS NULL AND COALESCE(c.period, '') <> 'Perpetually'`, [today()]);
  if (!rows.length) return { sent: 0 };
  const mail = tpl.rightsExpiring({ rows });
  await mailer.queue({ kind: 'rights_expiring', to: cfg.internal, subject: mail.subject, html: mail.html, dedupe_key: `rights:${today()}` });
  await db.query('UPDATE casting SET renewal_alert_sent_at = NOW() WHERE id = ANY($1)', [rows.map(r => r.id)]);
  return { sent: 1, people: rows.length };
}

/** The 25th: build the accrual draft for this month and send it to Omer + Tomer. */
async function accrualDraft({ force = false } = {}) {
  const cfg = await config.get();
  if (!force && dayOfMonth() !== cfg.accrual_day) return { skipped: 'not accrual day' };
  const accrual = require('./accrual');
  const { report } = await accrual.build(thisMonth(), { by: 'CP (scheduled)' });
  if (report.status === 'draft') await accrual.sendDraft(report);
  return { month: report.month, status: report.status };
}

function schedule(cron) {
  // Every minute: finance emails that are due, then the outbox
  cron.schedule('* * * * *', () => {
    require('./notify').run().catch(e => console.error('[finance notify]', e.message))
      .finally(() => mailer.processOutbox().catch(e => console.error('[finance outbox]', e.message)));
  }, { timezone: TZ });
  // Every 3 minutes: read the finance sheets that changed
  cron.schedule('*/3 * * * *', safely('sheets', async () => {
    const cfg = await config.get();
    if (cfg.sheet_sync) await require('./sheet').pullAll();
  }), { timezone: TZ });
  cron.schedule('0 9 * * *', safely('reminders', missingInvoiceReminder), { timezone: TZ });
  cron.schedule('30 9 * * *', safely('nudges', staleDateNudges), { timezone: TZ });
  cron.schedule('0 9 * * 0', safely('digest', weeklyDigest), { timezone: TZ });
  cron.schedule('30 8 * * *', safely('rights', rightsExpiring), { timezone: TZ });
  cron.schedule('0 10 * * *', safely('accrual', accrualDraft), { timezone: TZ });
  cron.schedule('15 16,19 * * 0-5', safely('fx', () => require('./fx').refresh()), { timezone: TZ });
  cron.schedule('30 3 * * *', safely('backup', () => require('./backup').run().then(r => console.log('[backup] database →', r.path, r.bytes))), { timezone: TZ });
}

module.exports = { schedule, missingInvoiceReminder, staleDateNudges, weeklyDigest, rightsExpiring, accrualDraft };

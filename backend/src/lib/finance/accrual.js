/**
 * Monthly accrual report — built on the 25th (or on demand) for the current month:
 * each production's expected cost for the month, invoiced vs not, and the change since the last report with the
 * logged reasons. Omer + Tomer approve it in CP; then it goes to billing@ with one CSV per company for Priority.
 */
const db = require('../../db');
const B = require('./budget');
const ctx = require('./context');
const fx = require('./fx');
const config = require('./config');
const mailer = require('./mailer');
const tpl = require('./templates');
const W = require('../creative/week');
const { companyOf } = require('./company');
const { REASON_LABEL } = require('./events');

const monthStart = (m) => `${String(m).slice(0, 7)}-01`;
const lastDay = (m) => `${m.slice(0, 8)}${String(new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate()).padStart(2, '0')}`;

async function previousReport(month) {
  const { rows } = await db.query(
    `SELECT *, month::text AS month FROM accrual_reports r WHERE r.month < $1 ORDER BY r.month DESC LIMIT 1`, [month]);
  return rows[0] || null;
}

/** Build (or rebuild while still a draft) the report for `month`. */
async function build(month, { by = null } = {}) {
  const m = monthStart(month || W.localDate(Date.now()));
  const { rows: existing } = await db.query('SELECT *, month::text AS month FROM accrual_reports WHERE month = $1', [m]);
  if (existing[0] && existing[0].status !== 'draft') return { report: existing[0], rebuilt: false };

  const prev = await previousReport(m);
  const prevRows = new Map();
  for (const c of prev?.data?.companies || []) for (const r of c.rows) prevRows.set(r.id, r);
  const since = prev?.built_at || new Date(Date.parse(`${m}T00:00:00Z`) - 31 * 86400000).toISOString();

  const all = await ctx.allocationAll();
  const { rows: evs } = await db.query(
    `SELECT * FROM finance_events WHERE created_at > $1 AND kind = ANY($2) ORDER BY created_at`,
    [since, ['line_added', 'line_removed', 'amount_changed', 'currency_changed', 'budget_increase', 'historical_change', 'postponed', 'completed', 'paused', 'reopened', 'unlocked', 'rights_renewed', 'actual_changed']]);
  const evByProd = new Map();
  for (const e of evs) { if (!evByProd.has(e.production_id)) evByProd.set(e.production_id, []); evByProd.get(e.production_id).push(e); }

  const byCompany = new Map();
  for (const { prod, months, lines } of all) {
    const cur = months[m];
    const total = Object.values(months).reduce((s, v) => s + v.usd, 0);
    const p = prevRows.get(prod.id);
    if (!cur || cur.usd < 0.5) { if (!p) continue; }       // nothing this month and never reported
    const reasons = (evByProd.get(prod.id) || [])
      .filter(e => e.reason || e.note || e.kind === 'postponed' || e.kind === 'historical_change')
      .map(e => {
        const what = e.kind === 'budget_increase' ? 'Planned Budget raised' : e.reason ? REASON_LABEL[e.reason] : { postponed: 'Postponed', historical_change: 'Past-month change', completed: 'Completed', paused: 'Paused', reopened: 'Reopened', unlocked: 'Reopened', rights_renewed: 'Rights renewal' }[e.kind] || e.kind;
        const amt = e.delta_usd != null && Math.abs(B.num(e.delta_usd)) >= 1 ? ` ${B.num(e.delta_usd) >= 0 ? '+' : '−'}$${Math.round(Math.abs(B.num(e.delta_usd))).toLocaleString('en-US')}` : '';
        return `${what}${amt}${e.approved_by ? ` (approved by ${e.approved_by})` : ''}${e.note ? ` — ${e.note}` : ''}`;
      });
    const row = {
      id: prod.id, code: B.financeCode(prod.id), name: prod.project_name, brand_id: prod.brand_id,
      stage: B.normalizeStage(prod.stage), closed: !!prod.locked,
      month_usd: B.round2(cur?.usd || 0), invoiced_usd: B.round2(cur?.invoiced_usd || 0), not_invoiced_usd: B.round2(cur?.not_invoiced_usd || 0),
      total_expected_usd: B.round2(total),
      change_usd: p ? B.round2(total - B.num(p.total_expected_usd)) : null,
      reasons: [...new Set(reasons)].slice(0, 6),
      native: nativeInMonth(lines, prod, m),
    };
    if (!byCompany.has(prod.brand_id)) byCompany.set(prod.brand_id, []);
    byCompany.get(prod.brand_id).push(row);
  }

  const companies = [...byCompany.entries()].map(([brand_id, rows]) => ({
    brand_id, company: companyOf(brand_id).short,
    rows: rows.sort((a, b) => b.month_usd - a.month_usd),
    total_usd: B.round2(rows.reduce((s, r) => s + r.month_usd, 0)),
  })).sort((a, b) => (a.brand_id === 'particle' ? -1 : b.brand_id === 'particle' ? 1 : a.company.localeCompare(b.company)));

  const names = new Map(all.map(a => [a.prod.id, a.prod.project_name]));
  const past = evs.filter(e => e.kind === 'historical_change' && B.ymdOf(e.expense_month) && B.ymdOf(e.expense_month) < m)
    .map(e => ({ brand_id: e.brand_id, id: e.production_id, code: B.financeCode(e.production_id), name: names.get(e.production_id) || e.production_id, line: e.label, month: B.ymdOf(e.expense_month), delta_usd: B.num(e.delta_usd) }));

  const q = fx.quote(lastDay(m) < W.localDate(Date.now()) ? lastDay(m) : W.localDate(Date.now()));
  const data = {
    month: m, built_by: by, rate: q.rate, rate_date: q.date,
    companies,
    total_usd: B.round2(companies.reduce((s, c) => s + c.total_usd, 0)),
    production_count: companies.reduce((s, c) => s + c.rows.filter(r => r.month_usd >= 0.5).length, 0),
    past_changes: past,
    previous_month: prev?.month || null,
  };
  const { rows } = await db.query(
    `INSERT INTO accrual_reports (month, data, built_at, approvals, status) VALUES ($1, $2, NOW(), '[]', 'draft')
     ON CONFLICT (month) DO UPDATE SET data = EXCLUDED.data, built_at = NOW(), approvals = '[]'
     WHERE accrual_reports.status = 'draft' RETURNING *, month::text AS month`, [m, JSON.stringify(data)]);
  return { report: rows[0], rebuilt: !!existing[0] };
}

/** This month's share of each line's expected cost, per currency (native amounts). */
function nativeInMonth(lines, prod, m) {
  const by = {};
  for (const li of lines) {
    const a = B.costAllocation(li, prod).find(x => x.month === m);
    if (!a) continue;
    const c = li.currency_code || 'USD';
    by[c] = (by[c] || 0) + B.financeCost(li) * a.share;
  }
  return Object.entries(by).filter(([, v]) => v >= 0.5).map(([currency, amount]) => ({ currency, amount: B.round2(amount) }));
}

const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

/** CSV for one company — the columns finance types into Priority. */
function csv(report, brandId) {
  const c = (report.data.companies || []).find(x => x.brand_id === brandId);
  const head = ['Company', 'Finance code', 'CP code', 'Production', 'Month', 'Expected cost USD', 'Invoiced USD', 'Not invoiced USD', 'Native amounts', 'Change vs last report USD', 'Reason', 'Status'];
  const rows = (c?.rows || []).map(r => [
    companyOf(brandId).short, r.code, r.id, r.name, report.month.slice(0, 7), r.month_usd.toFixed(2), r.invoiced_usd.toFixed(2), r.not_invoiced_usd.toFixed(2),
    (r.native || []).map(n => `${n.currency} ${Math.round(n.amount)}`).join(' + '), r.change_usd == null ? 'new' : r.change_usd.toFixed(2), (r.reasons || []).join('; '), r.closed ? 'Closed' : r.stage,
  ]);
  return '﻿' + [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n');
}

/** Draft ready → email the approvers a review link. */
async function sendDraft(report) {
  const cfg = await config.get();
  const url = `${(process.env.APP_URL || 'https://particlepdio.particleface.com').replace(/\/$/, '')}/finance?tab=accruals&month=${report.month.slice(0, 7)}`;
  const mail = tpl.accrual({ report, draft: true, reviewUrl: url });
  return mailer.queue({ kind: 'accrual_draft', to: cfg.report_approvers, subject: mail.subject, html: mail.html, dedupe_key: `accrual_draft:${report.id}:${new Date(report.built_at).getTime()}` });
}

/** An approver approves; when everyone has, it goes to billing@. */
async function approve(reportId, user) {
  const cfg = await config.get();
  const email = String(user.email || '').toLowerCase();
  if (!cfg.report_approvers.includes(email)) throw Object.assign(new Error('Only the report approvers can approve it'), { status: 403 });
  const client = await db.connect();
  let up;
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT *, month::text AS month FROM accrual_reports WHERE id = $1 FOR UPDATE', [reportId]);
    const r = rows[0];
    if (!r) throw Object.assign(new Error('Report not found'), { status: 404 });
    if (r.status !== 'draft') { await client.query('ROLLBACK'); return r; }
    const approvals = (r.approvals || []).filter(a => a.email !== email).concat([{ email, name: user.name, at: new Date().toISOString() }]);
    const done = cfg.report_approvers.every(a => approvals.some(x => x.email === a));
    ({ rows: [up] } = await client.query(
      `UPDATE accrual_reports SET approvals = $2, status = $3 WHERE id = $1 RETURNING *, month::text AS month`,
      [reportId, JSON.stringify(approvals), done ? 'approved' : 'draft']));
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {});
    throw e;
  } finally { client.release(); }
  if (up.status === 'approved') return send(up, user);
  return up;
}

async function send(report, user) {
  const cfg = await config.get();
  const mail = tpl.accrual({ report, draft: false });
  const attachments = (report.data.companies || []).map(c => ({
    filename: `Accruals ${report.month.slice(0, 7)} - ${companyOf(c.brand_id).short}.csv`, mime: 'text/csv',
    content_base64: Buffer.from(csv(report, c.brand_id), 'utf8').toString('base64'),
  }));
  await mailer.queue({ kind: 'accrual', to: cfg.to, cc: cfg.cc, subject: mail.subject, html: mail.html, attachments, dedupe_key: `accrual:${report.id}` });
  const { rows } = await db.query(`UPDATE accrual_reports SET status = 'sent', sent_at = NOW(), sent_by = $2 WHERE id = $1 RETURNING *, month::text AS month`, [report.id, user?.name || 'CP']);
  return rows[0];
}

module.exports = { build, approve, send, sendDraft, csv, previousReport };

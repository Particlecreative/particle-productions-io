/**
 * Finance email templates. Every email opens with the company in big bold letters —
 * Particle, Blurr and Biomella are separate companies and finance must never have to guess.
 */
const { esc } = require('./mailer');
const { companyOf, companyLine } = require('./company');
const B = require('./budget');
const { REASON_LABEL } = require('./events');

const APP = () => (process.env.APP_URL || 'https://particlepdio.particleface.com').replace(/\/$/, '');
const NAVY = '#030b2e';

// ── formatting ──
const usd = (n) => `$${Math.round(B.num(n)).toLocaleString('en-US')}`;
const signedUsd = (n) => `${B.num(n) >= 0 ? '+' : '−'}${usd(Math.abs(B.num(n)))}`;
const native = (n, cur) => `${cur === 'ILS' ? '₪' : '$'}${Math.round(B.num(n)).toLocaleString('en-US')}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m, long = false) => {
  const d = B.ymdOf(m); if (!d) return '—';
  const name = long ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][+d.slice(5, 7) - 1] : MONTHS[+d.slice(5, 7) - 1];
  return `${name} ${d.slice(0, 4)}`;
};
const day = (v) => { const d = B.ymdOf(v); return d ? `${+d.slice(8, 10)} ${MONTHS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : '—'; };
const span = (a, b) => (a || b ? `${day(a)} → ${day(b)}` : 'No dates yet');
const codeOf = (p) => B.financeCode(p.id);
const prodUrl = (p) => `${APP()}/production/${encodeURIComponent(p.id)}`;
const dashUrl = (p) => `${APP()}/finance-view${p ? `?p=${encodeURIComponent(p.id)}` : ''}`;
const reasonText = (r) => REASON_LABEL[r] || r || '—';

function companyBanner(brandId) {
  const c = companyOf(brandId);
  const notParticle = brandId && brandId !== 'particle';
  return `<div style="background:${c.color};color:#fff;padding:16px 22px;border-radius:14px 14px 0 0">
    <div style="font-size:11px;letter-spacing:.14em;opacity:.85;font-weight:700">COMPANY</div>
    <div style="font-size:30px;line-height:1.1;font-weight:900;letter-spacing:.02em">${esc(c.short.toUpperCase())}</div>
    <div style="font-size:13px;opacity:.95;margin-top:2px">${esc(companyLine(brandId))}${notParticle ? ' — <b>not paid by Particle</b>' : ''}</div>
  </div>`;
}

function button(label, url, color = '#0808f8') {
  return `<a href="${esc(url)}" style="display:inline-block;background:${color};color:#fff;text-decoration:none;font-weight:700;padding:10px 16px;border-radius:999px;font-size:13px;margin:4px 8px 4px 0">${esc(label)}</a>`;
}

function layout({ brandId, title, intro = '', body, links = [], urgent = false }) {
  return `<div style="font-family:Inter,Arial,Helvetica,sans-serif;background:#f4f5f7;padding:22px 10px;color:#111827">
  <div style="max-width:680px;margin:0 auto;background:#fff;border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.06)">
    ${brandId !== undefined ? companyBanner(brandId) : `<div style="background:${NAVY};color:#fff;padding:16px 22px;border-radius:14px 14px 0 0;font-size:13px;font-weight:700;letter-spacing:.14em">PARTICLE CP · FINANCE</div>`}
    ${urgent ? '<div style="background:#e2445c;color:#fff;padding:8px 22px;font-weight:800;font-size:13px;letter-spacing:.06em">IMMEDIATE ATTENTION — THIS CHANGES MONEY FINANCE ALREADY BOOKED</div>' : ''}
    <div style="padding:20px 22px 8px">
      <h1 style="font-size:21px;line-height:1.3;margin:0 0 6px;color:${NAVY}">${title}</h1>
      ${intro ? `<p style="margin:0 0 14px;color:#4b5563;font-size:14px;line-height:1.5">${intro}</p>` : ''}
      ${body}
      ${links.length ? `<div style="margin:18px 0 6px">${links.map(l => button(l.label, l.url, l.color)).join('')}</div>` : ''}
    </div>
    <div style="padding:12px 22px 18px;color:#9ca3af;font-size:11px;border-top:1px solid #f0f0f0">Sent automatically by Particle CP. Questions? Reply to this email.</div>
  </div></div>`;
}

const kv = (rows) => `<table style="border-collapse:collapse;width:100%;font-size:14px;margin:6px 0 12px">${rows.filter(Boolean).map(([k, v]) =>
  `<tr><td style="padding:6px 10px 6px 0;color:#6b7280;white-space:nowrap;vertical-align:top;width:170px">${esc(k)}</td><td style="padding:6px 0;color:#111827">${v}</td></tr>`).join('')}</table>`;

function table(head, rows, { align = [] } = {}) {
  const th = head.map((h, i) => `<th style="text-align:${align[i] || 'left'};padding:7px 8px;font-size:11px;letter-spacing:.06em;color:#6b7280;border-bottom:2px solid #e5e7eb;text-transform:uppercase">${esc(h)}</th>`).join('');
  const tr = rows.map(r => `<tr>${r.map((c, i) => `<td style="text-align:${align[i] || 'left'};padding:7px 8px;font-size:13px;border-bottom:1px solid #f1f1f1;vertical-align:top">${c}</td>`).join('')}</tr>`).join('');
  return `<table style="border-collapse:collapse;width:100%;margin:6px 0 14px">${th ? `<tr>${th}</tr>` : ''}${tr}</table>`;
}

const subjectPrefix = (p) => `[${companyOf(p.brand_id).short}] ${codeOf(p)} ${p.project_name}`;
const prodLine = (p) => `<b>${esc(codeOf(p))}</b> · ${esc(p.id)} · ${esc(p.project_name)}`;

// ── 1. Budget approved ──
function approved({ prod, state, perCurrency, rateQuote, plan, sheetUrl, note }) {
  const body = kv([
    ['Production', prodLine(prod)],
    ['Company', `<b>${esc(companyLine(prod.brand_id))}</b>`],
    ['Approved budget', `<b style="font-size:18px">${usd(state.planned)}</b> <span style="color:#6b7280">(${usd(state.core)} lines + ${usd(state.planned - state.core)} unexpected)</span>`],
    ['In currencies', `${perCurrency.map(c => native(c.amount, c.currency)).join(' + ') || '—'} <span style="color:#6b7280">· ₪${rateQuote.rate}/$ (Bank of Israel${rateQuote.date ? `, ${day(rateQuote.date)}` : ''})</span>`],
    ['Approved by', `${esc(prod.budget_approved_by || '—')}${prod.budget_approved_user && prod.budget_approved_user !== prod.budget_approved_by ? ` <span style="color:#6b7280">(entered by ${esc(prod.budget_approved_user)})</span>` : ''}`],
    ['Stage', esc(prod.stage || '—')],
    ['Dates', span(prod.planned_start, prod.planned_end)],
    ['Type', esc(prod.production_type || '—')],
    ['Producer', esc(prod.producer || '—')],
    ['Finance sheet', sheetUrl ? `<a href="${esc(sheetUrl)}">Open the sheet</a>` : 'No sheet yet'],
    note ? ['Note', esc(note)] : null,
  ]);
  const planHtml = plan.length
    ? `<h3 style="font-size:14px;margin:14px 0 4px;color:${NAVY}">Payments planned</h3>
       <p style="margin:0 0 4px;font-size:12px;color:#6b7280">Net+30 · invoices handed in by the 28th are paid on the 29th.</p>
       ${table(['Payment run', 'Amount', 'In currencies', 'Lines'], plan.map(x => [day(x.date), `<b>${usd(x.usd)}</b>`, x.parts.map(p => native(p.amount, p.currency)).join(' + '), String(x.count)]), { align: ['left', 'right', 'left', 'right'] })}`
    : '';
  return {
    subject: `${subjectPrefix(prod)} — budget approved: ${usd(state.planned)}`,
    html: layout({
      brandId: prod.brand_id,
      title: `New approved production: ${esc(prod.project_name)}`,
      intro: `The budget for <b>${esc(codeOf(prod))}</b> is approved. From now on CP tells you when it changes.`,
      body: body + planHtml,
      links: [{ label: 'Open in CP', url: prodUrl(prod) }, sheetUrl ? { label: 'Finance sheet', url: sheetUrl, color: '#0f9d58' } : null, { label: 'Finance dashboard', url: dashUrl(prod), color: NAVY }].filter(Boolean),
    }),
  };
}

// ── shared event rows ──
function eventRow(e) {
  const what = {
    line_added: 'Line added', line_removed: 'Line removed', amount_changed: 'Amount changed', currency_changed: 'Currency changed',
    budget_increase: 'Planned Budget raised', budget_approved: 'Budget approved', budget_unapproved: 'Approval removed',
    historical_change: 'Cost changed in a past month', reopened: 'Reopened', unlocked: 'Reopened (unlocked)', locked: 'Closed',
    postponed: 'Postponed', completed: 'Marked Completed', paused: 'Paused', actual_changed: 'Actual changed',
    rights_renewed: 'Rights renewed', paid: 'Paid', unpaid: 'Marked unpaid', sheet_edit: 'Edited in the finance sheet',
    sync_conflict: 'Sheet / CP conflict', invoice_flagged: 'Invoice flagged', dates_changed: 'Dates changed',
  }[e.kind] || e.kind.replace(/_/g, ' ');
  let change = '';
  if (e.kind === 'budget_increase') change = `${usd(e.old_value)} → <b>${usd(e.new_value)}</b> (${signedUsd(e.delta_usd)})`;
  else if (e.kind === 'historical_change') change = `${usd(e.old_value)} → <b>${usd(e.new_value)}</b> (${signedUsd(e.delta_usd)}) · ${monthName(e.expense_month)}`;
  else if (['line_added', 'line_removed', 'amount_changed', 'currency_changed'].includes(e.kind)) {
    const fmt = (v) => { if (!v) return '—'; const [a, c] = String(v).split(' '); return native(a, c); };
    change = `${fmt(e.old_value)} → <b>${fmt(e.new_value)}</b>${e.delta_usd != null ? ` (${signedUsd(e.delta_usd)})` : ''}${e.expense_month ? ` · ${monthName(e.expense_month)}` : ''}`;
  } else if (e.kind === 'postponed') {
    change = `${esc(e.old_value)} → <b>${esc(e.new_value)}</b>`;
  } else if (e.old_value != null || e.new_value != null) {
    change = `${esc(e.old_value ?? '—')} → <b>${esc(e.new_value ?? '—')}</b>`;
  }
  const why = [
    e.reason ? `<b>${esc(reasonText(e.reason))}</b>` : null,
    e.approved_by ? `approved by ${esc(e.approved_by)}${e.approved_at ? ` (${day(e.approved_at)})` : ''}` : null,
    e.note ? `“${esc(e.note)}”` : null,
    e.meta?.work_this_month === true ? 'work / cost happened this month' : e.meta?.work_this_month === false ? 'no work or cost this month' : null,
    e.link ? `<a href="${esc(e.link)}">link</a>` : null,
  ].filter(Boolean).join(' · ');
  const who = [e.user_name, e.source && e.source !== 'cp' ? `via ${e.source}` : null].filter(Boolean).join(' ');
  return [
    `<b>${esc(what)}</b>${e.label && e.kind !== 'budget_increase' ? `<br><span style="color:#6b7280">${esc(e.label)}</span>` : ''}`,
    change || '—',
    `${why || '<span style="color:#9ca3af">—</span>'}${who ? `<br><span style="color:#9ca3af;font-size:11px">${esc(who)} · ${day(e.created_at)}</span>` : ''}`,
  ];
}

// ── 2. Bundled changes (over Planned, postponed, completed, paused) ──
function changes({ prod, events, state, sheetUrl }) {
  const inc = events.filter(e => e.kind === 'budget_increase');
  const post = events.find(e => e.kind === 'postponed');
  const done = events.find(e => e.kind === 'completed');
  const paused = events.find(e => e.kind === 'paused');
  let headline;
  if (inc.length) headline = `budget raised to ${usd(inc[inc.length - 1].new_value)} (${signedUsd(inc.reduce((s, e) => s + B.num(e.delta_usd), 0))})`;
  else if (post) headline = `postponed to ${monthName(post.meta?.to_month)}`;
  else if (done) headline = 'marked Completed';
  else if (paused) headline = 'paused';
  else headline = `${events.length} change${events.length === 1 ? '' : 's'}`;
  const notes = [];
  if (post) notes.push(post.meta?.work_this_month === false
    ? `No work or cost happened in ${monthName(post.meta?.from_month)} — <b>no accrual is needed for ${monthName(post.meta?.from_month)}</b>; the production now starts in ${monthName(post.meta?.to_month)}.`
    : post.meta?.work_this_month === true ? `Some work or cost <b>did</b> happen in ${monthName(post.meta?.from_month)} before the move.` : '');
  if (done) notes.push(done.meta?.work_this_month === true ? 'Work or cost happened this month.' : done.meta?.work_this_month === false ? 'No work or cost this month.' : '');
  const body = `${notes.filter(Boolean).map(n => `<p style="font-size:14px;margin:0 0 10px">${n}</p>`).join('')}
    ${table(['What', 'Change', 'Why'], events.map(eventRow))}
    ${state ? kv([
      ['Planned Budget', `<b>${usd(state.planned)}</b>${state.approved ? '' : ' <span style="color:#6b7280">(not approved yet)</span>'}`],
      state.approved ? ['Unexpected left', `${usd(state.bufferLeft)} of ${usd(state.bufferTotal)}`] : null,
      ['Dates', span(prod.planned_start, prod.planned_end)],
      ['Stage', esc(prod.stage || '—')],
    ]) : ''}`;
  return {
    subject: `${subjectPrefix(prod)} — ${headline}`,
    html: layout({
      brandId: prod.brand_id, title: `${esc(prod.project_name)}: ${esc(headline)}`,
      intro: `${prodLine(prod)}`, body,
      links: [{ label: 'Open in CP', url: prodUrl(prod) }, sheetUrl ? { label: 'Finance sheet', url: sheetUrl, color: '#0f9d58' } : null, { label: 'Finance dashboard', url: dashUrl(prod), color: NAVY }].filter(Boolean),
    }),
  };
}

// ── 3. Reopen / past-month change (instant) ──
function reopen({ prod, events, state, sheetUrl }) {
  const kinds = new Set(events.map(e => e.kind));
  const headline = kinds.has('unlocked') || kinds.has('reopened') ? 'reopened'
    : kinds.has('rights_renewed') ? 'rights renewal adds cost'
      : kinds.has('budget_unapproved') ? 'approval removed'
        : `cost changed in ${monthName(events.find(e => e.expense_month)?.expense_month)}`;
  const total = events.filter(e => e.kind === 'historical_change').reduce((s, e) => s + B.num(e.delta_usd), 0);
  return {
    subject: `URGENT ${subjectPrefix(prod)} — ${headline}${total ? ` (${signedUsd(total)})` : ''}`,
    html: layout({
      brandId: prod.brand_id, urgent: true,
      title: `${esc(prod.project_name)}: ${esc(headline)}`,
      intro: `${prodLine(prod)} — ${prod.locked ? 'this production is <b>closed</b>' : 'finance already booked this production'}.`,
      body: table(['What', 'Change', 'Why'], events.map(eventRow)) + (state ? kv([
        ['Planned Budget', `<b>${usd(state.planned)}</b>`],
        ['Status', prod.locked ? 'Closed (locked)' : esc(prod.stage || 'Open')],
      ]) : ''),
      links: [{ label: 'Open in CP', url: prodUrl(prod) }, sheetUrl ? { label: 'Finance sheet', url: sheetUrl, color: '#0f9d58' } : null, { label: 'Finance dashboard', url: dashUrl(prod), color: NAVY }].filter(Boolean),
    }),
  };
}

// ── 4. Closed (locked) ──
function closed({ prod, totals, missing, sheetUrl, note }) {
  const body = kv([
    ['Production', prodLine(prod)],
    ['Final expected cost', `<b style="font-size:18px">${usd(totals.expectedUsd)}</b> <span style="color:#6b7280">${totals.parts.map(p => native(p.amount, p.currency)).join(' + ')}</span>`],
    ['Paid so far', usd(totals.paidUsd)],
    ['Still to pay', `<b>${usd(totals.expectedUsd - totals.paidUsd)}</b>`],
    ['Planned Budget', usd(prod.planned_budget_2026)],
    ['Closed by', esc(prod.locked_by || '—')],
    note ? ['Note', esc(note)] : null,
  ]) + (missing.length
    ? `<h3 style="font-size:14px;margin:12px 0 4px;color:#b45309">Invoices still missing (${missing.length})</h3>${table(['Supplier', 'Line', 'Amount'], missing.map(m => [esc(m.supplier || '—'), esc(m.label), native(m.amount, m.currency)]), { align: ['left', 'left', 'right'] })}`
    : '<p style="font-size:14px;color:#047857;margin:8px 0">All invoices are in.</p>')
    + '<p style="font-size:13px;color:#6b7280">All suppliers are paid within 30 days of closing. Please tick “Confirmed” on the finance dashboard.</p>';
  return {
    subject: `${subjectPrefix(prod)} — production closed: ${usd(totals.expectedUsd)}`,
    html: layout({
      brandId: prod.brand_id, title: `${esc(prod.project_name)} is closed`, body,
      links: [{ label: 'Confirm on the dashboard', url: dashUrl(prod), color: NAVY }, { label: 'Open in CP', url: prodUrl(prod) }, sheetUrl ? { label: 'Finance sheet', url: sheetUrl, color: '#0f9d58' } : null].filter(Boolean),
    }),
  };
}

// ── 5. Weekly digest ──
function digest({ fromDay, toDay, groups }) {
  const count = groups.reduce((s, g) => s + g.events.length, 0);
  const body = groups.length ? groups.map(g => `
    <div style="margin:14px 0 4px;padding:6px 10px;border-left:4px solid ${companyOf(g.prod.brand_id).color};background:#fafafa">
      <div style="font-size:11px;font-weight:800;letter-spacing:.1em;color:${companyOf(g.prod.brand_id).color}">${esc(companyOf(g.prod.brand_id).short.toUpperCase())}</div>
      <div style="font-size:15px;font-weight:700">${prodLine(g.prod)}</div>
    </div>${table(['What', 'Change', 'Why'], g.events.map(eventRow))}`).join('')
    : '<p style="font-size:14px">No budget changes this week.</p>';
  return {
    subject: `Finance weekly — ${day(fromDay)} to ${day(toDay)}: ${count} change${count === 1 ? '' : 's'}${groups.length ? ` in ${groups.length} production${groups.length === 1 ? '' : 's'}` : ''}`,
    html: layout({ title: 'This week’s budget changes', intro: 'Every change to approved budgets, past months and production dates this week — including the small ones that stayed inside the 10% unexpected.', body, links: [{ label: 'Finance dashboard', url: dashUrl(), color: NAVY }] }),
  };
}

// ── 6. Accrual report ──
function accrual({ report, draft, reviewUrl }) {
  const d = report.data;
  const sections = (d.companies || []).map(c => `
    <div style="margin:16px 0 4px;padding:8px 12px;background:${companyOf(c.brand_id).color};color:#fff;border-radius:8px;font-weight:800;letter-spacing:.06em">${esc(companyOf(c.brand_id).short.toUpperCase())} · ${usd(c.total_usd)}</div>
    ${table(['Code', 'Production', 'This month', 'Invoiced', 'Not invoiced', 'Vs last report', 'Why'],
    c.rows.map(r => [esc(r.code), esc(r.name), `<b>${usd(r.month_usd)}</b>`, usd(r.invoiced_usd), usd(r.not_invoiced_usd),
      r.change_usd == null ? '<span style="color:#9ca3af">new</span>' : (Math.abs(r.change_usd) >= 1 ? signedUsd(r.change_usd) : '—'),
      esc((r.reasons || []).join('; ') || '')]),
    { align: ['left', 'left', 'right', 'right', 'right', 'right', 'left'] })}`).join('');
  const past = (d.past_changes || []).length
    ? `<h3 style="font-size:14px;margin:16px 0 4px;color:#b45309">Changes to months already booked</h3>${table(['Company', 'Code', 'Production', 'Month', 'Change'], d.past_changes.map(x => [esc(companyOf(x.brand_id).short), esc(x.code), esc(x.name), monthName(x.month), signedUsd(x.delta_usd)]), { align: ['left', 'left', 'left', 'left', 'right'] })}`
    : '';
  const title = `${draft ? 'Draft: ' : ''}Accruals for ${monthName(report.month, true)}`;
  return {
    subject: `${draft ? '[Draft] ' : ''}Accruals for ${monthName(report.month, true)} — ${usd(d.total_usd)} across ${d.production_count} production${d.production_count === 1 ? '' : 's'}`,
    html: layout({
      title,
      intro: draft
        ? 'Please review. Once both of you approve it in CP, it goes to billing@ with the CSV.'
        : `Expected cost per production for ${monthName(report.month, true)}, whether or not invoices have arrived. USD at the Bank of Israel rate of ${day(d.rate_date)} (₪${d.rate}/$). A CSV per company is attached for Priority.`,
      body: sections + past,
      links: draft ? [{ label: 'Review & approve in CP', url: reviewUrl }] : [{ label: 'Finance dashboard', url: dashUrl(), color: NAVY }],
    }),
  };
}

// ── 7. Missing invoices (to Omer — suppliers are never contacted automatically) ──
function missingInvoices({ groups, cutoff, paymentDay }) {
  const count = groups.reduce((s, g) => s + g.items.length, 0);
  const body = groups.map(g => `<div style="margin:12px 0 2px;font-weight:700;font-size:14px">${prodLine(g.prod)} <span style="color:${companyOf(g.prod.brand_id).color};font-size:11px;font-weight:800">${esc(companyOf(g.prod.brand_id).short.toUpperCase())}</span></div>
    ${table(['Supplier', 'Line', 'Amount', 'Month'], g.items.map(m => [esc(m.supplier || '—'), esc(m.label), native(m.amount, m.currency), monthName(m.month)]), { align: ['left', 'left', 'right', 'left'] })}`).join('');
  return {
    subject: `Missing invoices — ${count} line${count === 1 ? '' : 's'} before the ${cutoff}th`,
    html: layout({
      title: `${count} invoice${count === 1 ? '' : 's'} still missing`,
      intro: `Invoices handed to Ortal by the <b>${cutoff}th</b> are paid on the <b>${paymentDay}th</b>. Pass the payment date on to these suppliers — CP doesn't contact them.`,
      body, links: [{ label: 'Open Invoices in CP', url: `${APP()}/invoices` }],
    }),
  };
}

// ── 8. Stale dates nudge (to the producer) ──
function staleDates({ productions }) {
  return {
    subject: `${productions.length} production${productions.length === 1 ? ' is' : 's are'} past ${productions.length === 1 ? 'its' : 'their'} dates — postpone or complete?`,
    html: layout({
      title: 'Postpone or complete?',
      intro: 'These productions ended on paper but are still open. Finance needs to know if work happened this month. Move the dates (postpone) or mark them Completed.',
      body: table(['Production', 'Stage', 'Ended'], productions.map(p => [`<a href="${esc(prodUrl(p))}">${prodLine(p)}</a>`, esc(p.stage || '—'), day(p.planned_end)])),
    }),
  };
}

// ── 9. Buffer warning (internal) ──
function bufferWarning({ prod, state }) {
  return {
    subject: `${subjectPrefix(prod)} — ${state.usedPct}% of the unexpected used`,
    html: layout({
      brandId: prod.brand_id, title: `${esc(prod.project_name)}: ${state.usedPct}% of the unexpected is used`,
      intro: 'Anything past the Planned Budget needs Ayal’s approval and goes to finance.',
      body: kv([['Planned Budget', usd(state.planned)], ['Lines', usd(state.core)], ['Unexpected left', `<b>${usd(state.bufferLeft)}</b> of ${usd(state.bufferTotal)}`]]),
      links: [{ label: 'Open in CP', url: prodUrl(prod) }],
    }),
  };
}

// ── 10. Cast rights expiring (internal) ──
function rightsExpiring({ rows }) {
  return {
    subject: `Cast rights ending in 30 days — ${rows.length} ${rows.length === 1 ? 'person' : 'people'}`,
    html: layout({
      title: 'Cast rights ending soon',
      intro: 'Renew in Casting & Rights to add the renewal cost to the original production (finance gets told automatically), or let them end.',
      body: table(['Name', 'Production', 'Ends', 'Renewal'], rows.map(r => [esc(r.name), esc(`${B.financeCode(r.production_id)} ${r.project_name || ''}`), day(r.end_date), r.renewal_cost ? native(r.renewal_cost, r.renewal_currency) : '<span style="color:#9ca3af">not set</span>'])),
      links: [{ label: 'Casting & Rights', url: `${APP()}/casting-rights` }],
    }),
  };
}

// ── 11. Dashboard sign-in code ──
function accessCode({ code }) {
  return {
    subject: "Your Particle finance dashboard sign-in code",
    html: layout({
      title: 'Your sign-in code',
      intro: 'Enter this code on the Particle finance dashboard. It works for 10 minutes.',
      body: `<div style="font-size:34px;font-weight:900;letter-spacing:.3em;color:${NAVY};margin:10px 0 16px">${esc(code)}</div><p style="font-size:12px;color:#9ca3af">If you didn’t ask for it, ignore this email.</p>`,
    }),
  };
}

module.exports = { approved, changes, reopen, closed, digest, accrual, missingInvoices, staleDates, bufferWarning, rightsExpiring, accessCode, usd, native, day, monthName, prodUrl, dashUrl };

/**
 * CP × Finance API (/api/finance). The approved budget, the finance log, accruals, the Finance page,
 * and the public finance dashboard (signed in with an emailed code, its own session token).
 */
import { api, apiGet, apiPost, apiPut } from './apiClient';

const enc = encodeURIComponent;
const quiet = (p) => p.catch(err => { if (err?.cancelled) return null; throw err; });

export const financeApi = {
  production: (id) => apiGet(`/finance/productions/${enc(id)}`),
  approve: (id, body) => apiPost(`/finance/productions/${enc(id)}/approve`, body),
  unapprove: (id) => quiet(apiPost(`/finance/productions/${enc(id)}/unapprove`, {})),
  shift: (id, days) => quiet(apiPost(`/finance/productions/${enc(id)}/shift`, { days })),
  createReEdit: (id, body) => apiPost(`/finance/productions/${enc(id)}/sub`, body),
  moveLines: (ids, toProductionId) => apiPost('/finance/lines/move', { ids, to_production_id: toProductionId }),
  quickNote: (text, context) => apiPost('/finance/quick-note', { text, context }),
  readInvoice: (lineId) => apiPost(`/finance/lines/${enc(lineId)}/read-invoice`, {}),
  renewRights: (castingId, body) => quiet(apiPost(`/finance/rights/${enc(castingId)}/renew`, body)),
  events: (params = {}) => apiGet(`/finance/events?${new URLSearchParams(params)}`),
  // Finance page
  config: () => apiGet('/finance/config'),
  saveConfig: (patch) => apiPut('/finance/config', patch),
  outbox: () => apiGet('/finance/outbox'),
  outboxItem: (id) => apiGet(`/finance/outbox/${enc(id)}`),
  retryEmail: (id) => apiPost(`/finance/outbox/${enc(id)}/retry`, {}),
  preview: (kind, productionId) => apiGet(`/finance/preview/${enc(kind)}${productionId ? `?production_id=${enc(productionId)}` : ''}`),
  runJob: (job) => apiPost(`/finance/run/${enc(job)}`, {}),
  cleanup: () => apiGet('/finance/cleanup'),
  recalcAll: () => apiPost('/finance/cleanup/recalc-all', {}),
  cleanupLines: (items) => apiPost('/finance/cleanup/lines', { items }),
  readAllInvoices: (limit) => apiPost('/finance/cleanup/read-invoices', { limit }),
  compareSheet: (id) => apiGet(`/finance/sheets/${enc(id)}/compare`),
  convertSheet: (id, apply) => apiPost(`/finance/sheets/${enc(id)}/convert`, { apply }),
  createSheet: (id) => apiPost(`/finance/sheets/${enc(id)}/create`, {}),
  syncSheet: (id) => apiPost(`/finance/sheets/${enc(id)}/sync`, {}),
  accruals: () => apiGet('/finance/accruals'),
  accrual: (month) => apiGet(`/finance/accruals/${enc(month)}`),
  buildAccrual: (month, sendDraft = false) => apiPost('/finance/accruals/build', { month, send_draft: sendDraft }),
  approveAccrual: (id) => apiPost(`/finance/accruals/${enc(id)}/approve`, {}),
  accrualCsvUrl: (id, brand) => `/api/finance/accruals/${enc(id)}/csv?brand=${enc(brand)}`,
  dashboard: (brand) => apiGet(`/finance/dashboard${brand ? `?brand=${enc(brand)}` : ''}`),
  yearBudgets: (year) => apiGet(`/finance/year-budgets${year ? `?year=${year}` : ''}`),
  saveYearBudget: (brandId, year, amountUsd) => apiPut('/finance/year-budgets', { brand_id: brandId, year, amount_usd: amountUsd }),
};

/** Download an authenticated file (the CSV) — the browser can't add our Bearer header to a plain link. */
export async function downloadAuthed(url, filename) {
  const t = localStorage.getItem('cp_auth_token');
  const res = await fetch(url, { headers: t ? { Authorization: `Bearer ${t}` } : {} });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ── Public finance dashboard (no CP login) ──
const SESSION_KEY = 'cp_finance_session';
export const financeSession = {
  get: () => { try { return localStorage.getItem(SESSION_KEY); } catch { return null; } },
  set: (t) => { try { localStorage.setItem(SESSION_KEY, t); } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } },
};

async function publicCall(path, { method = 'GET', body } = {}) {
  const t = financeSession.get();
  const res = await fetch(`/api/finance/public${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Finance ${t}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (res.status === 401) { financeSession.clear(); const e = new Error(data?.error || 'Sign in'); e.signin = true; throw e; }
  if (!res.ok) throw new Error(data?.error || (res.status >= 502 ? 'The server is updating — try again in a moment' : `Request failed (${res.status})`));
  return data;
}

export const financePublic = {
  requestCode: (email) => publicCall('/request-code', { method: 'POST', body: { email } }),
  verifyCode: async (email, code) => {
    const r = await publicCall('/verify-code', { method: 'POST', body: { email, code } });
    if (r?.token) financeSession.set(r.token);
    return r;
  },
  dashboard: (brand) => publicCall(`/dashboard${brand ? `?brand=${enc(brand)}` : ''}`),
  production: (id) => publicCall(`/production/${enc(id)}`),
  confirm: (id) => publicCall(`/production/${enc(id)}/confirm`, { method: 'POST', body: {} }),
  signOut: async () => { try { await publicCall('/sign-out', { method: 'POST', body: {} }); } finally { financeSession.clear(); } },
};

// ── shared formatting ──
export const REASONS = [
  ['scope_change', 'Scope change'], ['post_revision', 'Post revision'], ['rights_renewal', 'Rights renewal'],
  ['supplier_change', 'Supplier change'], ['other', 'Other'],
];
export const usd = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
export const signedUsd = (n) => `${(Number(n) || 0) >= 0 ? '+' : '−'}${usd(Math.abs(Number(n) || 0))}`;
export const nativeMoney = (n, cur) => `${cur === 'ILS' ? '₪' : '$'}${Math.round(Number(n) || 0).toLocaleString('en-US')}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayLabel = (d) => { const s = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${+s.slice(8)} ${MONTHS[+s.slice(5, 7) - 1]}` : '—'; };
export const dayYearLabel = (d) => { const s = String(d || '').slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${+s.slice(8)} ${MONTHS[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}` : '—'; };
export const monthLabel = (m) => { const s = String(m || ''); return /^\d{4}-\d{2}/.test(s) ? `${MONTHS[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}` : '—'; };
export const COMPANY = {
  particle: { short: 'Particle', color: '#0808f8' },
  blurr: { short: 'Blurr', color: '#B842A9' },
  biomella: { short: 'Biomella', color: '#1a8c5c' },
};
export const companyOf = (id) => COMPANY[id] || { short: id ? id[0].toUpperCase() + id.slice(1) : '—', color: '#64748b' };
export const financeCode = (id) => {
  const m = /^PRD(\d{2})-(\d+)(?:-(\d+))?$/i.exec(String(id || ''));
  return m ? `${m[1]}-${m[2].padStart(2, '0')}${m[3] ? `-${m[3].padStart(2, '0')}` : ''}` : String(id || '');
};
export const EVENT_LABEL = {
  budget_approved: 'Budget approved', budget_unapproved: 'Approval removed', budget_increase: 'Planned Budget raised',
  line_added: 'Line added', line_removed: 'Line removed', amount_changed: 'Amount changed', currency_changed: 'Currency changed', line_moved: 'Line moved',
  actual_changed: 'Actual changed', paid: 'Paid', unpaid: 'Marked unpaid', invoice_received: 'Invoice received', invoice_read: 'Invoice read', invoice_flagged: 'Invoice flagged',
  dates_changed: 'Dates changed', postponed: 'Postponed', completed: 'Marked Completed', paused: 'Paused', stage_changed: 'Stage changed',
  reopened: 'Reopened', locked: 'Closed', unlocked: 'Reopened (unlocked)', historical_change: 'Past-month cost changed', rights_renewed: 'Rights renewed',
  sheet_edit: 'Edited in the sheet', sync_conflict: 'Sheet / CP conflict', sheet_row_deleted: 'Row deleted in the sheet', finance_confirmed: 'Finance confirmed',
  sub_production: 'Re-edit created', buffer_warning: 'Unexpected running low', note: 'Note',
};
export const REASON_LABEL = Object.fromEntries(REASONS);
export { api };

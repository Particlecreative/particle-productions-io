/**
 * apiClient.js — JWT-aware fetch wrapper
 * All API calls go through this. Token is stored in localStorage.
 */

const BASE = '/api';

// Finance rules answer some writes with 409/423 + a `code` (e.g. "the budget is approved — why?").
// The FinancePromptHost registers here; the change is sent again with the answers, so every screen gets it for free.
const FINANCE_CODES = new Set(['reason_required', 'postpone_required', 'stage_prompt', 'unlock_reason', 'unapprove_reason', 'locked', 'dates_from_lines']);
let financePrompt = null;
export function setFinancePrompt(fn) { financePrompt = fn; }

export async function api(path, options = {}) {
  const token = localStorage.getItem('cp_auth_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(BASE + path, {
    ...options,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401) {
    localStorage.removeItem('cp_auth_token');
    // Don't redirect on public pages (signing, supplier form, CC payment form)
    const publicPaths = ['/login', '/sign/', '/supplier-form/', '/cc-payment/', '/script/', '/weekly/', '/creative-report/', '/finance-view'];
    const isPublicPage = publicPaths.some(p => window.location.pathname.startsWith(p));
    if (!isPublicPage) {
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
    }
    return;
  }

  if (res.status === 429) {
    throw new Error('Too many requests. Please wait a moment and try again.');
  }

  if ((res.status === 409 || res.status === 423) && financePrompt) {
    const text = await res.text().catch(() => '');
    let data = null;
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    if (data?.code && FINANCE_CODES.has(data.code)) {
      const answer = await financePrompt(data, { path, method: options.method || 'GET' });
      if (answer) return api(path, { ...options, body: { ...(options.body || {}), _finance: answer } });
      const err = new Error(data.error || 'Cancelled');
      err.cancelled = true;
      err.code = data.code;
      throw err;
    }
    throw new Error(text || `HTTP ${res.status}`);
  }

  if (res.status === 502 || res.status === 503 || res.status === 504) {
    throw new Error('SYSTEM_UPDATING');
  }

  if (!res.ok) {
    const text = await res.text().catch(() => 'Unknown error');
    throw new Error(text || `HTTP ${res.status}`);
  }

  // 204 No Content or empty body
  const text = await res.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/** Convenience wrappers */
export const apiGet    = (path)         => api(path, { method: 'GET' });
export const apiPost   = (path, body)   => api(path, { method: 'POST',   body });
export const apiPatch  = (path, body)   => api(path, { method: 'PATCH',  body });
export const apiPut    = (path, body)   => api(path, { method: 'PUT',    body });
export const apiDelete = (path)         => api(path, { method: 'DELETE' });

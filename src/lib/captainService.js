/**
 * Captain Caption HQ API client (/api/captain). Imported only by the lazy Captain page.
 */
const BASE = '/api/captain';

export class CaptainError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

// Local dev has no Captain backend: use the fixture unless VITE_CAPTAIN_LIVE=1 (production builds are always live)
const LIVE = !import.meta.env.DEV || import.meta.env.VITE_CAPTAIN_LIVE === '1';

async function call(path, opts = {}) {
  if (!LIVE) {
    const { fixtureCall } = await import('../components/captain/dev/fixture');
    await new Promise(r => setTimeout(r, 150));
    return fixtureCall(path, opts);
  }
  return liveCall(path, opts);
}

async function liveCall(path, { method = 'GET', body } = {}) {
  const t = localStorage.getItem('cp_auth_token');
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (res.status === 401) {
    localStorage.removeItem('cp_auth_token');
    window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
    throw new CaptainError('Session expired', 401);
  }
  if (!res.ok) throw new CaptainError(data?.error || (res.status >= 502 ? 'The server is updating — try again in a moment' : `Request failed (${res.status})`), res.status);
  return data;
}

const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o || {})) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const captainApi = {
  status: () => call('/status'),
  check: (link, opts = {}) => call('/check', { method: 'POST', body: { link, ...opts } }),
  jobs: () => call('/jobs'),
  checks: (filters) => call(`/checks${qs(filters)}`),
  check1: (id) => call(`/checks/${id}`),
  rerun: (id) => call(`/checks/${id}/rerun`, { method: 'POST' }),
  feedback: (issueId, feedback) => call(`/issues/${issueId}/feedback`, { method: 'POST', body: { feedback } }),
  events: (limit = 100) => call(`/events?limit=${limit}`),
  brain: () => call('/brain'),
  addBrain: (item) => call('/brain', { method: 'POST', body: item }),
  updateBrain: (id, patch) => call(`/brain/${id}`, { method: 'PUT', body: patch }),
  deleteBrain: (id) => call(`/brain/${id}`, { method: 'DELETE' }),
  bulkBrain: (ids, status) => call('/brain/bulk', { method: 'POST', body: { ids, status } }),
  settings: () => call('/settings'),
  saveSettings: (patch) => call('/settings', { method: 'PUT', body: patch }),
  importStatus: () => call('/import'),
  importStart: (body = {}) => call('/import/start', { method: 'POST', body }),
  frameioConnect: () => call('/frameio/connect'),
  frameioDisconnect: () => call('/frameio', { method: 'DELETE' }),
};

/**
 * Creative Weekly API client.
 * Production: /api/creative-reports. Local dev: an offline fixture store (localStorage),
 * or the real API through the Vite proxy when VITE_CREATIVE_LIVE=1.
 * Only imported by the lazy creative pages, so it never grows the main bundle.
 */
const BASE = '/api/creative-reports';
export const LIVE = !import.meta.env.DEV || import.meta.env.VITE_CREATIVE_LIVE === '1';

export class CrError extends Error {
  constructor(message, status, data) { super(message); this.status = status; this.data = data; }
}

function authHeaders() {
  const t = localStorage.getItem('cp_auth_token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

async function crFetch(path, { method = 'GET', body, keepalive = false, auth = true } = {}) {
  const res = await fetch(BASE + path, {
    method,
    keepalive,
    headers: { 'Content-Type': 'application/json', ...(auth ? authHeaders() : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  let data = null;
  const text = await res.text();
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text }; }
  if (res.status === 401 && auth) {
    localStorage.removeItem('cp_auth_token');
    window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
    throw new CrError('Session expired', 401, data);
  }
  if (!res.ok) throw new CrError(data?.error || (res.status >= 502 ? 'The server is updating — try again in a moment' : `Request failed (${res.status})`), res.status, data);
  return data;
}

let fixture = null;
async function fx() {
  if (!fixture) fixture = await import('../components/creative/dev/fixtureStore');
  return fixture;
}

export const creativeApi = {
  async list() { return LIVE ? crFetch('/') : (await fx()).list(); },
  async get(id) { return LIVE ? crFetch(`/${id}`) : (await fx()).get(id); },
  async byWeek(weekStart) { return LIVE ? crFetch(`/weeks/${weekStart}`) : (await fx()).byWeek(weekStart); },
  async generate(weekStart) { return LIVE ? crFetch('/generate', { method: 'POST', body: { week_start: weekStart } }) : (await fx()).generate(weekStart); },
  async save(id, patch, { keepalive = false } = {}) { return LIVE ? crFetch(`/${id}`, { method: 'PUT', body: patch, keepalive }) : (await fx()).save(id, patch); },
  async refresh(id) { return LIVE ? crFetch(`/${id}/refresh`, { method: 'POST', body: {} }) : (await fx()).refresh(id); },
  async importWeekly(id) { return LIVE ? crFetch(`/${id}/import-weekly`, { method: 'POST', body: {} }) : (await fx()).get(id); },
  async narrative(id, force = false) { return LIVE ? crFetch(`/${id}/narrative`, { method: 'POST', body: { force } }) : (await fx()).narrative(id); },
  async finalize(id) { return LIVE ? crFetch(`/${id}/finalize`, { method: 'POST', body: {} }) : (await fx()).setStatus(id, 'final'); },
  async unfinalize(id) { return LIVE ? crFetch(`/${id}/unfinalize`, { method: 'POST', body: {} }) : (await fx()).setStatus(id, 'draft'); },
  async versions(id) { return LIVE ? crFetch(`/${id}/versions`) : (await fx()).versions(id); },
  async saveVersion(id, label) { return LIVE ? crFetch(`/${id}/versions`, { method: 'POST', body: { label } }) : (await fx()).saveVersion(id, label); },
  async version(id, vid) { return LIVE ? crFetch(`/${id}/versions/${vid}`) : (await fx()).version(id, vid); },
  async restoreVersion(id, vid) { return LIVE ? crFetch(`/${id}/versions/${vid}/restore`, { method: 'POST', body: {} }) : (await fx()).restore(id, vid); },
  async share(id, { days = 30, rotate = false } = {}) { return LIVE ? crFetch(`/${id}/share`, { method: 'POST', body: { expires_in_days: days, rotate } }) : (await fx()).share(id, days); },
  async unshare(id) { return LIVE ? crFetch(`/${id}/share`, { method: 'DELETE' }) : (await fx()).unshare(id); },
  async mediaListing(id, refId, refresh = false) { return LIVE ? crFetch(`/${id}/media/${refId}${refresh ? '?refresh=1' : ''}`) : (await fx()).listing(id, refId); },
  async picks(id) { return LIVE ? crFetch(`/${id}/picks`) : { picks: {}, complete: true }; },
  async warm(id, itemIds) { return LIVE ? crFetch(`/${id}/media/warm`, { method: 'POST', body: itemIds ? { item_ids: itemIds } : {} }) : { warmed: 0 }; },
  async remove(id) { return LIVE ? crFetch(`/${id}`, { method: 'DELETE' }) : (await fx()).remove(id); },
  async config() { return LIVE ? crFetch('/config') : (await fx()).config(); },
  async saveTemplate({ template, fromReportId } = {}) {
    return LIVE ? crFetch('/config/template', { method: 'PUT', body: template ? { template } : { from_report_id: fromReportId } }) : (await fx()).saveTemplate(template, fromReportId);
  },
  async integrations() { return LIVE ? crFetch('/integrations') : (await fx()).integrations(); },
  async frameioConnect() { return crFetch('/frameio/connect'); },
  async frameioDisconnect() { return crFetch('/frameio', { method: 'DELETE' }); },
  // Public (no auth)
  async publicShare(token) { return LIVE ? crFetch(`/share/${token}`, { auth: false }) : (await fx()).publicShare(token); },
  async publicPicks(token) { return LIVE ? crFetch(`/share/${token}/picks`, { auth: false }) : { picks: {} }; },
  async publicListing(token, refId) { return LIVE ? crFetch(`/share/${token}/media/${refId}`, { auth: false }) : (await fx()).listing(null, refId); },
};

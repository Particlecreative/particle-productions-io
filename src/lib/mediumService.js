/**
 * MEDIUM API client (/api/medium). Imported only by the lazy Medium page.
 * Local dev uses a fixture unless VITE_MEDIUM_LIVE=1 (production builds are always live).
 */
const BASE = '/api/medium';
const LIVE = !import.meta.env.DEV || import.meta.env.VITE_MEDIUM_LIVE === '1';

export class MediumError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function call(path, { method = 'GET', body } = {}) {
  if (!LIVE) {
    const { fixtureCall } = await import('../components/medium/dev/fixture');
    await new Promise(r => setTimeout(r, 120));
    return fixtureCall(path, { method, body });
  }
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
    throw new MediumError('Session expired', 401);
  }
  if (!res.ok) throw new MediumError(data?.error || (res.status >= 502 ? 'The server is updating — try again in a moment' : `Request failed (${res.status})`), res.status);
  return data;
}

const qs = (o) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(o || {})) if (v !== undefined && v !== null && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const mediumApi = {
  overview: () => call('/overview'),
  corpus: () => call('/corpus'),
  exemplars: (f) => call(`/corpus/exemplars${qs(f)}`),
  ingest: () => call('/corpus/ingest', { method: 'POST' }),
  generate: (body) => call('/generate', { method: 'POST', body }),
  freeform: (body) => call('/freeform', { method: 'POST', body }),
  briefs: (f) => call(`/briefs${qs(f)}`),
  brief: (id) => call(`/briefs/${id}`),
  edit: (id, body) => call(`/briefs/${id}`, { method: 'PUT', body }),
  approve: (id, override_reason) => call(`/briefs/${id}/approve`, { method: 'POST', body: { override_reason } }),
  reject: (id, reason) => call(`/briefs/${id}/reject`, { method: 'POST', body: { reason } }),
  regenerate: (id, note) => call(`/briefs/${id}/regenerate`, { method: 'POST', body: { note } }),
  improve: (id) => call(`/briefs/${id}/improve`, { method: 'POST' }),
  submit: (id) => call(`/briefs/${id}/submit`, { method: 'POST' }),
  holidayPlan: (setup) => call('/holiday/plan', { method: 'POST', body: setup }),
  holidayGenerate: (setup, confirm) => call('/holiday/generate', { method: 'POST', body: { ...setup, confirm } }),
  holidayCampaigns: () => call('/holiday/campaigns'),
  holidayBatch: (batch) => call(`/holiday/${batch}`),
  holidayPreflight: (batch) => call(`/holiday/${batch}/preflight`, { method: 'POST' }),
  holidayPreflightStatus: (id) => call(`/holiday/preflight/${id}`),
  holidayApprove: (batch) => call(`/holiday/${batch}/approve`, { method: 'POST' }),
  holidayDerivatives: (batch) => call(`/holiday/${batch}/derivatives`, { method: 'POST' }),
  runAutopilot: () => call('/autopilot/run', { method: 'POST' }),
  scorecard: () => call('/scorecard'),
  staticVersion: (id) => call(`/briefs/${id}/static-version`, { method: 'POST' }),
  digestPreview: () => call('/digest/preview'),
  digestSend: () => call('/digest/send', { method: 'POST' }),
  config: () => call('/config'),
  saveConfig: (patch) => call('/config', { method: 'PUT', body: patch }),
  affinity: () => call('/affinity'),
  setBelief: (id, status, reason) => call(`/beliefs/${id}`, { method: 'PUT', body: { status, reason } }),
};

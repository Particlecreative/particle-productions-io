/**
 * Studio Control API client (/api/studio). Only imported by the lazy studio page.
 */
const BASE = '/api/studio';

export class StudioError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

async function call(path, { method = 'GET', body } = {}) {
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
    throw new StudioError('Session expired', 401);
  }
  if (!res.ok) throw new StudioError(data?.error || (res.status >= 502 ? 'The server is updating — try again in a moment' : `Request failed (${res.status})`), res.status);
  return data;
}

const LIVE = !import.meta.env.DEV || import.meta.env.VITE_STUDIO_LIVE === '1';
const fx = () => import('../components/studio/dev/fixture');

export const studioApi = {
  dashboard: async ({ from, to, force = false, lite = false }) => (LIVE ? call(`/dashboard?from=${from}&to=${to}${force ? '&force=1' : ''}${lite ? '&lite=1' : ''}`) : (await fx()).studioFixture({ from, to })),
  inspiration: async () => (LIVE ? call('/inspiration') : (await fx()).fixtureInspiration),
  setTvLink: (itemId, body) => call(`/tv-links/${itemId}`, { method: 'PUT', body }),
  patchItem: async (itemId, body) => (LIVE ? call(`/items/${itemId}`, { method: 'PATCH', body }) : { ok: true }),
  ticketForm: async () => (LIVE ? call('/ticket-form') : (await fx()).fixtureTicketForm),
  draftTicket: async (body) => (LIVE ? call('/ticket/draft', { method: 'POST', body }) : (await new Promise(r => setTimeout(r, 700)), (await fx()).fixtureDraft(body))),
  submitTicket: async (body) => (LIVE ? call('/ticket/submit', { method: 'POST', body: { ...body, confirm: true } }) : { ok: true, id: '1', url: 'https://monday.com', name: 'Test ticket' }),
  /** Per-user dashboard layout (stored like the sidebar order) */
  getLayout: async () => {
    if (!LIVE) { try { return JSON.parse(localStorage.getItem('cp_studio_layout') || 'null'); } catch { return null; } }
    const t = localStorage.getItem('cp_auth_token');
    const r = await fetch('/api/settings/view-order/studio-dashboard', { headers: t ? { Authorization: `Bearer ${t}` } : {} });
    return r.ok ? r.json() : null;
  },
  saveLayout: async (layout) => {
    if (!LIVE) { localStorage.setItem('cp_studio_layout', JSON.stringify(layout)); return; }
    const t = localStorage.getItem('cp_auth_token');
    await fetch('/api/settings/view-order/studio-dashboard', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: JSON.stringify({ order: layout }) });
  },
  connections: async () => (LIVE ? call('/connections') : (await fx()).fixtureConnections),
  connectBamboo: (subdomain, apiKey) => call('/connections/bamboohr', { method: 'PUT', body: { subdomain, api_key: apiKey } }),
  disconnectBamboo: () => call('/connections/bamboohr', { method: 'DELETE' }),
  connectTmdb: (apiKey) => call('/connections/tmdb', { method: 'PUT', body: { api_key: apiKey } }),
  disconnectTmdb: () => call('/connections/tmdb', { method: 'DELETE' }),
};

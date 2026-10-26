/**
 * Production Tracker API client (/api/tracker). Only imported by the lazy tracker page.
 */
import { updateProduction } from './dataService';

const BASE = '/api/tracker';

export class TrackerError extends Error {
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
    throw new TrackerError('Session expired', 401);
  }
  if (!res.ok) throw new TrackerError(data?.error || (res.status >= 502 ? 'The server is updating — try again in a moment' : `Request failed (${res.status})`), res.status);
  return data;
}

export const LIVE = !import.meta.env.DEV || import.meta.env.VITE_TRACKER_LIVE === '1';
const fx = () => import('../components/tracker/dev/fixture');
const q = (brandId) => `brand_id=${encodeURIComponent(brandId)}`;

export const trackerApi = {
  get: async (brandId, { force = false } = {}) => (LIVE ? call(`/?${q(brandId)}${force ? '&force=1' : ''}`) : (await fx()).fixtureGet()),
  /** Only the keys sent change: { deadline, deadline_label, notes, health, links, team } */
  save: async (brandId, productionId, patch) => (LIVE
    ? call(`/${encodeURIComponent(productionId)}?${q(brandId)}`, { method: 'PUT', body: patch })
    : (await fx()).fixtureSave(productionId, patch)),
  /** { production_id } links a Monday ticket, { decision: 'none' } = not a production, { decision: 'clear' } = back to auto */
  /** Stage lives on the production itself (PATCH /api/productions/:id, logged in its History) */
  setStage: async (productionId, stage, user) => (LIVE ? updateProduction(productionId, { stage }, user?.id, user?.name) : (await fx()).fixtureStage(productionId, stage)),
  linkTicket: async (brandId, itemId, body) => (LIVE ? call(`/tickets/${itemId}?${q(brandId)}`, { method: 'PUT', body }) : (await fx()).fixtureLink(itemId, body)),
};

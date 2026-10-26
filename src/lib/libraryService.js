/**
 * The Library API client (/api/library). Imported by the lazy Library page and the completion prompt.
 */
const BASE = '/api/library';

export class LibraryError extends Error {
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
    throw new LibraryError('Session expired', 401);
  }
  if (!res.ok) throw new LibraryError(data?.error || (res.status >= 502 ? 'The server is updating — try again in a moment' : `Request failed (${res.status})`), res.status);
  return data;
}

export const LIVE = !import.meta.env.DEV || import.meta.env.VITE_LIBRARY_LIVE === '1';
const fx = () => import('../components/library/dev/fixture');

export const libraryApi = {
  list: async (brandId) => (LIVE ? call(`/?brand_id=${encodeURIComponent(brandId)}`) : (await fx()).fxList()),
  production: async (productionId) => (LIVE ? call(`/production/${encodeURIComponent(productionId)}`) : (await fx()).fxProduction(productionId)),
  /** A pasted link → its files with suggested categories (nothing saved) */
  resolve: async (url) => (LIVE ? call('/resolve', { method: 'POST', body: { url } }) : (await fx()).fxResolve(url)),
  addItems: async (productionId, items) => (LIVE ? call(`/production/${encodeURIComponent(productionId)}/items`, { method: 'POST', body: { items } }) : (await fx()).fxAdd(productionId, items)),
  updateItem: async (id, patch) => (LIVE ? call(`/items/${id}`, { method: 'PATCH', body: patch }) : (await fx()).fxUpdate(id, patch)),
  removeItem: async (id) => (LIVE ? call(`/items/${id}`, { method: 'DELETE' }) : (await fx()).fxRemove(id)),
  downloadUrl: async (id) => (LIVE ? call(`/items/${id}/download`) : { url: 'https://www.dropbox.com/' }),
  connectSheet: async (brandId, url) => (LIVE ? call('/sources', { method: 'POST', body: { brand_id: brandId, url } }) : (await fx()).fxConnect(url)),
  syncSheet: async (id) => (LIVE ? call(`/sources/${id}/sync`, { method: 'POST' }) : { ok: true, result: { ok: true, files: 0, added: 0, updated: 0, removed: 0 } }),
  disconnectSheet: async (id) => (LIVE ? call(`/sources/${id}`, { method: 'DELETE' }) : { ok: true }),
};

export const CATEGORY = {
  tv_master: { label: 'TV master', plural: 'TV masters', hint: 'the broadcast file (.mov)' },
  digital: { label: 'Digital version', plural: 'Digital versions', hint: 'cut-downs, verticals, socials' },
  sound: { label: 'Sound stem', plural: 'Sound stems', hint: 'separate sound channels' },
  other: { label: 'Other', plural: 'Other files', hint: 'subtitles, stills, documents' },
};
export const CATEGORY_ORDER = ['tv_master', 'digital', 'sound', 'other'];

/** Open a file's direct download (Dropbox ?dl=1 / a temporary link; Drive & others open their page). */
export async function download(item) {
  const w = window.open('about:blank', '_blank');
  try {
    const { url } = await libraryApi.downloadUrl(item.id);
    if (w) w.location.href = url; else window.location.href = url;
  } catch (e) {
    if (w) w.close();
    throw e;
  }
}

/** What the completion prompt asks for, each in its own box. */
export const PROMPT_BOXES = [
  { key: 'tv', category: 'tv_master', label: 'TV master (.mov)', hint: 'the broadcast file(s)' },
  { key: 'digital', category: 'digital', label: 'Digital versions', hint: 'a folder link is fine' },
  { key: 'sound', category: 'sound', label: 'Sound stems', hint: 'separate sound channels' },
];

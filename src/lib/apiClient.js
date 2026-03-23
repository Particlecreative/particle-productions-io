/**
 * apiClient.js — JWT-aware fetch wrapper
 * All API calls go through this. Token is stored in localStorage.
 */

const BASE = '/api';

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
    // Only redirect if not already on the login page (prevents reload loop)
    if (window.location.pathname !== '/login') {
      window.location.href = '/login';
    }
    return;
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

/**
 * Your own Monday connection, page views (Team activity), the Ads Library pass, and (admins) Team activity.
 * Local dev without the API answers with small stand-ins so the pages render.
 */
import { api, apiGet, apiPost } from './apiClient';

const LIVE = !import.meta.env.DEV || import.meta.env.VITE_ME_LIVE === '1';
const devMonday = { connected: false, oauth: true, account_slug: 'particle-for-men' };

// Local preview of the live Ads Library: a pass the real server signed can be dropped in sessionStorage
// ('cp_dev_afterlife_url'); it's used once, then AfterLife's own 12-hour embed session carries on.
const AL = 'https://afterlife.particle-creative.cloud';
function devAfterlife() {
  try {
    const url = sessionStorage.getItem('cp_dev_afterlife_url');
    if (url) { sessionStorage.removeItem('cp_dev_afterlife_url'); sessionStorage.setItem('cp_dev_afterlife_live', '1'); return { url, base: AL }; }
    if (sessionStorage.getItem('cp_dev_afterlife_live')) return { url: `${AL}/embed/fresh`, base: AL };
  } catch { /* ignore */ }
  return { url: 'about:blank', base: AL };
}

export const meApi = {
  monday: () => (LIVE ? apiGet('/me/monday') : Promise.resolve({ ...devMonday })),
  connectToken: (token) => (LIVE ? apiPost('/me/monday/token', { token }) : Promise.resolve({ ...devMonday, connected: true, name: 'Dev User', method: 'token' })),
  connectUrl: () => (LIVE ? apiGet('/me/monday/connect') : Promise.resolve({ url: 'https://auth.monday.com/oauth2/authorize?dev=1' })),
  disconnect: () => (LIVE ? api('/me/monday', { method: 'DELETE' }) : Promise.resolve({ ok: true })),
  pageView: (page) => (LIVE ? apiPost('/me/activity', { page }).catch(() => null) : Promise.resolve(null)),
  afterlifePass: () => (LIVE ? apiGet('/growth/afterlife-pass') : Promise.resolve(devAfterlife())),
  activity: (days = 30, user = '') => (LIVE ? apiGet(`/activity?days=${days}${user ? `&user=${encodeURIComponent(user)}` : ''}`) : Promise.resolve({ days, people: [], events: [], daily: [], monday: [] })),
};

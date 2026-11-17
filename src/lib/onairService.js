/**
 * On Air API client (/api/onair). Local dev has no API: a made-up fixture stands in (VITE_ONAIR_LIVE=1 → the real one).
 * Only imported by the lazy On Air page.
 */
import { apiGet, apiPost } from './apiClient';

export const LIVE = !import.meta.env.DEV || import.meta.env.VITE_ONAIR_LIVE === '1';
const fx = () => import('../components/onair/fixture');

export const onairApi = {
  tv: async () => (LIVE ? apiGet('/onair/tv') : (await fx()).tvFixture()),
  refresh: async () => (LIVE ? apiPost('/onair/tv/refresh', {}) : { ...(await fx()).tvFixture(), refreshed: { ok: true, added: 0 } }),
  media: async (force = false) => (LIVE ? apiGet(`/onair/media${force ? '?force=1' : ''}`) : (await fx()).mediaFixture()),
  /** Settings' Google connection, asked again with Gmail read access → { url } */
  googleConnect: () => apiGet('/drive/auth'),
};

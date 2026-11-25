/**
 * Studio passwords — the Access Passwords boards on Monday, live (backend/src/lib/studio/passwords.js).
 * Local dev without the API answers with obviously-sample logins so the page renders.
 */
import { apiGet, apiPost, apiPatch } from './apiClient';

const LIVE = !import.meta.env.DEV || import.meta.env.VITE_PASSWORDS_LIVE === '1';

const dev = (() => {
  const groups = [{ id: 'g1', title: 'Creative Studio', color: '#579bfc' }, { id: 'g2', title: 'Footage', color: '#00c875' }, { id: 'g3', title: 'AI Assets', color: '#a25ddc' }, { id: 'g4', title: 'Media', color: '#fdab3d' }, { id: 'g5', title: 'Production', color: '#e2445c' }];
  const rows = [
    ['Sample Stock Music', 'g1', 'https://example.com/music', 'studio@example.com', '12th', 0, 29],
    ['Sample Fonts', 'g1', 'https://example.com/fonts', 'design@example.com', '', 0, 0],
    ['Sample Footage Library', 'g2', 'https://example.org/footage', 'studio@example.com', '3rd', 120, 199],
    ['Sample AI Video', 'g3', 'https://example.net/ai', 'ai@example.com', '20th', 3000, 95],
    ['Sample AI Voice', 'g3', 'https://example.net/voice', 'ai@example.com', '1st', 500, 22],
    ['Sample Ads Manager', 'g4', 'https://example.com/ads', 'media@example.com', '', 0, 0],
    ['Sample Casting Portal', 'g5', 'https://example.org/casting', 'prod@example.com', '', 0, 0],
  ].map(([name, group, link, login, renewal, credits, monthly], i) => ({ id: String(1000 + i), name, group, link, login, has_password: true, people: i % 2 ? ['1'] : ['2'], flag: i % 3 === 0, renewal, credits, monthly, updated_at: new Date().toISOString() }));
  return { groups, rows, people: { 1: { id: '1', name: 'Sample Person A' }, 2: { id: '2', name: 'Sample Person B' } } };
})();

export const passwordsApi = {
  list: async (board = 'particle', force = false) => {
    if (!LIVE) return { board: { key: board, name: board === 'blurr' ? 'Blurr' : 'Particle' }, boards: [{ key: 'particle', name: 'Particle' }, { key: 'blurr', name: 'Blurr' }], groups: dev.groups, flag_title: 'Password Changed', people: dev.people, rows: board === 'blurr' ? dev.rows.slice(0, 3) : dev.rows, money: true };
    return apiGet(`/passwords?board=${encodeURIComponent(board)}${force ? '&force=1' : ''}`);
  },
  reveal: async (board, id, action = 'reveal') => (LIVE ? apiPost(`/passwords/${board}/${id}/reveal`, { action }) : { password: 'sample-password-123' }),
  update: async (board, id, patch) => (LIVE ? apiPatch(`/passwords/${board}/${id}`, patch) : { ok: true }),
  create: async (board, body) => (LIVE ? apiPost(`/passwords/${board}`, body) : { id: String(Date.now()) }),
  history: async (item = null) => (LIVE ? apiGet(`/passwords/history${item ? `?item=${item}` : ''}`) : { history: [{ at: new Date().toISOString(), user_name: 'Sample Person A', item_name: 'Sample Fonts', action: 'copy', board: 'particle' }] }),
};

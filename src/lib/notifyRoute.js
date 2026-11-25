// Where a notification takes you (25 Nov 2026). Server-made ones carry link "task:<monday item id>" (a Studio task),
// a page path ("/on-air"), or nothing (old ones: production / task / casting by type). Pure.

/** → { to } (an app path) or { href } (outside, e.g. the Monday item) or null. */
export function routeOf(n, role = '') {
  const link = String(n?.link || '');
  const m = link.match(/^task:(\d+)$/);
  if (m) {
    if (role === 'Creative') return { to: `/my-studio?task=${m[1]}` };
    if (['Admin', 'Editor', 'Studio'].includes(role)) return { to: `/studio?task=${m[1]}` };
    return n?.meta?.monday_url ? { href: n.meta.monday_url } : null;
  }
  if (link.startsWith('/')) return { to: link };
  if (/^https?:\/\//.test(link)) return { href: link };
  const t = String(n?.type || '');
  if (t.startsWith('task')) return { to: '/tasks' };
  if (t.startsWith('casting')) return { to: '/casting-rights' };
  if (n?.production_id) return { to: `/production/${n.production_id}` };
  return null;
}

/** Which tab of the notifications panel a notification belongs to. */
export function groupOf(n) {
  const t = String(n?.type || '');
  if (t === 'mention') return 'mentions';
  if (['status', 'comment', 'assigned', 'requests'].includes(t)) return 'tasks';
  if (t === 'ad_live') return 'ads';
  return 'other';
}

export const NOTIFY_LOOK = {
  mention: { emoji: '@', color: '#0808f8', label: 'Tagged you' },
  comment: { emoji: '💬', color: '#00a3a3', label: 'Update' },
  status: { emoji: '⇢', color: '#579bfc', label: 'Status' },
  requests: { emoji: '✓', color: '#00c875', label: 'Your ticket' },
  assigned: { emoji: '＋', color: '#a25ddc', label: 'New task' },
  ad_live: { emoji: '🎬', color: '#ff7a00', label: 'On Meta' },
};

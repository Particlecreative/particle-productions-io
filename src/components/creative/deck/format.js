// Pure formatting + colour helpers for the Creative Weekly deck.

const nf = new Intl.NumberFormat('en-US');
export const fmtNum = (n) => (n == null || Number.isNaN(n) ? '–' : nf.format(n));

export function fmtDays(n) {
  if (n == null) return '–';
  if (n < 1) return `${Math.max(1, Math.round(n * 24))}h`;
  return `${Math.round(n * 10) / 10}d`;
}

export function fmtHours(h) {
  if (h == null) return '–';
  return h >= 10 ? `${Math.round(h)}h` : `${Math.round(h * 10) / 10}h`;
}

export const plural = (n, one, many = `${one}s`) => `${fmtNum(n)} ${n === 1 ? one : many}`;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
export function shortDate(s) {
  const p = parseYmd(s);
  return p ? `${MONTHS[p.m - 1]} ${p.d}` : '';
}
export function dayLabel(s) {
  const p = parseYmd(s);
  if (!p) return '';
  return DAYS[new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay()];
}
export function addDays(s, n) {
  const p = parseYmd(s);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}
/** Sunday (Israel work week) of today, in local time. */
export function sundayOf(date = new Date()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() - date.getDay());
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function weekLabelOf(weekStart) {
  return `${shortDate(weekStart)} – ${shortDate(addDays(weekStart, 4))}`;
}
export function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d}d ago` : shortDate(new Date(iso).toISOString().slice(0, 10));
}
export function timeOfDay(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function initials(name) {
  const parts = String(name || '').replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
export function displayName(name) {
  const n = String(name || '');
  if (n.includes('@')) {
    const local = n.split('@')[0].split(/[._-]+/).filter(Boolean);
    return local.map(p => p[0].toUpperCase() + p.slice(1)).join(' ');
  }
  return n;
}
export function firstName(name) { return displayName(name).split(' ')[0]; }

// ── Colour ────────────────────────────────────────────────────────────────
function hexToRgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}
function luminance([r, g, b]) {
  const c = [r, g, b].map(v => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
/** Lighten (on dark) or darken (on light) a colour until it reaches `min` contrast against `bg`. */
export function ensureContrast(hex, bg = '#030b2e', min = 3) {
  const c = hexToRgb(hex);
  const b = hexToRgb(bg);
  if (!c || !b) return hex || '#8c93ff';
  const towards = luminance(b) < 0.5 ? [255, 255, 255] : [0, 0, 0];
  let cur = c;
  for (let i = 0; i < 12 && contrast(cur, b) < min; i++) {
    cur = cur.map((v, k) => v + (towards[k] - v) * 0.18);
  }
  return rgbToHex(cur);
}
export function withAlpha(hex, a) {
  const c = hexToRgb(hex);
  return c ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})` : `rgba(140, 147, 255, ${a})`;
}

const PALETTE = ['#4a55ff', '#00c875', '#fdab3d', '#ff5ac4', '#66ccff', '#9d50dd', '#cab641', '#e2445c', '#579bfc', '#ff7575'];
export function paletteColor(i) { return PALETTE[i % PALETTE.length]; }
export function hashColor(s) {
  let h = 0;
  for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

// Format badge from Monday "Sizes" / type labels / file names
export function formatBadge(item) {
  const t = `${item?.type?.label || ''} ${item?.title || ''}`;
  if (/9x16|9:16|reel|stor(y|ies)|tiktok/i.test(t)) return '9:16';
  if (/16x9|16:9|tv|youtube|long form/i.test(t)) return '16:9';
  if (/1x1|1:1|square/i.test(t)) return '1:1';
  if (/4x5|4:5/i.test(t)) return '4:5';
  return null;
}

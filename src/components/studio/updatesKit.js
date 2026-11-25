// Pure helpers for a task's conversation panel (TaskUpdates.jsx) — no DOM, no React, so they're tested directly.

/**
 * Monday's automatic "Status changed" update has no body, only text: "<item name> Status was changed from Working on it
 * to Live". → { column, from, to } or null. Labels can contain " to ", so a split where both sides are real labels wins.
 */
export function parseChange(u, itemName = '', labels = []) {
  if (String(u?.html || '').replace(/<[^>]*>/g, '').replace(/[\s﻿]/g, '')) return null;   // a real update
  let t = String(u?.text || '').replace(/﻿/g, '').trim();
  if (!t) return null;
  const name = String(itemName || '').trim();
  const prefixed = name && t.startsWith(name);
  if (prefixed) t = t.slice(name.length).trim();
  const m = t.match(/^(.+?) was changed from ([\s\S]*)$/);
  if (!m) return null;
  let column = m[1].trim();
  if (!prefixed && /\bstatus$/i.test(column)) column = 'Status';   // renamed item: keep only the column
  const rest = m[2];
  const splits = [];
  for (let i = rest.indexOf(' to '); i >= 0; i = rest.indexOf(' to ', i + 1)) splits.push([rest.slice(0, i).trim(), rest.slice(i + 4).trim()]);
  if (rest.startsWith('to ')) splits.unshift(['', rest.slice(3).trim()]);   // from nothing
  if (!splits.length) return null;
  const known = new Set(labels.map(l => String(l).toLowerCase()));
  const has = (s) => !s || known.has(s.toLowerCase());
  const best = splits.find(([a, b]) => has(a) && has(b)) || splits.find(([a, b]) => known.has(b.toLowerCase()) || known.has(a.toLowerCase())) || splits[0];
  return { column, from: best[0], to: best[1] };
}

export function fileSize(n) {
  const b = Number(n) || 0;
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${Math.round(b / 1024)} KB`;
  return `${(b / 1024 / 1024).toFixed(b < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

const KINDS = [
  [/^pdf$/, 'PDF', '#e2445c'], [/^(ai|eps)$/, 'AI', '#ff7a00'], [/^(psd|psb)$/, 'PSD', '#1e88e5'], [/^(fig|sketch|xd)$/, 'DESIGN', '#a25ddc'],
  [/^(mp4|mov|m4v|webm|avi|mkv)$/, 'VIDEO', '#7e3af2'], [/^(mp3|wav|aac|m4a)$/, 'AUDIO', '#00a3a3'], [/^(zip|rar|7z)$/, 'ZIP', '#676879'],
  [/^(docx?|pages|txt|rtf)$/, 'DOC', '#2b6cb0'], [/^(xlsx?|csv|numbers)$/, 'SHEET', '#00a359'], [/^(pptx?|key)$/, 'SLIDES', '#d97706'],
  [/^(png|jpe?g|gif|webp|avif|bmp|heic|svg)$/, 'IMAGE', '#0808f8'],
];
/** A file's badge: short label + colour. */
export function fileKind(ext) {
  const e = String(ext || '').toLowerCase();
  const k = KINDS.find(([re]) => re.test(e));
  return k ? { label: k[1], color: k[2] } : { label: (e || 'FILE').slice(0, 4).toUpperCase(), color: '#676879' };
}

/** The update on Monday: the item link + /posts/<update id>. */
export function updateLink(mondayUrl, updateId) {
  const base = String(mondayUrl || '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  return base ? `${base}/posts/${updateId}` : '';
}

/** Day heading for the activity timeline: Today / Yesterday / Mon, Nov 23 (in Israel time). */
export function dayLabel(iso, now = Date.now()) {
  const day = (t) => new Date(t).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const d = day(iso);
  if (d === day(now)) return 'Today';
  if (d === day(now - 86400000)) return 'Yesterday';
  return new Date(iso).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Jerusalem' });
}

/** Search + filter over updates (text, author, file names, replies). filter: all | comments | changes. */
export function filterUpdates(list, { q = '', filter = 'all', isChange = () => false, textOf = (u) => u.text } = {}) {
  const s = String(q || '').trim().toLowerCase();
  return (list || []).filter(u => {
    const change = isChange(u);
    if (filter === 'comments' && change) return false;
    if (filter === 'changes' && !change) return false;
    if (!s) return true;
    const hay = [textOf(u), u.by?.name, ...(u.files || []).map(f => f.name), ...(u.replies || []).flatMap(r => [r.text, r.by?.name])].join(' ').toLowerCase();
    return hay.includes(s);
  });
}

/** Pinned first, then newest first (Monday's order). */
export function orderUpdates(list) {
  return [...(list || [])].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || String(b.at || '').localeCompare(String(a.at || '')));
}

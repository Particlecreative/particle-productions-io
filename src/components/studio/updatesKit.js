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

const dec = (s) => { try { return decodeURIComponent(String(s || '').replace(/\+/g, ' ')); } catch { return String(s || ''); } };
const nice = (s) => dec(s).replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();
const noExt = (s) => String(s || '').replace(/\.[a-z0-9]{2,5}$/i, '');

/**
 * What a link is, in words (Tomer, 25 Nov 2026: "make Dropbox, Frame.io and Figma links easier to read"):
 * { kind, label, sub } — e.g. Dropbox · "Gravité Cologne", Figma · "Face Wash Packaging", Video · "reference.mp4".
 */
export function linkInfo(href) {
  let u;
  try { u = new URL(String(href || '').trim()); } catch { return { kind: 'web', label: 'Link', sub: '' }; }
  const host = u.hostname.replace(/^www\./, '').toLowerCase();
  const parts = u.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1] || '';
  const ext = (last.match(/\.([a-z0-9]{2,5})$/i)?.[1] || '').toLowerCase();
  if (/(^|\.)dropbox(usercontent)?\.com$/.test(host)) {
    const named = ['fo', 'fi', 'sh', 's'].includes(parts[0]) || (parts[0] === 'scl' && ['fo', 'fi'].includes(parts[1]));
    const kindWord = parts.includes('fi') || (parts[0] === 's' && ext) ? 'file' : 'folder';
    const name = named && parts.length >= (parts[0] === 'scl' ? 4 : 3) ? nice(noExt(last)) : '';
    return { kind: 'dropbox', label: 'Dropbox', sub: name || kindWord };
  }
  if (host === 'f.io' || /(^|\.)frame\.io$/.test(host)) {
    const sub = host === 'f.io' ? 'review link' : parts.includes('reviews') ? 'review' : parts.includes('presentations') ? 'presentation' : parts.includes('project') || parts.includes('projects') ? 'project' : 'files';
    return { kind: 'frame', label: 'Frame.io', sub };
  }
  if (/(^|\.)figma\.com$/.test(host)) {
    const i = parts.findIndex(p => ['file', 'design', 'proto', 'board', 'slides', 'make'].includes(p));
    const name = i >= 0 && parts[i + 2] ? nice(parts[i + 2]) : '';
    return { kind: 'figma', label: 'Figma', sub: name || (parts[i] === 'proto' ? 'prototype' : 'file') };
  }
  if (host === 'docs.google.com') {
    if (parts[0] === 'presentation') return { kind: 'gslides', label: 'Google Slides', sub: '' };
    if (parts[0] === 'spreadsheets') return { kind: 'gsheet', label: 'Google Sheet', sub: '' };
    if (parts[0] === 'forms') return { kind: 'gdoc', label: 'Google Form', sub: '' };
    return { kind: 'gdoc', label: 'Google Doc', sub: '' };
  }
  if (host === 'drive.google.com') return { kind: 'gdrive', label: 'Google Drive', sub: parts.includes('folders') ? 'folder' : 'file' };
  if (/^(mp4|mov|m4v|webm)$/.test(ext)) return { kind: 'video', label: 'Video', sub: ext === 'mp4' && last.length > 40 ? `reference .${ext}` : dec(last) };
  if (/^(png|jpe?g|gif|webp)$/.test(ext)) return { kind: 'image', label: 'Image', sub: last.length > 40 ? `.${ext}` : dec(last) };
  if (ext === 'pdf') return { kind: 'pdf', label: 'PDF', sub: last.length > 44 ? '' : nice(noExt(last)) };
  if (/(^|\.)monday\.com$/.test(host)) return { kind: 'monday', label: 'Monday', sub: parts.includes('pulses') || parts.includes('projects') ? 'ticket' : parts.includes('boards') ? 'board' : '' };
  if (/(^|\.)facebook\.com$/.test(host) && parts[0] === 'ads') return { kind: 'meta', label: 'Meta Ad Library', sub: '' };
  if (/(^|\.)upspring\.ai$/.test(host)) return { kind: 'upspring', label: 'Upspring', sub: '' };
  if (host === 'youtu.be' || /(^|\.)youtube\.com$/.test(host)) return { kind: 'youtube', label: 'YouTube', sub: '' };
  if (/(^|\.)instagram\.com$/.test(host)) return { kind: 'instagram', label: 'Instagram', sub: '' };
  if (/(^|\.)tiktok\.com$/.test(host)) return { kind: 'tiktok', label: 'TikTok', sub: '' };
  if (/(^|\.)claude\.ai$/.test(host)) return { kind: 'web', label: 'Claude', sub: 'artifact' };
  return { kind: 'web', label: host, sub: parts[0] && parts[0].length < 28 ? nice(parts[0]) : '' };
}

/** "VIDEO CONCEPT" → "Video concept"; "Est. Duration" stays. */
export function labelCase(s) {
  const t = String(s || '').replace(/[:：]\s*$/, '').trim();
  return t === t.toUpperCase() && /[A-Z]/.test(t) ? t.charAt(0) + t.slice(1).toLowerCase() : t;
}

/** "Department: Marketing/Media | Product: Face Cream | Sizes: 9x16" → [[k, v], …] when it really is a facts line (≥ 2 pairs). */
export function factsOf(text) {
  const parts = String(text || '').split(/\s+\|\s+/).map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const pairs = parts.map(p => p.match(/^([^:]{1,32}):\s*(.+)$/)).filter(Boolean).map(m => [labelCase(m[1]), m[2].trim()]);
  return pairs.length >= 2 && pairs.length >= parts.length - 1 ? pairs : null;
}

const BRIEF_RE = /\b(task name|video concept|concept|hook|script|brief by medium|department|deliverables?|sizes? needed|references?)\b/i;
/** Which update is the brief: the oldest one with real substance (not a status line). */
export function briefOf(list, isChange = () => false) {
  const cands = [...(list || [])].filter(u => !isChange(u)).sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
  const plain = (u) => String(u.text || '').replace(/﻿/g, '').trim();
  return cands.find(u => plain(u).length >= 160 || (BRIEF_RE.test(plain(u)) && plain(u).length >= 60)) || null;
}

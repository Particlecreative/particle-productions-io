/**
 * Ticket sources — files people add in the AI ticket creator and links in their messages, turned into something
 * Claude can read (images, PDFs, text), plus the files to attach to the Monday ticket.
 *
 * Files: stored 14 days in studio_ticket_files (the API container has no disk of its own).
 * Links: Google Docs / Sheets / Slides / Drive through the connected Google account (private files work),
 * Dropbox through the team account (a folder becomes its file list), YouTube by title, anything else by a
 * guarded fetch (public addresses only, size and time limits).
 */
const dns = require('dns').promises;
const net = require('net');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const mammoth = require('mammoth');
const db = require('../../db');
const monday = require('../monday');

const MAX_FILE = 50 * 1024 * 1024;
const MAX_READ = 25 * 1024 * 1024; // biggest PDF / file we hand to Claude
const MAX_IMAGE = 3.7 * 1024 * 1024; // base64 must stay under Claude's 5 MB image limit
const MAX_TEXT = 60000;
const CLAUDE_IMAGES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const TEXT_EXT = new Set(['txt', 'md', 'csv', 'tsv', 'json', 'srt', 'vtt', 'html', 'htm', 'xml']);
const MIME_BY_EXT = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv', md: 'text/markdown' };

const bad = (msg) => Object.assign(new Error(msg), { status: 400 });
const extOf = (n) => (String(n || '').split('.').pop() || '').toLowerCase();
const mb = (n) => (n ? `${Math.round((n / 1048576) * 10) / 10} MB` : '');

function kindOf(name, mime = '') {
  const e = extOf(name);
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'tif', 'tiff', 'bmp'].includes(e)) return 'image';
  if (mime === 'application/pdf' || e === 'pdf') return 'pdf';
  if (e === 'docx' || mime.includes('wordprocessingml')) return 'docx';
  if (mime.startsWith('text/') || mime.includes('json') || TEXT_EXT.has(e)) return 'text';
  if (mime.startsWith('video/') || ['mp4', 'mov', 'm4v', 'webm', 'avi', 'mkv'].includes(e)) return 'video';
  return 'other';
}
const readableKind = (k) => ['image', 'pdf', 'docx', 'text'].includes(k);

/** Page text: title, description and visible text (scripts, styles and tags removed). */
function htmlText(html) {
  const pick = (re) => (html.match(re) || [])[1] || '';
  const decode = (s) => s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  const title = decode(pick(/<title[^>]*>([^<]{1,300})<\/title>/i)).trim();
  const desc = decode(pick(/<meta[^>]+(?:name|property)=["'](?:og:)?description["'][^>]+content=["']([^"']{1,600})/i)).trim();
  const image = pick(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)/i);
  const body = decode(html
    .replace(/<(script|style|noscript|svg|template|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t\f\r]+/g, ' ').replace(/\n\s*\n+/g, '\n\n').trim();
  return { title, image, text: [desc, body].filter(Boolean).join('\n\n').slice(0, 20000) };
}

async function textOf(kind, buffer, name) {
  if (kind === 'docx') return (await mammoth.extractRawText({ buffer })).value || null;
  if (kind === 'text') {
    const t = buffer.toString('utf8');
    return /\.html?$/i.test(name || '') || /^\s*<!doctype html|^\s*<html/i.test(t) ? htmlText(t).text : t;
  }
  return null;
}

/** Any image → JPEG at most 1568 px on the long side (HEIC, TIFF, huge PNGs…). */
function toJpeg(buffer) {
  return new Promise((resolve, reject) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-'));
    const inp = path.join(dir, 'in');
    const out = path.join(dir, 'out.jpg');
    fs.writeFileSync(inp, buffer);
    execFile('ffmpeg', ['-y', '-loglevel', 'error', '-i', inp, '-vf', "scale='min(1568,iw)':'min(1568,ih)':force_original_aspect_ratio=decrease", '-frames:v', '1', '-q:v', '4', out],
      { timeout: 30000 }, (err) => {
        try { if (err) reject(err); else resolve(fs.readFileSync(out)); } catch (e) { reject(e); } finally { fs.rmSync(dir, { recursive: true, force: true }); }
      });
  });
}
async function claudeImage(buffer, mime) {
  if (CLAUDE_IMAGES.has(mime) && buffer.length <= MAX_IMAGE) return { data: buffer, mime };
  try { return { data: await toJpeg(buffer), mime: 'image/jpeg' }; } catch { return null; }
}

// ── Uploaded files ─────────────────────────────────────────────────────────
function describe(r) {
  return { id: r.id, name: r.name, mime: r.mime, size: r.size, kind: r.kind, readable: readableKind(r.kind) && (r.kind !== 'docx' || !!r.text_content) };
}

async function saveUpload({ name, mime, buffer, user }) {
  if (!buffer?.length) throw bad('That file is empty');
  if (buffer.length > MAX_FILE) throw bad('Files can be up to 50 MB');
  const cleanName = String(name || 'file').replace(/[\\/\0]/g, '_').slice(0, 200);
  const type = mime && mime !== 'application/octet-stream' ? mime : (MIME_BY_EXT[extOf(cleanName)] || 'application/octet-stream');
  const kind = kindOf(cleanName, type);
  let text = null;
  try { text = await textOf(kind, buffer, cleanName); } catch { text = null; }
  await db.query("DELETE FROM studio_ticket_files WHERE created_at < NOW() - INTERVAL '14 days'").catch(() => {});
  const { rows } = await db.query(
    'INSERT INTO studio_ticket_files (name, mime, size, kind, bytes, text_content, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, mime, size, kind, text_content',
    [cleanName, type, buffer.length, kind, buffer, text ? text.slice(0, MAX_TEXT * 2) : null, user?.name || user?.email || null]
  );
  return describe(rows[0]);
}

async function filesByIds(ids) {
  const clean = [...new Set((Array.isArray(ids) ? ids : []).map(String))].filter(id => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 20);
  if (!clean.length) return [];
  const { rows } = await db.query('SELECT id, name, mime, size, kind, bytes, text_content FROM studio_ticket_files WHERE id = ANY($1::uuid[])', [clean]);
  return clean.map(id => rows.find(r => r.id === id)).filter(Boolean);
}

// ── Links ─────────────────────────────────────────────────────────────────
const URL_RE = /https?:\/\/[^\s<>"'`]+/g;
function urlsIn(messages, max = 8) {
  const out = [];
  for (const m of messages || []) {
    if (m.role !== 'user') continue;
    for (let u of String(m.content || '').match(URL_RE) || []) {
      u = u.replace(/[.,;:!?)\]}]+$/, '');
      if (!out.includes(u)) out.push(u);
    }
  }
  return out.slice(0, max);
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const x = ip.toLowerCase();
  if (x.startsWith('::ffff:')) return isPrivateIp(x.slice(7));
  return x === '::' || x === '::1' || x.startsWith('fc') || x.startsWith('fd') || x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb');
}
async function assertPublic(rawHost) {
  const host = String(rawHost).replace(/^\[|\]$/g, ''); // IPv6 literals come bracketed
  const addrs = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('That address isn’t public');
}

/** Fetch a public web address: http(s) only, normal ports, every redirect re-checked, at most `maxBytes`. */
async function safeFetch(url, { maxBytes = 6 * 1024 * 1024 } = {}) {
  let current = url;
  for (let hop = 0; hop < 4; hop++) {
    const u = new URL(current);
    if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only web links can be read');
    if (u.port && !['80', '443'].includes(u.port)) throw new Error('Unusual port');
    await assertPublic(u.hostname);
    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ParticleCP/1.0)', Accept: 'text/html,application/pdf,image/*,*/*;q=0.5' },
      signal: AbortSignal.timeout(10000),
    });
    if ([301, 302, 303, 307, 308].includes(res.status)) {
      const loc = res.headers.get('location');
      if (!loc) throw new Error('Broken redirect');
      current = new URL(loc, current).toString();
      continue;
    }
    if (!res.ok) throw new Error(`The page answered ${res.status}`);
    if (Number(res.headers.get('content-length') || 0) > maxBytes) throw new Error(`Too large to read (${mb(Number(res.headers.get('content-length')))})`);
    const chunks = [];
    let total = 0;
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > maxBytes) throw new Error('Too large to read');
      chunks.push(chunk);
    }
    return { buffer: Buffer.concat(chunks), mime: (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase(), url: current };
  }
  throw new Error('Too many redirects');
}

async function readGoogle(url) {
  const { drive } = await require('../../routes/scripts').getGoogleDrive();
  const doc = url.match(/docs\.google\.com\/(document|spreadsheets|presentation)\/d\/([\w-]{20,})/);
  const file = url.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{20,})/);
  if (!doc && !file) return { ok: false, title: 'Google', note: 'This kind of Google link isn’t supported (Docs, Sheets, Slides and Drive files are)' };
  const id = doc ? doc[2] : file[1];
  let meta;
  try {
    meta = (await drive.files.get({ fileId: id, fields: 'name,mimeType,size', supportsAllDrives: true })).data;
  } catch { throw new Error('The connected Google account can’t open it'); }
  const exportAs = { 'application/vnd.google-apps.document': 'text/plain', 'application/vnd.google-apps.spreadsheet': 'text/csv', 'application/vnd.google-apps.presentation': 'text/plain' }[meta.mimeType];
  if (exportAs) {
    const r = await drive.files.export({ fileId: id, mimeType: exportAs }, { responseType: 'arraybuffer' });
    return { ok: true, kind: 'text', title: meta.name, text: Buffer.from(r.data).toString('utf8') };
  }
  const kind = kindOf(meta.name, meta.mimeType);
  if (!readableKind(kind) || Number(meta.size || 0) > MAX_READ) return { ok: true, kind: 'other', title: meta.name, note: `${kind} file${meta.size ? ` (${mb(Number(meta.size))})` : ''} — not read` };
  const r = await drive.files.get({ fileId: id, alt: 'media', supportsAllDrives: true }, { responseType: 'arraybuffer' });
  const bytes = Buffer.from(r.data);
  return { ok: true, kind, title: meta.name, mime: meta.mimeType, bytes, text: await textOf(kind, bytes, meta.name) };
}

async function readDropbox(url) {
  const dbx = require('../creative/providers/dropbox');
  if (/\/(scl\/fo|sh)\//.test(url)) {
    const files = await dbx.listSharedFolder(url, { maxDepth: 1, maxFiles: 60 });
    return {
      ok: true, kind: 'text', title: 'Dropbox folder',
      text: `Shared Dropbox folder — ${files.length} file${files.length === 1 ? '' : 's'}:\n${files.map(f => `- ${f.path.replace(/^\//, '')} (${f.kind}${f.size ? `, ${mb(f.size)}` : ''})`).join('\n')}`,
    };
  }
  const [entry] = await dbx.sharedFileEntry(url);
  const kind = kindOf(entry.name);
  if (!readableKind(kind) || (entry.size || 0) > MAX_READ) return { ok: true, kind: 'other', title: entry.name, note: `${kind} file${entry.size ? ` (${mb(entry.size)})` : ''} — not read` };
  const link = await dbx.sharedLinkFileUrl(url, '');
  const res = await fetch(link, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Dropbox answered ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  return { ok: true, kind, title: entry.name, mime: dbx.mimeOf(entry.name), bytes, text: await textOf(kind, bytes, entry.name) };
}

async function readWeb(url) {
  const host = new URL(url).hostname.replace(/^www\./, '');
  const { buffer, mime } = await safeFetch(url);
  const kind = mime.startsWith('image/') ? 'image' : mime === 'application/pdf' ? 'pdf' : mime.includes('html') ? 'html' : (mime.startsWith('text/') || mime.includes('json')) ? 'text' : 'other';
  if (kind === 'html') {
    const page = htmlText(buffer.toString('utf8'));
    let image = null;
    if (page.image) {
      try {
        const img = await safeFetch(new URL(page.image, url).toString(), { maxBytes: 5 * 1024 * 1024 });
        if (img.mime.startsWith('image/')) image = { bytes: img.buffer, mime: img.mime };
      } catch { /* the page text is enough */ }
    }
    return { ok: true, kind: 'text', title: page.title || host, text: page.text || '(no readable text on the page)', image };
  }
  if (kind === 'other') return { ok: false, title: host, note: `${mime || 'unknown'} content — not read` };
  return { ok: true, kind, title: host, mime, bytes: buffer, text: kind === 'text' ? buffer.toString('utf8') : null };
}

async function fetchLink(url) {
  let host;
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch { return { ok: false, note: 'Not a valid link' }; }
  if (/docs\.google\.com$|drive\.google\.com$/.test(host)) return readGoogle(url);
  if (/(^|\.)dropbox\.com$/.test(host)) return readDropbox(url);
  if (/(^|\.)frame\.io$|^f\.io$/.test(host)) return { ok: false, title: 'Frame.io', note: 'Frame.io review link — kept in the brief, not read' };
  if (/(^|\.)monday\.com$/.test(host)) return { ok: false, title: 'Monday', note: 'Monday link — kept in the brief, not read' };
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(host)) {
    const { buffer } = await safeFetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { maxBytes: 200000 });
    const o = JSON.parse(buffer.toString('utf8'));
    return { ok: true, kind: 'text', title: o.title, text: `YouTube video “${o.title}” by ${o.author_name}. Only the title is readable, not the video.` };
  }
  return readWeb(url);
}

/** A link's content, cached 30 minutes. */
function readLink(url) {
  return monday.cached(`studio:link:${url}`, 30 * 60 * 1000, async () => {
    try { return { url, ...(await fetchLink(url)) }; } catch (e) { return { url, ok: false, note: e.message || 'Couldn’t read it' }; }
  });
}

// ── Claude content ────────────────────────────────────────────────────────
/**
 * Content blocks for the files the user chose to have read and every link in their messages, plus a short summary
 * for the UI ({ type, name/url, ok, note }). Caps keep the request reasonable.
 */
async function gather({ messages, fileIds }) {
  const files = await filesByIds(fileIds);
  const links = await Promise.all(urlsIn(messages).map(readLink));
  const blocks = [];
  let images = 0;
  let pdfs = 0;
  const add = async (label, title, src) => {
    if (src.kind === 'image' && src.bytes && images < 12) {
      const img = await claudeImage(src.bytes, src.mime);
      if (img) { images++; blocks.push({ type: 'text', text: label }, { type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data.toString('base64') } }); return true; }
    }
    if (src.kind === 'pdf' && src.bytes && src.bytes.length <= MAX_READ && pdfs < 4) {
      pdfs++;
      blocks.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: src.bytes.toString('base64') }, title, context: label });
      return true;
    }
    if (src.text) {
      blocks.push({ type: 'document', source: { type: 'text', media_type: 'text/plain', data: src.text.slice(0, MAX_TEXT) }, title, context: label });
      if (src.image && images < 12) {
        const img = await claudeImage(src.image.bytes, src.image.mime);
        if (img) { images++; blocks.push({ type: 'text', text: `${label} — preview image` }, { type: 'image', source: { type: 'base64', media_type: img.mime, data: img.data.toString('base64') } }); }
      }
      return true;
    }
    blocks.push({ type: 'text', text: `${label} — ${src.note || 'can’t be read here'}` });
    return false;
  };
  const summary = [];
  for (const f of files) {
    const ok = await add(`Attached file: ${f.name}`, f.name, { kind: f.kind, mime: f.mime, bytes: f.bytes, text: f.text_content, note: `${f.kind} file (${mb(f.size)}) — only attached, not read` });
    summary.push({ type: 'file', id: f.id, name: f.name, ok });
  }
  for (const l of links) {
    const label = `Link: ${l.url}${l.title ? ` — ${l.title}` : ''}`;
    const ok = l.ok ? await add(label, l.title || l.url, l) : (blocks.push({ type: 'text', text: `${label} — couldn’t read it: ${l.note}` }), false);
    summary.push({ type: 'link', url: l.url, title: l.title || null, ok, note: ok ? null : l.note || null });
  }
  return { blocks, summary };
}

/** Files to attach to the Monday ticket. */
async function filesForMonday(ids) {
  return (await filesByIds(ids)).map(f => ({ name: f.name, mime: f.mime, buffer: f.bytes }));
}

module.exports = { saveUpload, gather, filesForMonday, urlsIn, htmlText, isPrivateIp, kindOf };

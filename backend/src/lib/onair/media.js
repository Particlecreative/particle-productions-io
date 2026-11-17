/**
 * On Air · Media — what's running on Meta, from AfterLife's /api/export/on-air (every creative live on the newest Meta
 * day, plus every creative that started in the window; per creative: maker, product, first spend, 7 / 28-day numbers,
 * a daily series, comments / reactions / shares). Cached 10 minutes. AfterLife thumbnails (/media/…) become signed CP
 * URLs (img tags can't send the login header); the path itself is checked again when served.
 */
const crypto = require('crypto');
const AL = require('../creative/afterlife');

const TTL = 10 * 60 * 1000;
const THUMB_TTL = 12 * 60 * 60 * 1000;
const PATH_RE = /^\/media\/[A-Za-z0-9._:/-]+\.(jpe?g|png|webp)$/i;
const secret = () => process.env.CREATIVE_MEDIA_SECRET || `${process.env.JWT_SECRET || 'dev'}:creative-media`;
const sig = (path, e) => crypto.createHmac('sha256', secret()).update(`onair|${path}|${e}`).digest('base64url').slice(0, 32);

function thumbUrl(path, now = Date.now()) {
  if (!PATH_RE.test(path || '') || path.includes('..')) return null;
  const e = Math.floor((now + THUMB_TTL) / 1000);
  return `/api/onair/t?p=${encodeURIComponent(path)}&e=${e}&s=${sig(path, e)}`;
}
/** A running ad's real video: a signed CP link (12 h) → AfterLife asks Meta for a fresh playable URL → 302. */
const vsig = (ad, e) => crypto.createHmac('sha256', secret()).update(`onair-video|${ad}|${e}`).digest('base64url').slice(0, 32);
function videoUrl(adId, now = Date.now()) {
  if (!/^\d{5,25}$/.test(String(adId || ''))) return null;
  const e = Math.floor((now + THUMB_TTL) / 1000);
  return `/api/onair/v?ad=${adId}&e=${e}&s=${vsig(adId, e)}`;
}
function verifyVideo(ad, e, s) {
  if (!/^\d{5,25}$/.test(String(ad || '')) || !e || !s || Number(e) * 1000 < Date.now()) return false;
  const a = Buffer.from(String(s)), b = Buffer.from(vsig(ad, e));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
async function playableUrl(ad) {
  const base = process.env.AFTERLIFE_URL.replace(/\/$/, '');
  const r = await fetch(`${base}/api/export/ad-video?ad=${encodeURIComponent(ad)}`, { headers: { 'X-Export-Token': process.env.AFTERLIFE_EXPORT_TOKEN }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) return null;
  return (await r.json()).url || null;
}

function verifyThumb(path, e, s) {
  if (!PATH_RE.test(path || '') || path.includes('..') || !e || !s || Number(e) * 1000 < Date.now()) return false;
  const a = Buffer.from(String(s)), b = Buffer.from(sig(path, e));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

let cache = null;          // { at, data }
let inflight = null;
async function getMedia({ force = false } = {}) {
  if (!AL.configured()) return { connected: false, creatives: [] };
  if (!force && cache && Date.now() - cache.at < TTL) return cache.data;
  if (inflight) return inflight;
  inflight = (async () => {
    const base = process.env.AFTERLIFE_URL.replace(/\/$/, '');
    const r = await fetch(`${base}/api/export/on-air?days=14`, {
      headers: { 'X-Export-Token': process.env.AFTERLIFE_EXPORT_TOKEN, Accept: 'application/json' }, signal: AbortSignal.timeout(60000),
    });
    if (r.status === 404) return { connected: true, ready: false, creatives: [], error: 'AfterLife hasn’t been updated with the On Air export yet' };
    if (!r.ok) throw new Error(`AfterLife ${r.status}`);
    const raw = await r.json();
    const data = {
      connected: true, ready: true, last_day: raw.last_day, since: raw.since, days: raw.days, totals: raw.totals, benchmarks: raw.benchmarks || null,
      afterlife_url: base,
      creatives: (raw.creatives || []).map(c => ({
        ...c,
        thumb: c.thumb ? thumbUrl(c.thumb) : null,
        video_url: c.format === 'video' && c.ad_id ? videoUrl(c.ad_id) : null,
        afterlife: c.asset_id ? `${base}/asset/${encodeURIComponent(c.asset_id)}` : null,
        ads_manager: c.ad_id && c.ad_account ? `https://adsmanager.facebook.com/adsmanager/manage/ads?act=${String(c.ad_account).replace(/^act_/, '')}&selected_ad_ids=${c.ad_id}` : null,
      })),
      fetched_at: new Date().toISOString(),
    };
    cache = { at: Date.now(), data };
    return data;
  })().finally(() => { inflight = null; });
  return inflight;
}

const thumbBytes = new Map(); // path → { at, bytes, mime } — a small cache, the browser caches the rest
async function thumbnail(path) {
  const hit = thumbBytes.get(path);
  if (hit && Date.now() - hit.at < 6 * 60 * 60 * 1000) return hit;
  const out = await AL.thumbnail(path);
  if (thumbBytes.size > 400) thumbBytes.delete(thumbBytes.keys().next().value);
  const v = { at: Date.now(), bytes: out.bytes, mime: out.mime };
  thumbBytes.set(path, v);
  return v;
}

module.exports = { getMedia, thumbUrl, verifyThumb, thumbnail, videoUrl, verifyVideo, playableUrl };

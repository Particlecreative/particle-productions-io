/**
 * BambooHR client for My HR and the HR panel (25 Nov 2026).
 * call(creds, method, path, { query, body }) — creds = { subdomain, api_key }. Basic auth (key as the user name, "x" as the
 * password), JSON in and out, a timeout, and errors in plain English with an HTTP status the CP browser can show.
 * The key only ever goes into the Authorization header: it's never logged and never put in an error.
 *
 * Base: the documented https://{company}.bamboohr.com/api/v1; when that answers "no such route" (404 / redirect without
 * JSON) we try the legacy https://api.bamboohr.com/api/gateway.php/{company}/v1 (what Studio's company connection uses)
 * and remember which one worked for that company.
 *
 * Also a tiny single-flight cache (memo / forget) shared by the HR modules.
 */
const TZ = 'Asia/Jerusalem';

const bases = new Map(); // subdomain → 'doc' | 'gateway' (the one that answered last)
const baseUrl = (kind, sub) => (kind === 'gateway'
  ? `https://api.bamboohr.com/api/gateway.php/${encodeURIComponent(sub)}/v1`
  : `https://${sub}.bamboohr.com/api/v1`);

const MESSAGES = {
  400: 'BambooHR didn’t accept that',
  401: 'BambooHR didn’t accept the API key — it may have been deleted. Make a new key and connect again.',
  403: 'Your BambooHR account isn’t allowed to do that.',
  404: 'BambooHR couldn’t find that.',
  405: 'BambooHR couldn’t find that.',
  409: 'BambooHR says that’s already been done.',
  412: 'Time tracking isn’t turned on for you in BambooHR — ask HR to add you to time tracking.',
  422: 'BambooHR didn’t accept that',
  429: 'BambooHR is busy right now — try again in a minute.',
};
// What the CP browser gets. Never 401 (the app would sign you out) and never 502–504 (it would say "updating").
const HTTP = { 400: 400, 401: 400, 403: 403, 404: 404, 405: 404, 409: 409, 412: 412, 422: 422, 429: 429 };
const CODES = { 401: 'bad_key', 403: 'not_allowed', 404: 'not_found', 405: 'not_found', 409: 'conflict', 412: 'not_enrolled', 429: 'busy' };

function bambooError(bambooStatus, detail, messages) {
  const own = messages?.[bambooStatus];
  let msg = own || MESSAGES[bambooStatus] || (bambooStatus >= 500 ? 'BambooHR isn’t answering right now — try again in a minute.' : `BambooHR answered with an error (${bambooStatus})`);
  if (!own && (bambooStatus === 400 || bambooStatus === 422) && detail) msg = `${msg}: ${detail}`;
  const e = new Error(msg);
  e.status = HTTP[bambooStatus] || 424;
  e.bambooStatus = bambooStatus;
  e.code = CODES[bambooStatus] || 'bamboo_error';
  if (detail) e.detail = detail;
  return e;
}

const isJsonType = (res) => /json/i.test(res.headers?.get?.('content-type') || '');

async function readBody(res) {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  if (isJsonType(res) || /^\s*[[{]/.test(text)) {
    try { return JSON.parse(text); } catch { /* fall through */ }
  }
  return text;
}

/** BambooHR puts its error reason in a header, sometimes in the body. Short, never the key. */
function errorDetail(res, body) {
  const h = res.headers?.get?.('x-bamboohr-error-message');
  const b = body && typeof body === 'object' ? (body.message || body.error?.message || body.error || body.errors?.[0]?.message) : null;
  const d = String(h || (typeof b === 'string' ? b : '') || '').replace(/\s+/g, ' ').trim();
  return d ? d.slice(0, 200) : null;
}

function buildUrl(kind, creds, path, query) {
  const url = new URL(`${baseUrl(kind, creds.subdomain)}${path}`);
  for (const [k, v] of Object.entries(query || {})) if (v != null && v !== '') url.searchParams.set(k, String(v));
  return url;
}

async function send(kind, creds, method, path, { query, body, timeoutMs }) {
  const headers = {
    Authorization: `Basic ${Buffer.from(`${creds.api_key}:x`).toString('base64')}`,
    Accept: 'application/json',
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  try {
    return await fetch(buildUrl(kind, creds, path, query), {
      method, headers, redirect: 'manual',
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    const e = new Error(/abort|timeout/i.test(`${err?.name} ${err?.message}`) ? 'BambooHR took too long to answer — try again.' : 'Couldn’t reach BambooHR — try again in a minute.');
    e.status = 424;
    e.code = 'unreachable';
    e.network = true;
    throw e;
  }
}

// "That route isn't here" — a 404 / 405 / redirect that isn't a JSON error from the API itself
const routeMissing = (res) => (res.status === 404 || res.status === 405 || (res.status >= 300 && res.status < 400)) && !isJsonType(res);

/**
 * One BambooHR call. Resolves with the parsed JSON (or text, or null when empty).
 * options.messages = { [bambooStatus]: 'your own sentence' } to say what a 409 / 412… means for this call.
 */
async function call(creds, method, path, { query, body, timeoutMs = 15000, messages, fallback = true } = {}) {
  if (!creds?.subdomain || !creds?.api_key) {
    throw Object.assign(new Error('BambooHR isn’t connected'), { status: 409, code: 'not_connected' });
  }
  const sub = creds.subdomain;
  const first = bases.get(sub) || 'doc';
  const other = first === 'doc' ? 'gateway' : 'doc';
  let kind = first;
  let res = null;
  let netErr = null;
  try {
    res = await send(first, creds, method, path, { query, body, timeoutMs });
  } catch (e) {
    if (!fallback || !e.network) throw e;
    netErr = e; // that host didn't answer — try the other base
  }
  if (fallback && (!res || routeMissing(res))) {
    try {
      const alt = await send(other, creds, method, path, { query, body, timeoutMs });
      if (!res || !routeMissing(alt)) { res = alt; kind = other; }
    } catch (e) {
      if (!res) throw netErr || e;
    }
  }
  const data = await readBody(res);
  if (res.status >= 300 && res.status < 400) throw bambooError(404, null, messages);
  if (!res.ok) throw bambooError(res.status, errorDetail(res, data), messages);
  bases.set(sub, kind);
  if (method !== 'GET' && data == null) {
    const loc = res.headers?.get?.('location');
    return loc ? { location: loc, id: (loc.match(/(\d+)\/?$/) || [])[1] || null } : null;
  }
  if (typeof data === 'string' && method === 'GET') {
    const e = new Error('BambooHR answered something we didn’t expect — check the company name.');
    e.status = 424;
    e.code = 'unexpected';
    throw e;
  }
  return data;
}

// ── tiny single-flight TTL cache ──────────────────────────────────────────────────────────────────────────────────────
const cache = new Map(); // key → { at, ttl, value } | { promise }
async function memo(key, ttlMs, fn, { force = false } = {}) {
  const hit = cache.get(key);
  if (!force && hit) {
    if (hit.promise) return hit.promise;
    if (Date.now() - hit.at < hit.ttl) return hit.value;
  }
  const promise = (async () => fn())();
  cache.set(key, { promise });
  try {
    const value = await promise;
    cache.set(key, { at: Date.now(), ttl: ttlMs, value });
    return value;
  } catch (e) {
    cache.delete(key);
    throw e;
  }
}
function forget(prefix = '') { for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k); }

function resetForTests() { bases.clear(); cache.clear(); }

module.exports = { call, memo, forget, bambooError, TZ, resetForTests };

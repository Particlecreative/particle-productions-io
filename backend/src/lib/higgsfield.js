/**
 * Higgsfield, through its MCP server (mcp.higgsfield.ai). CP signs in as the Particle Higgsfield account, so
 * generations spend the plan's monthly credits — the separate Higgsfield API is pay-as-you-go and has no Nano Banana.
 * An admin connects it once in Settings → Integrations; the refresh token keeps it signed in after that.
 */
const crypto = require('crypto');
const { spawn } = require('child_process');
const db = require('../db');

const MCP_URL = 'https://mcp.higgsfield.ai/mcp';
const OAUTH = 'https://mcp.higgsfield.ai/oauth2';
// Higgsfield only lets its own listed apps or a local address receive the sign-in. CP uses a local one: after
// signing in the browser lands on a page that doesn't load, and the admin pastes that address back into CP
const REDIRECT_URI = 'http://localhost:53682/callback';
const SCOPE = 'openid email offline_access';
const PROTOCOL = '2025-06-18';
const IMAGE_MODEL = 'nano_banana_pro';
const REF_TYPES = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

class HiggsfieldError extends Error {
  constructor(message, { status = 502, code } = {}) { super(message); this.status = status; this.code = code; }
}
const notConnected = (message = "Higgsfield isn't connected — an admin can connect it in Settings → Integrations.") =>
  new HiggsfieldError(message, { status: 503, code: 'HF_NOT_CONNECTED' });
const EXPIRED = 'The Higgsfield sign-in has expired — an admin can reconnect it in Settings → Integrations.';

const b64url = (buf) => buf.toString('base64url');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Stored connection: settings.higgsfield_tokens on the Particle row ──
let columnReady = null;
function ensureColumn() {
  columnReady ||= db.query('ALTER TABLE settings ADD COLUMN IF NOT EXISTS higgsfield_tokens JSONB')
    .catch(err => { columnReady = null; throw err; });
  return columnReady;
}
let store = {
  async load() {
    await ensureColumn();
    const { rows } = await db.query("SELECT higgsfield_tokens FROM settings WHERE brand_id = 'particle'");
    return rows[0]?.higgsfield_tokens || null;
  },
  async save(conn) {
    await ensureColumn();
    await db.query("UPDATE settings SET higgsfield_tokens = $1 WHERE brand_id = 'particle'", [conn ? JSON.stringify(conn) : null]);
  },
};

// ── Sign-in (OAuth with PKCE) ──
const pending = new Map(); // state → { verifier, clientId, at }

async function startConnect() {
  const conn = await store.load();
  let clientId = conn?.client_id;
  if (!clientId) {
    const r = await fetch(`${OAUTH}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Particle CP', redirect_uris: [REDIRECT_URI], scope: SCOPE,
        grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none',
      }),
      signal: AbortSignal.timeout(20000),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.client_id) throw new HiggsfieldError(`Higgsfield wouldn't register CP (${d.error_description || d.error || r.status})`);
    clientId = d.client_id;
  }
  const verifier = b64url(crypto.randomBytes(32));
  const state = b64url(crypto.randomBytes(16));
  for (const [k, v] of pending) if (Date.now() - v.at > 30 * 60 * 1000) pending.delete(k);
  pending.set(state, { verifier, clientId, at: Date.now() });
  const url = `${OAUTH}/authorize?` + new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: REDIRECT_URI, scope: SCOPE, state, resource: MCP_URL,
    code_challenge: b64url(crypto.createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
  });
  return { url };
}

async function tokenRequest(params) {
  const r = await fetch(`${OAUTH}/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(20000),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) {
    const err = new HiggsfieldError(`Higgsfield sign-in failed (${d.error_description || d.error || r.status})`, { status: r.status >= 500 ? 502 : 400 });
    err.oauthError = d.error;
    throw err;
  }
  return { access_token: d.access_token, refresh_token: d.refresh_token || params.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 };
}

/** `pasted` is the whole address the browser landed on after signing in (http://localhost:53682/callback?code=…) */
async function finishConnect(pasted, user) {
  let u;
  try { u = new URL(String(pasted || '').trim()); } catch {
    throw new HiggsfieldError("Paste the full address from the browser's address bar — it starts with http://localhost", { status: 400 });
  }
  if (u.searchParams.get('error')) {
    throw new HiggsfieldError(`The Higgsfield sign-in didn't finish (${u.searchParams.get('error_description') || u.searchParams.get('error')})`, { status: 400 });
  }
  const p = pending.get(u.searchParams.get('state'));
  if (!u.searchParams.get('code') || !p) throw new HiggsfieldError('That sign-in has expired — click Connect again', { status: 400 });
  pending.delete(u.searchParams.get('state'));
  const tokens = await tokenRequest({
    grant_type: 'authorization_code', code: u.searchParams.get('code'), redirect_uri: REDIRECT_URI,
    client_id: p.clientId, code_verifier: p.verifier, resource: MCP_URL,
  });
  await store.save({ client_id: p.clientId, ...tokens, connected_at: new Date().toISOString(), connected_by: user?.email || null });
  return status({ live: true });
}

async function disconnect() {
  await store.save(null);
}

let refreshing = null;
async function accessToken({ force = false } = {}) {
  const conn = await store.load();
  if (!conn?.access_token && !conn?.refresh_token) throw notConnected(conn?.expired_at ? EXPIRED : undefined);
  if (!force && conn.access_token && conn.expires_at - Date.now() > 60000) return conn.access_token;
  if (!conn.refresh_token) throw notConnected(EXPIRED);
  // One refresh at a time — Higgsfield may rotate the refresh token, and a second refresh with the old one would fail
  refreshing ||= (async () => {
    try {
      const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: conn.refresh_token, client_id: conn.client_id, resource: MCP_URL });
      await store.save({ ...conn, ...t });
      return t.access_token;
    } catch (err) {
      if (err.oauthError === 'invalid_grant') {
        await store.save({ client_id: conn.client_id, expired_at: new Date().toISOString() });
        throw notConnected(EXPIRED);
      }
      throw err;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

// ── MCP over Streamable HTTP (JSON-RPC) ──
async function rpc(session, body) {
  const r = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${session.token}`,
      ...(session.id ? { 'Mcp-Session-Id': session.id } : {}),
      ...(session.protocol ? { 'MCP-Protocol-Version': session.protocol } : {}),
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000),
  });
  if (r.status === 401) throw Object.assign(new HiggsfieldError("Higgsfield didn't accept CP's sign-in"), { unauthorized: true });
  session.id ||= r.headers.get('mcp-session-id');
  if (body.id === undefined) return null; // a notification — answered with 202 and no body
  const text = await r.text();
  if (!r.ok) throw new HiggsfieldError(`Higgsfield returned ${r.status}: ${text.slice(0, 200)}`);
  // The answer comes either as plain JSON or as an event stream carrying the JSON-RPC message
  const messages = (r.headers.get('content-type') || '').includes('text/event-stream')
    ? text.split(/\r?\n\r?\n/)
      .map(ev => ev.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).replace(/^ /, '')).join('\n'))
      .filter(Boolean).map(d => { try { return JSON.parse(d); } catch { return null; } }).filter(Boolean)
    : [JSON.parse(text)];
  const msg = messages.find(m => m.id === body.id);
  if (!msg) throw new HiggsfieldError('Higgsfield sent no answer');
  if (msg.error) throw new HiggsfieldError(`Higgsfield: ${msg.error.message || 'request failed'}`);
  return msg.result;
}

async function openSession() {
  for (const force of [false, true]) {
    const session = { token: await accessToken({ force }), id: null, protocol: null, nextId: 1 };
    try {
      const init = await rpc(session, {
        jsonrpc: '2.0', id: session.nextId++, method: 'initialize',
        params: { protocolVersion: PROTOCOL, capabilities: {}, clientInfo: { name: 'particle-cp', version: '1.0.0' } },
      });
      session.protocol = init?.protocolVersion || PROTOCOL;
      await rpc(session, { jsonrpc: '2.0', method: 'notifications/initialized' });
      return session;
    } catch (err) {
      if (!err.unauthorized) throw err;
      if (force) throw notConnected(EXPIRED);
    }
  }
}

function toolError(text) {
  if (/insufficient|not enough credits|out of credits|credit balance|top.?up/i.test(text)) {
    return new HiggsfieldError("The Higgsfield plan is out of credits for now — they renew monthly, or top up on higgsfield.ai.", { status: 402, code: 'HF_CREDITS' });
  }
  return new HiggsfieldError(`Higgsfield: ${text.slice(0, 300) || 'the request failed'}`);
}

async function callTool(session, name, args) {
  const result = await rpc(session, { jsonrpc: '2.0', id: session.nextId++, method: 'tools/call', params: { name, arguments: args } });
  const text = (result?.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
  if (result?.isError) throw toolError(text);
  if (result?.structuredContent) return result.structuredContent;
  try { return JSON.parse(text); } catch { return { text }; }
}

// ── What CP uses ──
async function isConnected() {
  const conn = await store.load();
  return !!(conn?.access_token || conn?.refresh_token);
}

async function status({ live = false } = {}) {
  const conn = await store.load();
  const connected = !!(conn?.access_token || conn?.refresh_token);
  const out = { connected, connected_at: conn?.connected_at || null, connected_by: conn?.connected_by || null, expired: !connected && !!conn?.expired_at };
  if (connected && live) {
    try {
      const b = await callTool(await openSession(), 'balance', {});
      out.credits = b.credits ?? null;
      out.plan = b.subscription_plan_type || null;
    } catch (err) {
      out.error = err.message;
      if (err.code === 'HF_NOT_CONNECTED') { out.connected = false; out.expired = true; }
    }
  }
  return out;
}

// Storyboard frames come back as ~7 MB PNGs — a high-quality JPEG is a tenth of that and looks the same
function toJpeg(buffer) {
  return new Promise((resolve) => {
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-frames:v', '1', '-q:v', '3', '-f', 'image2pipe', '-c:v', 'mjpeg', 'pipe:1']);
    const chunks = [];
    ff.stdout.on('data', c => chunks.push(c));
    ff.on('error', () => resolve(null));
    ff.on('close', code => resolve(code === 0 && chunks.length ? Buffer.concat(chunks) : null));
    ff.stdin.on('error', () => {});
    ff.stdin.end(buffer);
  });
}

/**
 * One 16:9 storyboard frame with Nano Banana Pro (2 credits). referenceImages: [{ base64, mimeType }] — the first ones
 * matter most. Returns { buffer, mimeType, jobId }.
 */
async function generateImage(prompt, referenceImages = []) {
  const session = await openSession();
  const refs = referenceImages.filter(r => r?.base64 && REF_TYPES[(r.mimeType || 'image/jpeg').toLowerCase()]).slice(0, 14);

  // Reference photos go into Higgsfield's storage first — a generation takes their media ids, not the bytes
  let medias = [];
  if (refs.length) {
    const types = refs.map(r => ((r.mimeType || 'image/jpeg').toLowerCase() === 'image/jpg' ? 'image/jpeg' : (r.mimeType || 'image/jpeg').toLowerCase()));
    const up = await callTool(session, 'media_upload', {
      files: refs.map((r, i) => ({ filename: `cp-ref-${i + 1}.${REF_TYPES[types[i]]}`, content_type: types[i] })),
    });
    const uploads = up.uploads || [];
    if (uploads.length !== refs.length) throw new HiggsfieldError("Higgsfield didn't accept the reference photos");
    await Promise.all(uploads.map(async (u, i) => {
      const r = await fetch(u.upload_url, {
        method: 'PUT', headers: { 'Content-Type': u.content_type || types[i] },
        body: Buffer.from(refs[i].base64, 'base64'), signal: AbortSignal.timeout(60000),
      });
      if (!r.ok) throw new HiggsfieldError(`A reference photo didn't upload to Higgsfield (${r.status})`);
    }));
    await callTool(session, 'media_confirm', { type: 'image', media_ids: uploads.map(u => u.media_id) });
    medias = uploads.map(u => ({ value: u.media_id, role: 'image_references' }));
  }

  const submitted = await callTool(session, 'generate_image_batch', {
    context: 'Storyboard frame for a commercial script in Particle CP',
    requests: [{ index: 0, params: { model: IMAGE_MODEL, prompt, aspect_ratio: '16:9', resolution: '2k', use_unlim: false, ...(medias.length ? { medias } : {}) } }],
  });
  const jobId = submitted.jobs?.[0]?.job_id;
  if (!jobId) throw toolError(String(submitted.jobs?.[0]?.error || submitted.errors?.[0]?.error || submitted.text || "the frame wasn't accepted"));

  // Nano Banana Pro takes ~45s; jobs_wait holds each call for up to 15s
  const deadline = Date.now() + 4 * 60 * 1000;
  for (;;) {
    const w = await callTool(session, 'jobs_wait', { jobs: [{ index: 0, job_id: jobId }], timeout_seconds: 15 });
    const job = w.jobs?.[0];
    if (job?.status === 'completed' && job.result_url) {
      const r = await fetch(job.result_url, { signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw new HiggsfieldError(`The finished frame couldn't be downloaded from Higgsfield (${r.status})`);
      const original = Buffer.from(await r.arrayBuffer());
      const jpeg = await toJpeg(original);
      return jpeg
        ? { buffer: jpeg, mimeType: 'image/jpeg', jobId }
        : { buffer: original, mimeType: r.headers.get('content-type') || 'image/png', jobId };
    }
    if (w.all_terminal || ['failed', 'nsfw', 'canceled'].includes(job?.status)) {
      throw new HiggsfieldError(job?.status === 'nsfw'
        ? "Higgsfield's content filter blocked this frame — try rewording the scene"
        : `Higgsfield couldn't make this frame (${job?.error || job?.status || 'failed'}) — try again`, { status: 422 });
    }
    if (Date.now() > deadline) throw new HiggsfieldError('Higgsfield is taking too long with this frame — try again', { status: 504 });
    if (!w.timed_out) await sleep(Math.min(Math.max(w.poll_after_seconds || 5, 2), 15) * 1000);
  }
}

module.exports = {
  isConnected, status, startConnect, finishConnect, disconnect, generateImage, HiggsfieldError,
  _setStore: (s) => { store = s; }, // tests only
};

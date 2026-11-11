/**
 * MEDIUM ← Upspring account (MCP, https://api.upspring.ai/mcp) — Particle's OWN ads: spend, ROAS, CPA, headlines, copy,
 * creative descriptions. This is "Upspring ranks" (Tomer, 11 Nov 2026: AfterLife ranks are not the source any more).
 * Sign-in: OAuth 2.1 with dynamic client registration + PKCE (public client). An admin clicks "Connect Upspring" once
 * and approves on Upspring's own page; the tokens are sealed with AES-256-GCM (lib/studio/secrets) in
 * medium_upspring_auth and refreshed here. Nothing is ever written to Upspring. Everything it returns is data.
 */
const crypto = require('crypto');
const db = require('../../db');
const { seal, unseal } = require('../studio/secrets');

const MCP_URL = 'https://api.upspring.ai/mcp';
const ISSUER = 'https://api.upspring.ai';
const CONTEXT = 'The CP Medium creative strategist ranks Particle ad creatives by performance to choose which winners to brief new ads from.';

async function ensureTable() {
  await db.query(`CREATE TABLE IF NOT EXISTS medium_upspring_auth (
    id INT PRIMARY KEY DEFAULT 1, client_id TEXT, redirect_uri TEXT, sealed JSONB, pending JSONB,
    connected_by TEXT, connected_at TIMESTAMPTZ, last_error TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), CHECK (id = 1))`);
  await db.query('INSERT INTO medium_upspring_auth (id) VALUES (1) ON CONFLICT (id) DO NOTHING');
}
const row = async () => { await ensureTable(); return (await db.query('SELECT * FROM medium_upspring_auth WHERE id = 1')).rows[0]; };
async function save(fields) {
  const cols = Object.keys(fields);
  await db.query(`UPDATE medium_upspring_auth SET ${cols.map((c, i) => `${c} = $${i + 1}`).join(', ')}, updated_at = NOW() WHERE id = 1`,
    cols.map(c => (fields[c] && typeof fields[c] === 'object' && !(fields[c] instanceof Date) ? JSON.stringify(fields[c]) : fields[c])));
}

let meta = null;
async function discover() {
  if (meta) return meta;
  const r = await fetch(`${ISSUER}/.well-known/oauth-authorization-server`, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`Upspring sign-in discovery failed (${r.status})`);
  meta = await r.json();
  return meta;
}

const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
/** PKCE pair (pure — tested). */
function pkce(verifier = b64url(crypto.randomBytes(48))) {
  return { verifier, challenge: b64url(crypto.createHash('sha256').update(verifier).digest()) };
}

/** Step 1 (admin): register CP as a client if needed, then return Upspring's sign-in URL. */
async function startConnect({ redirectUri, actor }) {
  const m = await discover();
  let r = await row();
  if (!r.client_id || r.redirect_uri !== redirectUri) {
    const reg = await fetch(m.registration_endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000),
      body: JSON.stringify({ client_name: 'CP Panel — Medium', redirect_uris: [redirectUri], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none', scope: 'mcp' }),
    });
    if (!reg.ok) throw new Error(`Upspring client registration failed (${reg.status})`);
    const j = await reg.json();
    await save({ client_id: j.client_id, redirect_uri: redirectUri });
    r = await row();
  }
  const { verifier, challenge } = pkce();
  const state = b64url(crypto.randomBytes(24));
  await save({ pending: { state, verifier: seal(verifier), actor, at: Date.now() } });
  const q = new URLSearchParams({ response_type: 'code', client_id: r.client_id, redirect_uri: redirectUri, code_challenge: challenge, code_challenge_method: 'S256', state, scope: 'mcp', resource: MCP_URL });
  return `${m.authorization_endpoint}?${q}`;
}

async function tokenRequest(params) {
  const m = await discover();
  const res = await fetch(m.token_endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(20000) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`Upspring sign-in failed (${res.status}${j.error ? ` ${j.error}` : ''})`);
  return j;
}
const storeTokens = (j, prevRefresh) => ({
  access: seal(j.access_token), refresh: j.refresh_token ? seal(j.refresh_token) : prevRefresh || null,
  expires_at: Date.now() + (Number(j.expires_in) || 3600) * 1000,
});

/** Step 2 (Upspring redirects back): check the state, trade the code for tokens. */
async function finishConnect({ code, state }) {
  const r = await row();
  const p = r.pending;
  if (!p || !state || p.state !== state || Date.now() - Number(p.at) > 20 * 60000) throw new Error('This sign-in link expired — press Connect Upspring again');
  const j = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: r.redirect_uri, client_id: r.client_id, code_verifier: unseal(p.verifier), resource: MCP_URL });
  await save({ sealed: storeTokens(j), pending: null, connected_by: p.actor || null, connected_at: new Date(), last_error: null });
  session = null;
  return { ok: true };
}

async function disconnect() { await save({ sealed: null, pending: null, connected_by: null, connected_at: null, last_error: null }); session = null; return { ok: true }; }

async function accessToken() {
  const r = await row();
  const s = r.sealed;
  if (!s?.access && !s?.refresh) throw Object.assign(new Error('Upspring isn’t connected — an admin can connect it in Behind the scenes → Sources & settings'), { status: 503, code: 'not_connected' });
  if (s.access && Number(s.expires_at) - 60000 > Date.now()) return unseal(s.access);
  if (!s.refresh) throw Object.assign(new Error('Upspring sign-in expired — reconnect it'), { status: 503, code: 'not_connected' });
  try {
    const j = await tokenRequest({ grant_type: 'refresh_token', refresh_token: unseal(s.refresh), client_id: r.client_id, resource: MCP_URL });
    await save({ sealed: storeTokens(j, s.refresh), last_error: null });
    return j.access_token;
  } catch (e) {
    await save({ last_error: e.message });
    throw Object.assign(new Error(`Upspring sign-in needs renewing — reconnect it (${e.message})`), { status: 503, code: 'not_connected' });
  }
}

/** The JSON-RPC message with this id from a JSON or SSE response body (pure — tested). */
function readRpc(text, id) {
  const t = String(text || '').trim();
  if (t.startsWith('{') || t.startsWith('[')) { const j = JSON.parse(t); return Array.isArray(j) ? j.find(x => x.id === id) : j; }
  for (const block of t.split(/\n\n+/)) {
    const data = block.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim()).join('\n');
    if (!data) continue;
    try { const j = JSON.parse(data); if (j.id === id) return j; } catch { /* keep looking */ }
  }
  return null;
}

let session = null; // { id, at }
let rpcId = 0;
async function rpc(method, params, { notify = false, retry = true } = {}) {
  const token = await accessToken();
  const id = notify ? undefined : ++rpcId;
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', 'MCP-Protocol-Version': '2025-06-18' };
  if (session?.id) headers['Mcp-Session-Id'] = session.id;
  const res = await fetch(MCP_URL, { method: 'POST', headers, body: JSON.stringify({ jsonrpc: '2.0', method, ...(params ? { params } : {}), ...(notify ? {} : { id }) }), signal: AbortSignal.timeout(90000) });
  if ((res.status === 404 || res.status === 400) && session && retry && method !== 'initialize') { session = null; await initSession(); return rpc(method, params, { notify, retry: false }); }
  if (res.status === 401 && retry) { await save({ sealed: { ...(await row()).sealed, expires_at: 0 } }); return rpc(method, params, { notify, retry: false }); }
  if (!res.ok && res.status !== 202) throw new Error(`Upspring ${res.status} on ${method}`);
  const sid = res.headers.get('mcp-session-id');
  if (sid) session = { id: sid, at: Date.now() };
  if (notify) return null;
  const msg = readRpc(await res.text(), id);
  if (!msg) throw new Error(`Upspring returned no answer to ${method}`);
  if (msg.error) throw new Error(`Upspring: ${msg.error.message || 'error'}`);
  return msg.result;
}
async function initSession() {
  await rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'cp-medium', version: '1.0' } });
  await rpc('notifications/initialized', null, { notify: true });
}

/** Call one Upspring tool; returns its JSON payload. */
async function callTool(name, args = {}) {
  if (!session || Date.now() - session.at > 20 * 60000) await initSession();
  const r = await rpc('tools/call', { name, arguments: { context: CONTEXT, ...args } });
  if (r?.isError) throw new Error(`Upspring ${name}: ${(r.content || []).map(c => c.text).join(' ').slice(0, 300)}`);
  const text = (r?.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
  try { return r?.structuredContent || JSON.parse(text); } catch { return { text }; }
}

async function status() {
  try {
    const r = await row();
    return { connected: !!(r.sealed?.refresh || r.sealed?.access), connected_by: r.connected_by, connected_at: r.connected_at, last_error: r.last_error };
  } catch (e) { return { connected: false, last_error: e.message }; }
}

module.exports = { startConnect, finishConnect, disconnect, callTool, status, pkce, readRpc, MCP_URL };

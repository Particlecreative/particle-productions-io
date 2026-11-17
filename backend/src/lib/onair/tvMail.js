/**
 * On Air · TV — the mail side. Reads, through the Google account connected in Settings (it needs Gmail READ access;
 * the account is reconnected once to grant it):
 *  - every email from the agency (lbd2c.com — the daily "Particle <Product> Campaign MM/DD" reports, replies)
 *  - every email the team sends the agency (particleformen.com → lbd2c.com) — new creatives with their links
 * Each message is stored once (onair_tv_mail, by Gmail id): reports parsed (lib/onair/agencyReport.js), replies as text.
 * Nothing is sent, labelled or changed in Gmail.
 */
const db = require('../../db');
const L = require('./agencyReport');

const AGENCY = 'lbd2c.com';
const TEAM = 'particleformen.com';
const READ_SCOPES = ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/gmail.modify', 'https://mail.google.com/'];

let ready = null;
function ensureTables() {
  ready = ready || db.query(`
    CREATE TABLE IF NOT EXISTS onair_tv_mail (
      gmail_id    TEXT PRIMARY KEY,
      thread_id   TEXT,
      kind        TEXT NOT NULL,            -- report | creative_sent | reply | other
      product     TEXT,
      subject     TEXT,
      from_email  TEXT,
      from_name   TEXT,
      to_emails   TEXT[],
      sent_at     TIMESTAMPTZ,
      report_date DATE,
      body_text   TEXT,
      parsed      JSONB,
      links       JSONB,
      created_at  TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS onair_tv_mail_kind_idx ON onair_tv_mail (kind, sent_at DESC);
    CREATE INDEX IF NOT EXISTS onair_tv_mail_thread_idx ON onair_tv_mail (thread_id);
    CREATE TABLE IF NOT EXISTS onair_state (
      key        TEXT PRIMARY KEY,
      value      JSONB,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );`).catch((e) => { ready = null; throw e; });
  return ready;
}

async function setState(key, value) {
  await ensureTables();
  await db.query(`INSERT INTO onair_state (key, value, updated_at) VALUES ($1, $2, NOW())
                  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [key, JSON.stringify(value)]);
}
async function getState(key) {
  await ensureTables();
  const { rows } = await db.query('SELECT value, updated_at FROM onair_state WHERE key = $1', [key]);
  return rows[0] ? { ...rows[0].value, updated_at: rows[0].updated_at } : null;
}

/** Does the connected Google account let CP read mail? (from the scopes Google granted) */
async function googleStatus() {
  const { rows } = await db.query("SELECT google_tokens FROM settings WHERE brand_id = 'particle'").catch(() => ({ rows: [] }));
  const raw = rows[0]?.google_tokens;
  if (!raw) return { connected: false, can_read: false };
  const t = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const scopes = String(t.scope || '').split(/\s+/);
  return { connected: true, can_read: READ_SCOPES.some(s => scopes.includes(s)), scope_known: !!t.scope };
}

// ── Gmail message → plain parts
const b64 = (s) => Buffer.from(String(s || '').replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
function bodies(payload) {
  const out = { html: '', plain: '' };
  const walk = (p) => {
    if (!p) return;
    if (p.mimeType === 'text/html' && p.body?.data && !out.html) out.html = b64(p.body.data);
    else if (p.mimeType === 'text/plain' && p.body?.data && !out.plain) out.plain = b64(p.body.data);
    (p.parts || []).forEach(walk);
  };
  walk(payload);
  return out;
}
const header = (msg, name) => (msg.payload?.headers || []).find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
function addr(s) {
  const m = String(s || '').match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || null, email: m[2].trim().toLowerCase() } : { name: null, email: String(s || '').trim().toLowerCase() };
}
const emails = (s) => String(s || '').split(',').map(x => addr(x).email).filter(Boolean);

/** One Gmail message → the row we keep. Pure — tested. */
function classify(msg) {
  const from = addr(header(msg, 'From'));
  const to = [...emails(header(msg, 'To')), ...emails(header(msg, 'Cc'))];
  const subject = header(msg, 'Subject');
  const sentAt = new Date(Number(msg.internalDate) || Date.parse(header(msg, 'Date')) || Date.now()).toISOString();
  const { html, plain } = bodies(msg.payload);
  const row = {
    gmail_id: msg.id, thread_id: msg.threadId, kind: 'other', product: null, subject, from_email: from.email, from_name: from.name,
    to_emails: to, sent_at: sentAt, report_date: null, body_text: null, parsed: null, links: null,
  };
  const fromAgency = from.email.endsWith(`@${AGENCY}`);
  const fromTeam = from.email.endsWith(`@${TEAM}`);
  const toAgency = to.some(e => e.endsWith(`@${AGENCY}`));
  if (fromAgency && L.reportSubject(subject) && html) {
    const parsed = L.parseReport({ html, subject, sentAt });
    if (parsed.spots.length || parsed.daily.length) {
      return { ...row, kind: 'report', product: parsed.product, report_date: parsed.report_date, body_text: parsed.note, parsed };
    }
  }
  const own = L.cleanReply(plain || L.plainOf(html));
  if (fromTeam && toAgency) {
    const links = L.creativeLinks(plain || html);
    return { ...row, kind: links.length ? 'creative_sent' : 'reply', product: L.productOf(subject) || L.productOf(own), body_text: own.slice(0, 4000), links: links.length ? links : null };
  }
  if (fromAgency) return { ...row, kind: 'reply', product: L.productOf(subject), body_text: own.slice(0, 4000), parsed: { networks: L.networksIn(own) } };
  return row;
}

async function gmailClient() {
  const { getGmailClient } = require('../../routes/gmail');
  return getGmailClient();
}

/** Read what's new (default: the last 21 days) and store it. → { added, reports, checked } */
async function sync({ days = 21 } = {}) {
  await ensureTables();
  const st = await googleStatus();
  if (!st.connected) { await setState('tv_sync', { ok: false, error: 'Google is not connected', at: new Date().toISOString() }); return { ok: false, error: 'Google is not connected' }; }
  const gmail = await gmailClient();
  const queries = [`from:${AGENCY} newer_than:${days}d`, `from:${TEAM} to:${AGENCY} newer_than:${days}d`, `from:${TEAM} cc:${AGENCY} newer_than:${days}d`];
  const ids = new Map();
  try {
    for (const q of queries) {
      let pageToken;
      for (let page = 0; page < 5; page++) {
        const r = await gmail.users.messages.list({ userId: 'me', q, maxResults: 100, pageToken });
        for (const m of r.data.messages || []) ids.set(m.id, m.threadId);
        pageToken = r.data.nextPageToken;
        if (!pageToken) break;
      }
    }
  } catch (e) {
    const scope = /insufficient|scope|permission/i.test(e.message || '') || e.code === 403;
    const error = scope ? 'Gmail reading isn’t allowed yet — reconnect Google in Settings' : `Gmail: ${e.message}`;
    await setState('tv_sync', { ok: false, error, needs_reconnect: scope, at: new Date().toISOString() });
    return { ok: false, error, needs_reconnect: scope };
  }
  const known = new Set((await db.query('SELECT gmail_id FROM onair_tv_mail WHERE gmail_id = ANY($1)', [[...ids.keys()]])).rows.map(r => r.gmail_id));
  let added = 0, reports = 0;
  for (const id of ids.keys()) {
    if (known.has(id)) continue;
    try {
      const { data } = await gmail.users.messages.get({ userId: 'me', id, format: 'full' });
      const r = classify(data);
      await db.query(
        `INSERT INTO onair_tv_mail (gmail_id, thread_id, kind, product, subject, from_email, from_name, to_emails, sent_at, report_date, body_text, parsed, links)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) ON CONFLICT (gmail_id) DO NOTHING`,
        [r.gmail_id, r.thread_id, r.kind, r.product, r.subject, r.from_email, r.from_name, r.to_emails, r.sent_at, r.report_date, r.body_text,
          r.parsed ? JSON.stringify(r.parsed) : null, r.links ? JSON.stringify(r.links) : null]);
      added += 1; if (r.kind === 'report') reports += 1;
    } catch (e) { console.warn('[onair] message', id, e.message); }
  }
  const out = { ok: true, checked: ids.size, added, reports, at: new Date().toISOString() };
  await setState('tv_sync', out);
  return out;
}

/** Did today's report (Israel date) arrive for every product we've had reports for in the last week? */
async function todaysReportsIn() {
  await ensureTables();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const { rows } = await db.query(
    `SELECT product, MAX(report_date)::text AS last FROM onair_tv_mail WHERE kind = 'report' AND sent_at > NOW() - INTERVAL '8 days' GROUP BY product`);
  return rows.length > 0 && rows.every(r => r.last >= today);
}

module.exports = { ensureTables, sync, classify, googleStatus, getState, setState, todaysReportsIn, AGENCY, TEAM };

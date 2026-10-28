/**
 * Finance email: queue → outbox → Gmail (from tomer@, the connected Google account).
 * Every email is stored first, retried with backoff, and visible on the Finance page.
 * Shadow mode sends everything to Tomer with a banner naming the real recipients.
 * Outside production (or with FINANCE_EMAIL_DRY_RUN=1) nothing is sent — emails are marked "dry run".
 */
const crypto = require('crypto');
const db = require('../../db');
const config = require('./config');

const FROM = 'Particle CP <tomer@particleformen.com>';
const BACKOFF_MIN = [1, 5, 15, 60, 180, 720];
const dryRun = () => process.env.FINANCE_EMAIL_DRY_RUN === '1' || process.env.NODE_ENV !== 'production';

/** RFC 2047 subject (keeps ₪, —, Hebrew names) split into encoded words of ≤ 45 bytes. */
function encodeHeader(s) {
  if (!/[^\x20-\x7e]/.test(s)) return s;
  const words = [];
  let cur = '';
  for (const ch of s) {
    if (Buffer.byteLength(cur + ch, 'utf8') > 45) { words.push(cur); cur = ''; }
    cur += ch;
  }
  if (cur) words.push(cur);
  return words.map(w => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}
const wrap76 = (b64) => b64.replace(/.{1,76}/g, '$&\r\n');
const b64 = (s) => wrap76(Buffer.from(s, 'utf8').toString('base64'));

function buildMime({ from = FROM, to, cc = [], subject, html, attachments = [] }) {
  const head = [
    `From: ${from}`,
    `To: ${to}`,
    cc.length ? `Cc: ${cc.join(', ')}` : null,
    `Subject: ${encodeHeader(subject)}`,
    'MIME-Version: 1.0',
  ].filter(Boolean);
  let raw;
  if (!attachments.length) {
    raw = [...head, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(html)].join('\r\n');
  } else {
    const boundary = `cp_${crypto.randomBytes(12).toString('hex')}`;
    const parts = [
      `--${boundary}`, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(html),
      ...attachments.flatMap(a => [
        `--${boundary}`,
        `Content-Type: ${a.mime || 'application/octet-stream'}; name="${a.filename}"`,
        `Content-Disposition: attachment; filename="${a.filename}"`,
        'Content-Transfer-Encoding: base64', '', wrap76(a.content_base64),
      ]),
      `--${boundary}--`,
    ];
    raw = [...head, `Content-Type: multipart/mixed; boundary="${boundary}"`, '', ...parts].join('\r\n');
  }
  return Buffer.from(raw).toString('base64url');
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function shadowBanner(to, cc) {
  return `<div style="font-family:Arial,sans-serif;background:#fff7d6;border:1px solid #f5d76e;color:#6b5300;padding:10px 14px;border-radius:10px;margin:0 0 14px;font-size:13px">
    <b>Test mode</b> — this email would have gone to <b>${esc(to)}</b>${cc?.length ? ` (cc ${esc(cc.join(', '))})` : ''}. Switch test mode off on the Finance page when it looks right.</div>`;
}

/**
 * Queue an email. `to` may be a string or array; shadow mode reroutes to Tomer (not for sign-in codes: noShadow).
 * dedupe_key: the same key is never queued twice (e.g. one nudge per day).
 */
async function queue({ kind, production_id = null, to, cc = [], subject, html, attachments = null, dedupe_key = null, meta = null, noShadow = false }) {
  const cfg = await config.get();
  const toList = (Array.isArray(to) ? to : [to]).filter(Boolean);
  const ccList = (cc || []).filter(Boolean).filter(x => !toList.includes(x));
  if (!toList.length) return null;
  let finalTo = toList.join(', '), finalCc = ccList, finalHtml = html, shadow = false;
  if (cfg.shadow && !noShadow) {
    shadow = true;
    finalTo = cfg.shadow_to;
    finalCc = [];
    finalHtml = shadowBanner(toList.join(', '), ccList) + html;
  }
  const { rows } = await db.query(
    `INSERT INTO email_outbox (kind, production_id, dedupe_key, to_addr, cc, subject, html, attachments, shadow, original_to, original_cc, meta)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (dedupe_key) DO NOTHING RETURNING id`,
    [kind, production_id, dedupe_key, finalTo, finalCc, subject, finalHtml, attachments ? JSON.stringify(attachments) : null,
      shadow, toList.join(', '), ccList, meta ? JSON.stringify(meta) : null]);
  if (rows[0]) setImmediate(() => processOutbox().catch(e => console.error('[finance mail]', e.message)));
  return rows[0]?.id || null;
}

let running = null;
/** Send what's due. Single-flight inside the process; SKIP LOCKED across processes. */
function processOutbox() {
  if (running) return running;
  running = (async () => {
    const client = await db.connect();
    let sent = 0, failed = 0;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `SELECT * FROM email_outbox WHERE status = 'queued' AND next_attempt_at <= NOW()
         ORDER BY id LIMIT 20 FOR UPDATE SKIP LOCKED`);
      for (const m of rows) {
        try {
          if (dryRun()) {
            await client.query(`UPDATE email_outbox SET status='sent', sent_at=NOW(), attempts=attempts+1, last_error='dry run (not sent)' WHERE id=$1`, [m.id]);
            continue;
          }
          const { getGmailClient } = require('../../routes/gmail');
          const gmail = await getGmailClient();
          const raw = buildMime({ to: m.to_addr, cc: m.cc || [], subject: m.subject, html: m.html, attachments: m.attachments || [] });
          await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
          await client.query(`UPDATE email_outbox SET status='sent', sent_at=NOW(), attempts=attempts+1, last_error=NULL WHERE id=$1`, [m.id]);
          sent++;
        } catch (err) {
          failed++;
          const attempts = m.attempts + 1;
          const give = attempts >= BACKOFF_MIN.length;
          await client.query(
            `UPDATE email_outbox SET attempts=$2, last_error=$3, status=$4, next_attempt_at = NOW() + ($5 || ' minutes')::interval WHERE id=$1`,
            [m.id, attempts, String(err.message || err).slice(0, 500), give ? 'failed' : 'queued', String(BACKOFF_MIN[Math.min(attempts, BACKOFF_MIN.length - 1)])]);
          console.error(`[finance mail] #${m.id} ${m.kind} failed (attempt ${attempts}):`, err.message);
          alertMailDown(err).catch(() => {});
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      throw e;
    } finally {
      client.release();
    }
    return { sent, failed };
  })().finally(() => { running = null; });
  return running;
}

/** Google disconnected / Gmail failing → tell the admins in CP and Slack, at most twice a day. */
async function alertMailDown(err) {
  const { rows } = await db.query("SELECT value FROM app_config WHERE key = 'finance_mail_alert_at'");
  const last = rows[0]?.value ? Date.parse(rows[0].value) : 0;
  if (Date.now() - last < 12 * 3600 * 1000) return;
  await db.query(`INSERT INTO app_config (key, value) VALUES ('finance_mail_alert_at', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`, [new Date().toISOString()]);
  const msg = `Finance emails are failing: ${String(err.message || err).slice(0, 160)}. Reconnect Google in Settings — emails wait in the outbox and go out once it works.`;
  const { rows: admins } = await db.query("SELECT id FROM users WHERE role = 'Admin' AND deleted_at IS NULL AND COALESCE(active, true)");
  for (const a of admins) {
    await db.query('INSERT INTO notifications (user_id, type, message) VALUES ($1, $2, $3)', [a.id, 'finance_alert', msg]).catch(() => {});
  }
  if (process.env.SLACK_WEBHOOK_URL) {
    await fetch(process.env.SLACK_WEBHOOK_URL, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `:warning: ${msg}` }), signal: AbortSignal.timeout(10000),
    }).catch(() => {});
  }
}

module.exports = { queue, processOutbox, buildMime, encodeHeader, esc, dryRun };

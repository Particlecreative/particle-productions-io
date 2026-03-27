const router = require('express').Router();
const { google } = require('googleapis');
const db = require('../db');
const { verifyJWT } = require('../middleware/auth');

const GOOGLE_CLIENT_ID     = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REDIRECT_URI  = process.env.GOOGLE_REDIRECT_URI;
const ALWAYS_CC = 'omer@particleformen.com';

function getOAuth2Client() {
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI);
}

async function getGmailClient() {
  const { rows } = await db.query("SELECT google_tokens FROM settings WHERE brand_id = 'particle'");
  if (!rows[0]?.google_tokens) throw new Error('Google not connected');
  const tokens = typeof rows[0].google_tokens === 'string'
    ? JSON.parse(rows[0].google_tokens) : rows[0].google_tokens;
  const oauth2 = getOAuth2Client();
  oauth2.setCredentials(tokens);
  oauth2.on('tokens', async (newTokens) => {
    const merged = { ...tokens, ...newTokens };
    await db.query("UPDATE settings SET google_tokens = $1 WHERE brand_id = 'particle'", [JSON.stringify(merged)]);
  });
  return google.gmail({ version: 'v1', auth: oauth2 });
}

// Build RFC 2822 email
function buildEmail({ to, cc, subject, htmlBody, from, skipDefaultCc }) {
  const ccList = skipDefaultCc
    ? (cc || []).filter(Boolean).join(', ')
    : [ALWAYS_CC, ...(cc || [])].filter(Boolean).join(', ');
  const raw = [
    `From: ${from || 'tomer@particleformen.com'}`,
    `To: ${to}`,
    'Reply-To: omer@particleformen.com',
    ccList ? `Cc: ${ccList}` : '',
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
  ].filter(Boolean).join('\r\n');

  return Buffer.from(raw).toString('base64url');
}

router.use(verifyJWT);

// POST /api/gmail/send — send email from connected Google account
router.post('/send', async (req, res) => {
  const { to, cc, subject, htmlBody, textBody, skipDefaultCc } = req.body;
  if (!to || !subject) return res.status(400).json({ error: 'to and subject required' });

  try {
    const gmail = await getGmailClient();
    const raw = buildEmail({
      to,
      cc: Array.isArray(cc) ? cc : (cc ? [cc] : []),
      subject,
      htmlBody: htmlBody || `<pre>${textBody || ''}</pre>`,
      from: 'tomer@particleformen.com',
      skipDefaultCc: !!skipDefaultCc,
    });

    const result = await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    });

    res.json({ messageId: result.data.id, success: true });
  } catch (err) {
    console.error('Gmail send error:', err.message);
    if (err.message?.includes('insufficient')) {
      return res.status(403).json({ error: 'Gmail send permission not granted. Re-authorize in Settings.' });
    }
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.sendEmail = async function sendEmail({ to, cc, subject, htmlBody, skipDefaultCc }) {
  try {
    const gmail = await getGmailClient();
    const raw = buildEmail({ to, cc, subject, htmlBody, from: 'tomer@particleformen.com', skipDefaultCc });
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return true;
  } catch (err) {
    console.error('sendEmail error:', err.message);
    return false;
  }
};

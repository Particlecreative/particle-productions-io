/**
 * /api/growth — the Growth Studio's own endpoints (any signed-in person may use them; Growth is limited to these
 * plus the list in middleware/auth.js).
 *   GET /afterlife-pass   → { url } the Ads Library: AfterLife's "Fresh to test", opened through a 2-minute signed pass
 *                           (AfterLife's /embed/fresh — its own frame-only session; the AfterLife sign-in can't work
 *                           inside CP's frame, it's another site). Contract in AfterLife apps/web/app/lib/embed-pass.ts.
 */
const crypto = require('crypto');
const router = require('express').Router();
const { verifyJWT } = require('../middleware/auth');

router.use(verifyJWT);

/** pass = base64url(payload) + "." + base64url(HMAC-SHA256(key, payloadB64)), key = HMAC-SHA256(export token, "cp-embed-v1"). Pure — tested. */
function makePass({ email, name, role }, { secret, now = Date.now(), ttlSec = 120 } = {}) {
  if (!secret || !email) return null;
  const payload = { email: String(email).toLowerCase(), name: name || null, cp_role: role || null, exp: Math.floor(now / 1000) + ttlSec, nonce: crypto.randomBytes(16).toString('hex') };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const key = crypto.createHmac('sha256', secret).update('cp-embed-v1').digest();
  return `${body}.${crypto.createHmac('sha256', key).update(body).digest('base64url')}`;
}

router.get('/afterlife-pass', (req, res) => {
  const base = (process.env.AFTERLIFE_URL || '').replace(/\/$/, '');
  const pass = makePass({ email: req.user?.email, name: req.user?.name, role: req.user?.role }, { secret: process.env.AFTERLIFE_EXPORT_TOKEN });
  if (!base || !pass) return res.status(503).json({ error: 'The Ads Library isn’t connected to AfterLife yet' });
  res.set('Cache-Control', 'no-store').json({ url: `${base}/embed/fresh?pass=${encodeURIComponent(pass)}`, base });
});

module.exports = router;
module.exports.makePass = makePass;

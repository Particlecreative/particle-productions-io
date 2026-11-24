const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { growthMay } = require('../src/middleware/auth');
const { labelFor } = require('../src/lib/activity');
const { makePass } = require('../src/routes/growth');
const { briefSignature } = require('../src/lib/medium/monday');

const ID = '3cbab4a3-91f1-43b0-ae0e-20d0bcdee75f';

test('Growth gate: the Growth Studio is open', () => {
  const ok = [
    ['GET', '/api/auth/me'], ['GET', '/api/brands'], ['GET', '/api/settings/particle'], ['GET', '/api/notifications'],
    ['GET', '/api/productions'], ['GET', '/api/productions/PRD26-20'], ['GET', '/api/library'], ['GET', '/api/library/productions/PRD26-20'],
    ['GET', '/api/studio/dashboard'], ['GET', '/api/studio/campaign-groups'], ['GET', '/api/studio/items/123/updates'], ['GET', '/api/studio/campaigns'], ['GET', '/api/studio/ticket-form'], ['POST', '/api/studio/ticket/draft'], ['POST', '/api/studio/ticket/submit'],
    ['GET', '/api/medium/briefs'], ['GET', `/api/medium/briefs/${ID}`], ['POST', '/api/medium/generate'], ['POST', '/api/medium/freeform'],
    ['PUT', `/api/medium/briefs/${ID}`], ['POST', `/api/medium/briefs/${ID}/approve`], ['POST', `/api/medium/briefs/${ID}/submit`],
    ['GET', '/api/me/monday'], ['POST', '/api/me/monday/token'], ['GET', '/api/me/monday/connect'], ['DELETE', '/api/me/monday'], ['POST', '/api/me/activity'],
    ['GET', '/api/growth/afterlife-pass'], ['GET', '/api/studio/my-requests'], ['GET', '/api/medium/market'], ['GET', '/api/medium/config'], ['GET', '/api/medium/corpus'],
  ];
  for (const [m, p] of ok) assert.ok(growthMay(m, p), `${m} ${p} should be allowed`);
});

test('Growth gate: money, admin, moving work and Medium settings are closed', () => {
  const no = [
    ['GET', '/api/line-items'], ['GET', '/api/finance/dashboard'], ['GET', '/api/invoices'], ['GET', '/api/contracts'], ['GET', '/api/suppliers'],
    ['GET', '/api/cc-purchases'], ['GET', '/api/people-on-set'], ['GET', '/api/settings/monday-config'], ['GET', '/api/users'], ['GET', '/api/captain/overview'],
    ['PATCH', '/api/productions/PRD26-20'], ['POST', '/api/productions'], ['GET', '/api/productions/PRD26-20/history'], ['GET', '/api/tracker'],
    ['PATCH', '/api/studio/items/123'], ['POST', '/api/studio/items/123/archive'], ['PUT', '/api/studio/autoplan'], ['POST', '/api/studio/fit'], ['PUT', '/api/studio/campaign-groups'],
    ['POST', '/api/studio/ticket-link'], ['GET', '/api/studio/connections'],
    ['PUT', '/api/medium/config'], ['POST', '/api/medium/buyer-signal'], ['POST', '/api/medium/market/refresh'], ['POST', '/api/medium/corpus/ingest'], ['PUT', '/api/medium/surveys/key'], ['POST', '/api/medium/autopilot/run'],
    ['POST', '/api/medium/campaigns/backfill'], ['POST', '/api/medium/mass/produce'], ['GET', '/api/activity'], ['POST', '/api/library/items'],
  ];
  for (const [m, p] of no) assert.equal(growthMay(m, p), false, `${m} ${p} should be refused`);
});

test('Team activity: actions get a plain label, noise gets none', () => {
  assert.deepEqual(labelFor('POST', `/api/medium/briefs/${ID}/approve`), { kind: 'brief_approve', label: 'Approved a brief', ref: ID });
  assert.equal(labelFor('POST', '/api/studio/ticket/submit').kind, 'ticket_create');
  assert.equal(labelFor('GET', '/api/growth/afterlife-pass').kind, 'ads_library');
  assert.equal(labelFor('GET', '/api/productions/PRD26-20').ref, 'PRD26-20');
  assert.equal(labelFor('GET', '/api/notifications'), null);
  assert.equal(labelFor('GET', '/api/settings/particle'), null);
});

test('Ads Library pass: the AfterLife contract (payload + HMAC with the derived key, 2-minute life)', () => {
  const secret = 'x'.repeat(64);
  const now = Date.parse('2026-11-17T12:00:00Z');
  const pass = makePass({ email: 'Dana@ParticleForMen.com', name: 'Dana', role: 'Growth' }, { secret, now });
  const [body, sig] = pass.split('.');
  const key = crypto.createHmac('sha256', secret).update('cp-embed-v1').digest();
  assert.equal(sig, crypto.createHmac('sha256', key).update(body).digest('base64url'));
  const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  assert.equal(p.email, 'dana@particleformen.com');
  assert.equal(p.exp, Math.floor(now / 1000) + 120);
  assert.match(p.nonce, /^[0-9a-f]{32}$/);
  assert.equal(makePass({ email: 'a@b.c' }, { secret: '' }), null);
});

test('Brief signature: their name on it, and who sent it when CP’s account created it', () => {
  assert.equal(briefSignature({ approver: 'Dana Levi', author: 'Dana Levi', asUser: true }), 'Brief by Medium for Dana Levi · approved by Dana Levi');
  assert.equal(briefSignature({ approver: 'Tomer', author: 'Medium autopilot', asUser: false }), 'Brief written by Medium · approved by Tomer · sent from CP by Tomer');
});

// The Creative team's CP (25 Nov 2026): what a video editor / designer may call, and what stays closed (money, admin,
// scheduling, other people's settings). The ticket-is-theirs check lives in routes/studio.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const { creativeMay, growthMay } = require('../src/middleware/auth');
const ID = '0b9a7c4e-1234-4abc-9def-0123456789ab';

test('Creative: their tasks, board, updates, briefs, productions, libraries, On Air, the team weekly, My AFTERLIFE', () => {
  const ok = [
    ['GET', '/api/auth/me'], ['GET', '/api/notifications'], ['GET', '/api/notifications/settings'], ['PUT', '/api/notifications/settings'], ['POST', '/api/notifications/read-all'],
    ['GET', '/api/settings/view-order/creative-home'], ['PUT', '/api/settings/view-order/creative-board'], ['PUT', '/api/settings/view-order/sidebar'],
    ['GET', '/api/productions'], ['GET', '/api/productions/PRD26-20'], ['GET', '/api/library'], ['GET', '/api/library/items'],
    ['GET', '/api/studio/dashboard'], ['GET', '/api/studio/my-tasks'], ['GET', '/api/studio/my-requests'], ['GET', '/api/studio/ticket-form'],
    ['GET', '/api/studio/items/123/updates'], ['GET', '/api/studio/items/123/activity'], ['PATCH', '/api/studio/items/123'], ['PATCH', '/api/studio/items/123/link'],
    ['POST', '/api/studio/items/123/updates'], ['POST', '/api/studio/items/123/updates/456/like'], ['PUT', '/api/studio/items/123/updates/456'],
    ['POST', '/api/studio/ticket/draft'], ['POST', '/api/studio/ticket/submit'],
    ['GET', '/api/medium/briefs'], ['POST', '/api/medium/freeform'], ['PUT', `/api/medium/briefs/${ID}`], ['POST', `/api/medium/briefs/${ID}/submit`],
    ['GET', '/api/me/monday'], ['POST', '/api/me/activity'], ['GET', '/api/growth/afterlife-pass'], ['GET', '/api/growth/productions'],
    ['GET', '/api/onair/tv'], ['GET', '/api/onair/media'],
    ['GET', '/api/creative-reports'], ['GET', `/api/creative-reports/${ID}`], ['GET', `/api/creative-reports/${ID}/picks`],
  ];
  for (const [m, p] of ok) assert.ok(creativeMay(m, p), `${m} ${p} should be allowed`);
});

test('Creative: money, admin, scheduling tools, Medium settings, editing the weekly — closed', () => {
  const no = [
    ['GET', '/api/line-items'], ['GET', '/api/finance/dashboard'], ['GET', '/api/invoices'], ['GET', '/api/contracts'], ['GET', '/api/suppliers'], ['GET', '/api/cc-purchases'],
    ['GET', '/api/users'], ['GET', '/api/settings/monday-config/x'], ['PUT', '/api/settings/view-order/dashboard_particle'], ['GET', '/api/captain/overview'],
    ['PATCH', '/api/productions/PRD26-20'], ['POST', '/api/productions'], ['GET', '/api/tracker'],
    ['POST', '/api/studio/items/123/archive'], ['PUT', '/api/studio/autoplan'], ['POST', '/api/studio/fit'], ['GET', '/api/studio/connections'], ['POST', '/api/studio/ticket-link'],
    ['PUT', '/api/medium/config'], ['POST', '/api/medium/mass/produce'], ['POST', '/api/medium/market/refresh'],
    ['POST', '/api/onair/tv/refresh'], ['PUT', `/api/creative-reports/${ID}`], ['POST', '/api/creative-reports/generate'], ['GET', `/api/creative-reports/${ID}/versions`],
    ['GET', '/api/activity'], ['POST', '/api/library/items'],
  ];
  for (const [m, p] of no) assert.equal(creativeMay(m, p), false, `${m} ${p} should be refused`);
});

test('Growth: may now save its own sidebar and notification settings, still no Creative-only writes', () => {
  assert.ok(growthMay('PUT', '/api/settings/view-order/sidebar'));
  assert.ok(growthMay('GET', '/api/notifications/settings'));
  assert.equal(growthMay('PATCH', '/api/studio/items/123'), false);
  assert.equal(growthMay('POST', '/api/studio/items/123/updates'), false);
  assert.equal(growthMay('GET', '/api/onair/media'), false);
});

// The bench (25 Nov 2026): delivery checklist boxes, quiet hours settings, who may call the new endpoints.
//   cd backend && node --test test/bench.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/lib/studio/craft');
const N = require('../src/lib/notify/store');
const { creativeMay, growthMay } = require('../src/middleware/auth');

test('checklist boxes: sizes × versions for 2–6 versions, one per size otherwise, versions alone when no sizes', () => {
  assert.deepEqual(C.boxesOf(['9x16', '1x1']), ['9x16', '1x1']);
  assert.deepEqual(C.boxesOf(['9x16', '1x1'], 2), ['9x16 · V1', '9x16 · V2', '1x1 · V1', '1x1 · V2']);
  assert.deepEqual(C.boxesOf(['9x16'], 9), ['9x16']);                 // too many versions → per size
  assert.deepEqual(C.boxesOf([], 3), ['V1', 'V2', 'V3']);
  assert.deepEqual(C.boxesOf([], 1), []);
  assert.deepEqual(C.boxesOf([' 9x16 ', '9x16', '']), ['9x16']);
});

test('quiet hours: kept with valid times, defaults for bad ones, null clears', () => {
  assert.deepEqual(N.clean({ quiet_hours: { on: true, from: '21:30', to: '07:00', weekend: true } }).quiet_hours, { on: true, from: '21:30', to: '07:00', weekend: true });
  assert.deepEqual(N.clean({ quiet_hours: { on: true, from: '25:00', to: 'x' } }).quiet_hours, { on: true, from: '20:00', to: '08:00', weekend: false });
  assert.equal(N.clean({ quiet_hours: null }).quiet_hours, null);
  assert.equal('quiet_hours' in N.clean({ toast: true }), false);
});

test('the bench endpoints: the creative team yes (their own — studio.js checks); Growth can’t tick checklists', () => {
  for (const p of ['/api/studio/my-checklists', '/api/studio/my-frame', '/api/studio/now-working', '/api/timetrack/me']) assert.equal(creativeMay('GET', p), true, p);
  assert.equal(creativeMay('GET', '/api/studio/items/123/checklist'), true);
  assert.equal(creativeMay('PUT', '/api/studio/items/123/checklist'), true);
  assert.equal(creativeMay('DELETE', '/api/studio/items/123/checklist'), false);
  assert.equal(growthMay('PUT', '/api/studio/items/123/checklist'), false);
});

test('accrual emails are off by default (Tomer, 25 Nov 2026) — the report is still built for the Finance page', async () => {
  const cfg = require('../src/lib/finance/config');
  assert.equal(cfg.DEFAULTS.accrual_emails, false);
  const A = require('../src/lib/finance/accrual');
  const orig = cfg.get;
  cfg.get = async () => ({ ...cfg.DEFAULTS });
  try {
    assert.deepEqual(await A.sendDraft({ id: 1, month: '2026-11-01', built_at: new Date().toISOString() }), { skipped: 'accrual emails are off' });
    const r = { id: 1, month: '2026-11-01', status: 'approved', data: { companies: [] } };
    assert.equal(await A.send(r, { name: 'Tomer' }), r);   // no email, stays approved
  } finally { cfg.get = orig; }
});

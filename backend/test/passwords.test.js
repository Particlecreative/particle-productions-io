// Studio passwords — rows never carry a password, money only for producers / admins, writes shaped for Monday.
//   cd backend && node --test test/passwords.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/lib/studio/passwords');
const { creativeMay, growthMay } = require('../src/middleware/auth');

const raw = {
  id: 123, name: 'Sample Music', updated_at: '2026-11-25T10:00:00Z', group: { id: 'group_mkwyvpdy' },
  column_values: [
    { id: 'link', text: 'https://example.com', value: JSON.stringify({ url: 'https://example.com/login', text: 'example.com' }) },
    { id: 'text', text: 'studio@example.com', value: '"studio@example.com"' },
    { id: 'text_1', text: 'secret-value', value: '"secret-value"' },
    { id: 'person', text: 'A', value: JSON.stringify({ personsAndTeams: [{ id: 5, kind: 'person' }, { id: 9, kind: 'team' }] }) },
    { id: 'boolean_mkwyt3r2', text: 'v', value: JSON.stringify({ checked: 'true' }) },
    { id: 'text_mky8qr8h', text: '12th', value: '"12th"' },
    { id: 'numeric_mky8j6nq', text: '300', value: '"300"' },
    { id: 'numeric_mky88psf', text: '29', value: '"29"' },
  ],
};

test('a row says whether there is a password — never the password itself', () => {
  const r = P.rowOf(raw, { withMoney: true });
  assert.equal(r.has_password, true);
  assert.equal(JSON.stringify(r).includes('secret-value'), false);
  assert.deepEqual({ id: r.id, link: r.link, login: r.login, people: r.people, flag: r.flag, renewal: r.renewal, credits: r.credits, monthly: r.monthly },
    { id: '123', link: 'https://example.com/login', login: 'studio@example.com', people: ['5'], flag: true, renewal: '12th', credits: 300, monthly: 29 });
});

test('the creative team gets no money fields', () => {
  const r = P.rowOf(raw, { withMoney: false });
  assert.equal('monthly' in r, false);
  assert.equal('credits' in r, false);
});

test('writes: only the fields given, link checked, money refused without the right', () => {
  const { values, fields } = P.valuesOf({ login: ' me@x.com ', password: 'p@ss', flag: true, link: 'https://www.tool.io/a' });
  assert.deepEqual(fields, ['link', 'login', 'password', 'flag']);
  assert.deepEqual(values.link, { url: 'https://www.tool.io/a', text: 'tool.io' });
  assert.equal(values.text, 'me@x.com');
  assert.equal(values.text_1, 'p@ss');
  assert.deepEqual(values.boolean_mkwyt3r2, { checked: 'true' });
  assert.throws(() => P.valuesOf({ link: 'tool.io' }), /http/);
  assert.throws(() => P.valuesOf({ monthly: 10 }, { withMoney: false }), /admins and producers/);
  assert.equal(P.valuesOf({ monthly: 10 }, { withMoney: true }).values.numeric_mky88psf, '10');
  assert.equal(P.valuesOf({ flag: false }).values.boolean_mkwyt3r2, null);
});

test('the creative team may read, reveal, edit and add — Growth may not', () => {
  assert.equal(creativeMay('GET', '/api/passwords'), true);
  assert.equal(creativeMay('POST', '/api/passwords/particle/123/reveal'), true);
  assert.equal(creativeMay('PATCH', '/api/passwords/blurr/123'), true);
  assert.equal(creativeMay('POST', '/api/passwords/particle'), true);
  assert.equal(creativeMay('GET', '/api/passwords/history'), false);
  assert.equal(creativeMay('DELETE', '/api/passwords/particle/123'), false);
  assert.equal(growthMay('GET', '/api/passwords'), false);
});

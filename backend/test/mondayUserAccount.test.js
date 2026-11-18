// A person's Monday token is accepted when it's the company's Monday account (same account id as CP's own token).
// 18 Nov 2026: the old slug check ('particleformen') turned away Tomer's own token — the account's slug is particle-for-men.
const test = require('node:test');
const assert = require('node:assert/strict');

const mondayPath = require.resolve('../src/lib/monday');
require.cache[mondayPath] = {
  id: mondayPath, filename: mondayPath, loaded: true,
  exports: { mondayQuery: async () => ({ me: { account: { id: '11978994', slug: 'particle-for-men', name: 'Particle For Men' } } }) },
};
const MU = require('../src/lib/mondayUser');

test('the company account is accepted by id, whatever its slug; another account is turned away', async () => {
  await MU.checkAccount({ id: '1', account: { id: '11978994', slug: 'particle-for-men', name: 'Particle For Men' } });
  await MU.checkAccount({ id: '2', account: { id: 11978994, slug: 'renamed-later', name: 'Particle For Men' } });
  await assert.rejects(MU.checkAccount({ id: '3', account: { id: '555', slug: 'someone-else', name: 'Someone Else' } }), /“Someone Else” Monday account — connect the company's Monday \(particle-for-men\.monday\.com\)/);
});

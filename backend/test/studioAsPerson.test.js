// Studio writes go to Monday as the person when they connected their own Monday (18 Nov 2026), else CP's account.
const test = require('node:test');
const assert = require('node:assert/strict');

// a stand-in Monday: records which token each call used; 'revoked' is refused like Monday refuses a dead token
const calls = [];
const mondayPath = require.resolve('../src/lib/monday');
require.cache[mondayPath] = {
  id: mondayPath, filename: mondayPath, loaded: true,
  exports: {
    clearCache: () => {}, normLabel: (s) => String(s).toLowerCase(),
    boardMeta: async () => ({ statusMaps: {} }),
    mondayQuery: async (query, vars, opts = {}) => {
      calls.push({ query: query.trim().split(/\s+/)[0], token: opts.token || null, body: vars?.body });
      if (opts.token === 'revoked' && /^mutation/.test(query.trim())) throw Object.assign(new Error('Not Authenticated'), { status: 401 });
      if (/items\(ids/.test(query)) return { items: [{ id: vars.ids[0], board: { id: '111' } }] };
      if (/create_update/.test(query)) return { create_update: { id: '9' } };
      return { change_multiple_column_values: { id: '1' }, archive_item: { id: '1' } };
    },
  },
};
const W = require('../src/lib/studio/write');
const config = { boards: { video: { board_id: '111', columns: { timeline: 'tl', person: 'people', status: 'status', deadline: 'dl' } }, design: { board_id: '222', columns: { timeline: 'tl', person: 'people', status: 'status', deadline: 'dl' } } } };
const mutations = () => calls.filter(c => c.query === 'mutation');

test('asPerson: their token when connected; CP’s account when not connected or when Monday refuses theirs', async () => {
  const seen = [];
  const run = async (t) => { seen.push(t); if (t === 'bad') throw Object.assign(new Error('User unauthorized to perform action'), { code: 'UserUnauthorizedException' }); return 'ok'; };
  assert.deepEqual(await W.asPerson(null, run), { result: 'ok', as_user: false });
  assert.deepEqual(await W.asPerson('mine', run), { result: 'ok', as_user: true });
  const r = await W.asPerson('bad', run);
  assert.equal(r.as_user, false);
  assert.match(r.refused, /unauthorized/);
  assert.deepEqual(seen, [null, 'mine', 'bad', null]);
  // a real mistake (bad value) is not retried on CP's account
  await assert.rejects(W.asPerson('mine', async () => { throw new Error('invalid value for column'); }), /invalid value/);
});

test('scheduling and comments use the person’s Monday; comments as them carry no “via CP Studio” line', async () => {
  calls.length = 0;
  const s = await W.updateTask(config, { board: 'video', itemId: '5', timeline: { from: '2026-11-22', to: '2026-11-24' } }, { token: 'omer' });
  assert.equal(s.as_user, true);
  assert.equal(mutations()[0].token, 'omer');

  calls.length = 0;
  const c = await W.postUpdate(config, '5', 'Moved to Sunday', 'Omer Ben Simon', [], { token: 'omer' });
  assert.equal(c.as_user, true);
  assert.equal(mutations()[0].token, 'omer');
  assert.doesNotMatch(mutations()[0].body, /via CP Studio/);

  calls.length = 0;
  const cp = await W.postUpdate(config, '5', 'Moved to Sunday', 'Omer Ben Simon');
  assert.equal(cp.as_user, false);
  assert.equal(mutations()[0].token, null);
  assert.match(mutations()[0].body, /Omer Ben Simon, via CP Studio/);
});

test('a revoked token falls back to CP’s account, and the CP comment says who wrote it', async () => {
  calls.length = 0;
  const c = await W.postUpdate(config, '5', 'Done', 'Omer Ben Simon', [], { token: 'revoked' });
  assert.equal(c.as_user, false);
  assert.deepEqual(mutations().map(m => m.token), ['revoked', null]);
  assert.match(mutations()[1].body, /via CP Studio/);
  calls.length = 0;
  const a = await W.archiveTask(config, '5', { token: 'revoked' });
  assert.equal(a.as_user, false);
  assert.deepEqual(mutations().map(m => m.token), ['revoked', null]);
});

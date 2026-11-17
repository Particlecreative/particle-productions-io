// Studio task updates: Monday's HTML → links and @mentions the panel can show; tagged posts become real mentions.
const test = require('node:test');
const assert = require('node:assert/strict');
const { richOf, updateHtml } = require('../src/lib/studio/write');

test('Update HTML: a word that IS a link keeps its address; mentions stay mentions', () => {
  const html = '<p><a class="user_mention_editor router" href="https://acct.monday.com/users/1" data-mention-type="User" data-mention-id="1">@Dana Levi</a> '
    + '<a class="user_mention_editor router" href="https://acct.monday.com/users/2" data-mention-type="User">@Sam Cohen</a></p>'
    + '<p>Uploaded on <a href="https://www.dropbox.com/scl/fo/abc?rlkey=1&amp;dl=0" target="_blank">Dropbox</a> folder.</p>';
  assert.deepEqual(richOf(html), [
    { t: 'mention', v: '@Dana Levi' }, { t: 'text', v: ' ' }, { t: 'mention', v: '@Sam Cohen' },
    { t: 'text', v: '\nUploaded on ' }, { t: 'link', v: 'Dropbox', href: 'https://www.dropbox.com/scl/fo/abc?rlkey=1&dl=0' }, { t: 'text', v: ' folder.' },
  ]);
});

test('Update HTML: plain text needs no segments; empty is null', () => {
  assert.equal(richOf('<p>Just text &amp; more</p>'), null);
  assert.equal(richOf(''), null);
  assert.equal(richOf(null), null);
});

test('Posting: only people still tagged in the text become mention chips', () => {
  const { html, tags } = updateHtml('Hi @Dana Levi, see @Dan', 'Someone', [{ id: '1', name: 'Dana Levi' }, { id: '2', name: 'Dan' }, { id: '3', name: 'Gone Person' }]);
  assert.deepEqual(tags.map(t => t.id), ['1', '2']);
  assert.match(html, /data-mention-id="1"[^>]*>@Dana Levi<\/a>/);
  assert.match(html, /data-mention-id="2"[^>]*>@Dan<\/a>/);
  assert.ok(!html.includes('Gone Person'));
});

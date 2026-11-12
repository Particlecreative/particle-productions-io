// Ticket creator: files land in "Relevant Files" (and are confirmed), the Brand picker, the email-proofreader export.
//   cd backend && node --test test/studio/ticketFiles.test.js
const test = require('node:test');
const assert = require('node:assert/strict');

// Monday + the file store stand in before tickets.js loads (it destructures addUpdate at require time)
const calls = [];
const write = require('../../src/lib/studio/write');
write.addUpdate = async (itemId, html) => { calls.push(['update', itemId, html]); return { create_update: { id: '900' } }; };
const monday = require('../../src/lib/monday');
const sources = require('../../src/lib/studio/sources');
const tickets = require('../../src/lib/studio/tickets');

const FILE = (name) => ({ name, mime: 'image/png', buffer: Buffer.from('x') });

test('files go in the Relevant Files column, and the update lists them', async () => {
  calls.length = 0;
  sources.filesForMonday = async (ids) => ids.map(id => FILE(`${id}.png`));
  monday.addFileToColumn = async (item, col, f) => { calls.push(['column', item, col, f.name]); return { add_file_to_column: { id: `a-${f.name}` } }; };
  monday.addFileToUpdate = async () => { throw new Error('should not be used'); };
  monday.itemAssetIds = async () => new Set(['a-ref1.png', 'a-ref2.png']);
  const r = await tickets.attachFiles({ itemId: '123', column: 'files', fileIds: ['ref1', 'ref2'], clean: tickets.emptyFields(), board: 'video', user: { name: 'Dana' } });
  assert.deepEqual(r, { attached: 2, inColumn: 2, failed: [] });
  assert.deepEqual(calls.filter(c => c[0] === 'column').map(c => c[2]), ['files', 'files']);
  const upd = calls.find(c => c[0] === 'update');
  assert.match(upd[2], /📎 Files in “Relevant Files”: ref1\.png, ref2\.png/);
  assert.match(upd[2], /by Dana<\/em>$/);
});

test('a file the column refuses goes on the brief update; one Monday does not show is reported', async () => {
  calls.length = 0;
  sources.filesForMonday = async () => [FILE('big.mov'), FILE('ok.png')];
  monday.addFileToColumn = async (item, col, f) => { if (f.name === 'big.mov') throw new Error('too large'); return { add_file_to_column: { id: 'a1' } }; };
  monday.addFileToUpdate = async (updateId, f) => { calls.push(['on-update', updateId, f.name]); return { add_file_to_update: { id: 'a2' } }; };
  monday.itemAssetIds = async () => new Set(['a1']);   // the update file never showed up
  const r = await tickets.attachFiles({ itemId: '123', column: 'files', fileIds: ['x', 'y'], clean: tickets.emptyFields(), board: 'design' });
  assert.deepEqual(calls.filter(c => c[0] === 'on-update'), [['on-update', '900', 'big.mov']]);
  assert.equal(r.attached, 1);
  assert.equal(r.inColumn, 1);
  assert.deepEqual(r.failed, ["big.mov (uploaded, but Monday doesn't show it on the task)"]);
});

test('files that expired from the store are reported, not silently dropped', async () => {
  sources.filesForMonday = async () => [FILE('one.png')];
  monday.addFileToColumn = async () => ({ add_file_to_column: { id: 'z' } });
  monday.itemAssetIds = async () => new Set(['z']);
  const r = await tickets.attachFiles({ itemId: '5', column: 'files', fileIds: ['a', 'b', 'c'], clean: tickets.emptyFields(), board: 'video' });
  assert.equal(r.attached, 1);
  assert.match(r.failed[0], /^2 files were no longer on the server/);
});

test('brand: taken from the chat only when exactly one brand is named', () => {
  const opts = ['Particle', 'Ashford', 'Levitas', 'Clearstep', 'Blurr', 'Biomella'];
  assert.equal(tickets.brandNamed([{ role: 'user', content: 'A BIOMELLA face cream static, 3 versions' }], opts), 'Biomella');
  assert.equal(tickets.brandNamed([{ role: 'user', content: 'Face Cream static, 3 versions' }], opts), null);           // Particle or Biomella?
  assert.equal(tickets.brandNamed([{ role: 'user', content: 'Particle vs Biomella comparison' }], opts), null);
  assert.equal(tickets.brandNamed([{ role: 'assistant', content: 'Is it for Blurr?' }, { role: 'user', content: 'yes' }], opts), null);   // only what the requester wrote
  assert.equal(tickets.brandNamed([{ role: 'user', content: 'blurrskin.com hero banner' }], opts), null);                // a word inside another word isn't the brand
});

test('brand picker: required, offers Blurr and Biomella even before Monday has them; product reads both columns', async () => {
  const status = (labels) => ({ byIndex: Object.fromEntries(labels.map((l, i) => [i, { label: l }])) });
  monday.boardMeta = async () => ({
    columns: Object.fromEntries(['label', 'status_1__1', 'label9', 'dropdown_mm8qh5b', 'dropdown_mm8q7ysv', 'color_mm8q1bam', 'color_mm8q3pn9', 'label4', 'long_text_mkn8c1ax', 'long_textpvqldjpg']
      .map(c => [c, { type: c.startsWith('dropdown') ? 'dropdown' : 'status' }])),
    statusMaps: { label: status(['Marketing/Media']), status_1__1: status(['Email']), label9: status(['Face Cream']), color_mm8q1bam: status(['Particle', 'Ashford', 'Levitas', 'Clearstep']), color_mm8q3pn9: status(['Particle', 'Ashford']), label4: status(['CTA']) },
    dropdowns: { dropdown_mm8qh5b: ['Face Cream', 'Bone & Joint'], dropdown_mm8q7ysv: ['Face Cream', 'Antifungal Foot Treatment'] },
  });
  const form = await tickets.ticketForm({ boards: { video: { board_id: 1 }, design: { board_id: 2 } } }, {});
  const brand = form.boards.video.fields.find(f => f.key === 'brand');
  assert.equal(brand.required, true);
  assert.deepEqual(brand.options, ['Particle', 'Ashford', 'Levitas', 'Clearstep', 'Blurr', 'Biomella']);
  assert.deepEqual(form.boards.video.fields.find(f => f.key === 'product').options, ['Face Cream', 'Bone & Joint']);
  assert.deepEqual(form.boards.design.fields.find(f => f.key === 'product').options, ['Face Cream', 'Antifungal Foot Treatment']);
  // a draft with no brand can't be submitted
  const clean = tickets.sanitize(form, 'video', { department: 'Marketing/Media', product: 'Face Cream', type: 'CTA', task_name: 'x', concept: 'y' });
  assert.equal(clean.brand, '');
  assert.match(tickets.briefText('video', { ...clean, brand: 'Biomella' }), /^Department: Marketing\/Media \| Brand: Biomella \| Product: Face Cream/);
});

// ── the email proofreader export ─────────────────────────────────────────────
const X = require('../../src/lib/captain/emailExport');
const item = (id, type, title, extra = {}) => ({ id, type, title, content: null, discipline: 'both', scope: {}, data: null, ...extra });

test('email export: the Brain filtered for emails, facts, website, mistakes', () => {
  const { md, counts } = X.emailMd({
    brand: 'Particle', about: "the men's skincare brand Particle", today: '2026-11-12',
    items: [
      item(1, 'term', 'Gravité'), item(2, 'term', 'gravité'), item(3, 'term', 'NeoRoot'),
      item(4, 'rule', 'Never write "cure"', { content: 'Never write "cure" — say "helps"' }),
      item(5, 'rule', 'Subtitles', { content: 'Subtitles must stay inside the safe zone', discipline: 'video' }),   // video mechanics → out
      item(6, 'learned', 'Moisturizer', { content: 'US spelling: moisturizer, not moisturiser (see https://monday.com/x/123456789012)', discipline: 'video' }),
      item(7, 'rule', 'Ashford CTA', { content: 'Ashford CTA is Shop Ashford', scope: { brand: 'Ashford' } }),           // another brand → out
      item(8, 'rule', 'SFY no logo', { content: 'No Particle logo in SFY ads', scope: { lane: 'SFY' } }),                // ad lane → out
      item(9, 'do_not_flag', 'obsessed!!', { content: 'creator slang' }),
      item(10, 'rule', 'Face Cream wording', { content: 'Say "eye bags", never "eyebags"', scope: { product: 'Face Cream' } }),
      item(11, 'offer', 'Black Friday 2026', { data: { code: 'BF40', tiers: '40', starts: '2026-11-20', ends: '2026-12-01' } }),
      item(12, 'offer', 'Labor Day', { data: { code: 'LABOR30', tiers: '30', ends: '2026-09-08' } }),
      item(13, 'price', 'Face Cream', { data: { list_price: '59', aliases: ['Anti-Aging Face Cream'] } }),
      item(14, 'claim', 'Firms, lifts and moisturizes', { content: 'Clinical study, Mar 2026', scope: { product: 'Face Cream' } }),
    ],
    mistakes: [{ found: 'recieve', fix: 'receive', n: 7 }, { found: 'Gravite', fix: 'Gravité', n: 3 }],
    checks: { video: 310, design: 220 },
    site_block: 'FROM THE PARTICLE WEBSITE (public, read 2026-11-12) — header line\nTagline: Skincare for men\nProducts:\n• Face Cream $59',
  });
  assert.match(md, /^---\nname: captain-caption-email-proofreader\ndescription: Proofreads Particle marketing emails/);
  assert.match(md, /310 video and 220 design checks/);
  assert.match(md, /Gravité · NeoRoot\n/);                                 // deduped
  assert.match(md, /- Never write "cure" — say "helps"\n/);
  assert.match(md, /- US spelling: moisturizer, not moisturiser\n/);   // learned from a video, link removed
  assert.match(md, /- Say "eye bags", never "eyebags" _\(Face Cream only\)_/);
  assert.doesNotMatch(md, /safe zone|Shop Ashford|SFY ads/);
  assert.match(md, /\| Black Friday 2026 \| BF40 \| 40% off \| 2026-11-20 \| 2026-12-01 \|/);
  assert.match(md, /- LABOR30 — Labor Day, ended 2026-09-08/);
  assert.match(md, /\| Face Cream \| \$59 \| Anti-Aging Face Cream \|/);
  assert.match(md, /- Firms, lifts and moisturizes _\(Face Cream\)_ — source: Clinical study, Mar 2026/);
  assert.match(md, /- "recieve" → "receive" \(7×\)/);
  assert.match(md, /## From the Particle website[\s\S]*Tagline: Skincare for men/);
  assert.doesNotMatch(md, /header line/);
  assert.equal(counts.left_out, 1);
  assert.equal(counts.terms, 2);
  assert.equal(counts.offers, 1);
  assert.equal(counts.ended, 1);
});

test('email export: another brand gets only its own and the general items', () => {
  const items = [item(1, 'rule', 'General', { content: 'Always US spelling' }), item(2, 'rule', 'P', { content: 'Particle only', scope: { lane: 'Particle' } }), item(3, 'rule', 'B', { content: 'Biomella CTA is Shop Now', scope: { brand: 'Biomella' } })];
  const { md } = X.emailMd({ brand: 'Biomella', about: 'Biomella', today: '2026-11-12', items, mistakes: [], checks: {} });
  assert.match(md, /Always US spelling/);
  assert.match(md, /Biomella CTA is Shop Now/);
  assert.doesNotMatch(md, /Particle only/);
  assert.equal(X.nameRegex(['ashford', 'Blurr!']), '(^|[^a-z])(ashford|blurr)([^a-z]|$)');
});

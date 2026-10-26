const test = require('node:test');
const assert = require('node:assert');
const { classify, thumbUrl, verifyThumb } = require('../../src/lib/library');

const cat = (n) => classify(n).category;

test('finals sort themselves by file name', () => {
  assert.strictEqual(cat('The_Hunt_30s_TV_Master_16x9.mov'), 'tv_master');
  assert.strictEqual(cat('THE HUNT 30 BROADCAST.mxf'), 'tv_master');
  assert.strictEqual(cat('TheHunt_15s_9x16_EN.mp4'), 'digital');
  assert.strictEqual(cat('TheHunt_15s_9x16.mov'), 'digital', 'a vertical .mov is a digital version');
  assert.strictEqual(cat('TheHunt_6s_1x1_v3.mp4'), 'digital');
  assert.strictEqual(cat('Hunt_30_Music_Stem.wav'), 'sound');
  assert.strictEqual(cat('Hunt_30_DIALOG.aif'), 'sound');
  assert.strictEqual(cat('Hunt 30 M&E.mov'), 'sound');
  assert.strictEqual(cat('Hunt_Subtitles_HE.srt'), 'other');
});

test('specs come from the name', () => {
  assert.deepStrictEqual(classify('TheHunt_15s_9x16_EN_v3.mp4').specs, { aspect: '9:16', duration: 15, language: 'EN', version: 'v3' });
  assert.deepStrictEqual(classify('Hunt 30sec 16-9 HEB.mov').specs, { aspect: '16:9', duration: 30, language: 'HE' });
  assert.deepStrictEqual(classify('Hunt_master.mov').specs, {});
});

test('poster links are signed and expire', () => {
  const u = new URL(`http://x${thumbUrl('abc')}`);
  assert.ok(verifyThumb('abc', u.searchParams.get('e'), u.searchParams.get('s')));
  assert.ok(!verifyThumb('abd', u.searchParams.get('e'), u.searchParams.get('s')));
  assert.ok(!verifyThumb('abc', String(Math.floor(Date.now() / 1000) - 10), u.searchParams.get('s')));
});

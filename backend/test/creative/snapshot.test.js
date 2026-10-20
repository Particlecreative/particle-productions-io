const test = require('node:test');
const assert = require('node:assert/strict');
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://x:x@127.0.0.1:1/x';
const { parseItemName, canonicalUrl, linkKind, trackedInWindow } = require('../../src/lib/creative/snapshot');

const known = new Set(['face cream', 'gravité', 'test product', 'neoroot']);

test('parseItemName: product | campaign | concept', () => {
  assert.deepEqual(parseItemName('Face Cream | Claude | The Hunt TV commercial Offline', 'Face Cream', known),
    { title: 'The Hunt TV commercial Offline', subtitle: 'Claude' });
});

test('parseItemName: product | campaign | platform | concept', () => {
  assert.deepEqual(parseItemName('Gravité | The Line Up | Meta | Line Up Digital Versions', 'Gravité', known),
    { title: 'Line Up Digital Versions', subtitle: 'The Line Up · Meta' });
});

test('parseItemName: deep names join the last two segments', () => {
  assert.deepEqual(parseItemName('Test Product | Ashford | Meta | Heart & Longevity Support | Product in Setting', 'Test Product', known),
    { title: 'Heart & Longevity Support — Product in Setting', subtitle: 'Ashford · Meta' });
});

test('parseItemName: short trailing segment merges with predecessor', () => {
  assert.deepEqual(parseItemName('Face Cream | Meta | COPYCAT Campaign | SAVE MONEY', 'Face Cream', known),
    { title: 'COPYCAT Campaign — SAVE MONEY', subtitle: 'Meta' });
});

test('parseItemName: no pipes / unknown first segment kept', () => {
  assert.deepEqual(parseItemName('Hero banner refresh', '', known), { title: 'Hero banner refresh', subtitle: '' });
  assert.equal(parseItemName('Levitas | Meta | Dermatologist Hook', '-', known).subtitle, 'Levitas · Meta');
});

test('canonicalUrl keeps Dropbox rlkey and drops tracking params', () => {
  const u = canonicalUrl('https://www.dropbox.com/scl/fo/abc/XYZ?rlkey=k1&st=tracking&dl=0');
  assert.equal(u, 'https://www.dropbox.com/scl/fo/abc/XYZ?rlkey=k1');
});

test('linkKind', () => {
  assert.equal(linkKind('https://next.frame.io/project/p/f'), 'frameio');
  assert.equal(linkKind('https://f.io/ZUTl7yW8'), 'frameio');
  assert.equal(linkKind('https://www.dropbox.com/scl/fo/abc/XYZ?rlkey=k'), 'dropbox_folder');
  assert.equal(linkKind('https://www.dropbox.com/scl/fi/abc/file.mp4?rlkey=k'), 'dropbox_file');
  assert.equal(linkKind('https://www.figma.com/file/abc'), 'figma');
  assert.equal(linkKind('https://example.com'), 'link');
});

test('trackedInWindow clips a forgotten running timer to work hours', () => {
  const from = Date.parse('2026-10-17T21:00:00Z'); // Sun 00:00 IDT
  const to = Date.parse('2026-10-24T21:00:00Z');
  const now = Date.parse('2026-10-20T13:00:00Z');  // Tue 16:00 IDT
  // Running since Mon 13:19 IDT
  const r = trackedInWindow({ history: [{ started_at: '2026-10-19T10:19:36+00:00', ended_at: null }], running: true }, from, to, now);
  // Mon 13:19→19:00 (5h41m) + Tue 09:00→16:00 (7h)
  assert.equal(Math.round(r.seconds / 60), 5 * 60 + 41 + 7 * 60 - 1);
  assert.deepEqual(r.days.sort(), ['2026-10-19', '2026-10-20']);
});

test('trackedInWindow merges overlapping sessions instead of double-counting', () => {
  const from = Date.parse('2026-10-17T21:00:00Z');
  const to = Date.parse('2026-10-24T21:00:00Z');
  const now = Date.parse('2026-10-26T00:00:00Z');
  const r = trackedInWindow({ history: [
    { started_at: '2026-10-19T07:00:00Z', ended_at: '2026-10-19T09:00:00Z' }, // Mon 10:00–12:00 IDT
    { started_at: '2026-10-19T08:00:00Z', ended_at: '2026-10-19T10:00:00Z' }, // overlaps → 10:00–13:00 total
  ] }, from, to, now);
  assert.equal(r.seconds, 3 * 3600);
});

test('trackedInWindow ignores Friday/Saturday and out-of-window sessions', () => {
  const from = Date.parse('2026-10-17T21:00:00Z');
  const to = Date.parse('2026-10-24T21:00:00Z');
  const now = Date.parse('2026-10-26T00:00:00Z');
  const r = trackedInWindow({ history: [
    { started_at: '2026-10-23T07:00:00Z', ended_at: '2026-10-23T12:00:00Z' }, // Friday
    { started_at: '2026-10-10T07:00:00Z', ended_at: '2026-10-10T12:00:00Z' }, // previous week
  ] }, from, to, now);
  assert.equal(r.seconds, 0);
});

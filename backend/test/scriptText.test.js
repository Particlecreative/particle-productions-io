// Script import from pasted text (24 Nov 2026): a Claude artifact link can't be read from outside claude.ai, so its
// text is pasted in. Lines → linesToScenes; tab-separated rows (copied from a table) keep their columns.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const T = require('../src/lib/scriptText');

test('pasted text: plain lines, blank lines dropped, Windows line ends, a stray BOM', () => {
  assert.deepEqual(T.textToLines('﻿SCENE 1 — INT. BATHROOM\r\n\r\n  A man looks in the mirror.  \nVO: Your skin is tired.\n'), [
    { text: 'SCENE 1 — INT. BATHROOM' }, { text: 'A man looks in the mirror.' }, { text: 'VO: Your skin is tired.' },
  ]);
});

test('pasted text: a table copied as tab-separated rows keeps rows and columns', () => {
  const lines = T.textToLines('Scene\tVisual\tAudio\n1\tClose-up on the jar\tVO: Meet Face Cream\n2\t\tSFX: pop\nOutro line');
  assert.deepEqual(lines, [
    { text: 'Scene', table: 1, row: 1, col: 1 }, { text: 'Visual', table: 1, row: 1, col: 2 }, { text: 'Audio', table: 1, row: 1, col: 3 },
    { text: '1', table: 1, row: 2, col: 1 }, { text: 'Close-up on the jar', table: 1, row: 2, col: 2 }, { text: 'VO: Meet Face Cream', table: 1, row: 2, col: 3 },
    { text: '2', table: 1, row: 3, col: 1 }, { text: 'SFX: pop', table: 1, row: 3, col: 3 },
    { text: 'Outro line' },
  ]);
  assert.deepEqual(T.textToLines('Only one cell\t'), [{ text: 'Only one cell' }], 'a lone tab is just a line');
});

test('Claude links are recognised (and the browser agrees with the server)', async () => {
  const W = await import(pathToFileURL(path.join(__dirname, '../../src/lib/scriptImportInput.js')).href);
  const cases = [
    ['https://claude.ai/artifact/LWVMfLSNcrc4Vj2z8fQiJY?sk=abcdefghijklmnopqrstuv', true],
    ['https://claude.ai/code/artifact/9dfbadd3-d0ab-4886-9861-d201cdbac4d5', true],
    ['https://claude.ai/share/0b1c', true], ['https://abc.claude.site/artifacts/x', true],
    ['https://9dfbadd3.frame.claudeusercontent.com/', true], ['  https://claude.ai/chat/1  ', true],
    ['https://docs.google.com/document/d/abc/edit', false], ['https://claude.ai.example.com/x', false], ['claude.ai artifact', false],
  ];
  for (const [u, want] of cases) {
    assert.equal(T.isClaudeLink(u), want, u);
    assert.equal(W.isClaudeLink(u), want, `browser: ${u}`);
  }
  assert.equal(W.importInput('https://claude.ai/artifact/x').kind, 'claude');
  assert.equal(W.importInput('https://docs.google.com/document/d/abc/edit').kind, 'url');
  assert.equal(W.importInput('hi').kind, 'short');
  assert.deepEqual(W.importBody('SCENE 1\nA man looks in the mirror at his tired skin.'), { text: 'SCENE 1\nA man looks in the mirror at his tired skin.' });
  assert.equal(W.importBody('https://claude.ai/artifact/x'), null, 'a Claude link is never sent');
});

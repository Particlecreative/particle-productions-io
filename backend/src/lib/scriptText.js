/**
 * Script import from pasted text (24 Nov 2026 — Tomer: "make CP able to read a Claude artifact").
 * A claude.ai artifact link can't be read from outside claude.ai (the page is an empty shell; the content loads
 * through claude.ai's own signed-in API), so the import box takes the artifact's text pasted in instead.
 */

/** claude.ai / claude.site / claudeusercontent.com links — artifacts, chats, shares */
const CLAUDE_LINK = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:claude\.ai|claude\.site|claudeusercontent\.com)(?:[/?#:]|$)/i;
const isClaudeLink = (url) => CLAUDE_LINK.test(String(url || '').trim());

const CLAUDE_LINK_HELP = 'CP can’t open Claude artifact links — Claude only shows them inside claude.ai. Open the artifact, click into it, press Ctrl/⌘ A then Ctrl/⌘ C, and paste the text here instead. (A Claude doc can also be exported to Google Docs — that link works here.)';

const MAX_TEXT = 200000;

/**
 * Pasted text → lines for linesToScenes. A row copied from a table arrives tab-separated: its cells become
 * table cells (row / col), so a Scene | Visual | Audio script keeps its columns.
 */
function textToLines(text) {
  const out = [];
  let row = 0;
  for (const raw of String(text || '').slice(0, MAX_TEXT).replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.replace(/^﻿/, '');
    if (line.includes('\t')) {
      const cells = line.split('\t').map(c => c.trim());
      if (cells.filter(Boolean).length >= 2) {
        row++;
        cells.forEach((c, i) => { if (c) out.push({ text: c, table: 1, row, col: i + 1 }); });
        continue;
      }
    }
    const t = line.trim();
    if (t) out.push({ text: t });
  }
  return out;
}

module.exports = { isClaudeLink, CLAUDE_LINK_HELP, textToLines, MAX_TEXT };

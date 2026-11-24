// What was typed / pasted in a script import box (24 Nov 2026): a link, a Claude artifact link (can't be read from
// outside claude.ai — paste its text instead), or the script text itself. Same Claude-link rule as
// backend/src/lib/scriptText.js.

const CLAUDE_LINK = /^https?:\/\/(?:[a-z0-9-]+\.)*(?:claude\.ai|claude\.site|claudeusercontent\.com)(?:[/?#:]|$)/i;

export const isClaudeLink = (url) => CLAUDE_LINK.test(String(url || '').trim());

/** → { kind: 'empty' | 'url' | 'claude' | 'text' | 'short', url?, text?, lines? } */
export function importInput(value) {
  const s = String(value || '').trim();
  if (!s) return { kind: 'empty' };
  if (/^https?:\/\/\S+$/i.test(s)) return isClaudeLink(s) ? { kind: 'claude', url: s } : { kind: 'url', url: s };
  const lines = s.split(/\r?\n/).filter(l => l.trim()).length;
  return s.length >= 30 ? { kind: 'text', text: s, lines } : { kind: 'short' };
}

/** The request body for POST /api/scripts/import, or null when there's nothing to send. */
export function importBody(value) {
  const v = importInput(value);
  if (v.kind === 'url') return { url: v.url };
  if (v.kind === 'text') return { text: v.text };
  return null;
}

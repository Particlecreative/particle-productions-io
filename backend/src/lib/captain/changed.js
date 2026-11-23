/**
 * Only the words that change (Tomer, 23 Nov 2026: "when you give a correction for a word, don't write the whole
 * sentence — write only the word; the whole sentence is confusing").
 *
 *   "Yes, he's mine Keep walking" → "Yes, he's mine, keep walking"   ⇒   "mine Keep" → "mine, keep"
 *   "…from a mineral found in Iceland's Arctic waters."  → "…waters"  ⇒   "waters." → "waters"
 *
 * The words both lines share at the start and at the end are dropped. A word added or dropped keeps the word next to
 * it, so the editor sees where; a snippet that appears twice in the line grows until it points at one place.
 * Lines with nothing in common (a description, a rewrite) and short lines stay whole. Quote styles (’ vs ') count as
 * the same character, so a curly apostrophe in the fix doesn't show as a change.
 */
const key = (t) => String(t).replace(/[‘’‚‛′]/g, "'").replace(/[“”„‟″]/g, '"');

function occurrences(words, snippet) {
  if (!snippet.length) return 0;
  let n = 0;
  for (let i = 0; i + snippet.length <= words.length; i++) {
    if (snippet.every((w, j) => key(words[i + j]) === key(w))) n++;
  }
  return n;
}

function changedPart(found, fix, { minWords = 4 } = {}) {
  const f = String(found ?? '').trim(), x = String(fix ?? '').trim();
  const whole = { found: f, fix: x, shortened: false };
  const a = f.split(/\s+/).filter(Boolean), b = x.split(/\s+/).filter(Boolean);
  if (!a.length || !b.length || Math.max(a.length, b.length) < minWords) return whole;

  let p = 0;
  while (p < a.length && p < b.length && key(a[p]) === key(b[p])) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && key(a[a.length - 1 - s]) === key(b[b.length - 1 - s])) s++;
  if (p + s === 0) return whole;                                   // nothing in common
  if (p === a.length && p === b.length) return whole;              // the same line

  let lo = p, hiA = a.length - s, hiB = b.length - s;
  const widen = () => {
    if (lo > 0) { lo--; return true; }
    if (hiA < a.length && hiB < b.length) { hiA++; hiB++; return true; }
    return false;
  };
  if (hiA === lo || hiB === lo) widen();                           // a word added / dropped: show its neighbour
  while (occurrences(a, a.slice(lo, hiA)) > 1 && widen());         // point at one place in the line

  if (lo === 0 && hiA === a.length && hiB === b.length) return whole;
  return { found: a.slice(lo, hiA).join(' '), fix: b.slice(lo, hiB).join(' '), shortened: true };
}

module.exports = { changedPart };

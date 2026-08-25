// Fuzzy people-name matching so the same person written differently across
// productions (Hebrew vs English, Assaf vs Asaf, "Assaf Almog" vs "אסף אלמוג")
// collapses into one supplier. Mirrors the finance-sheet mismatch matcher.

// Tuned for personal/company names: vav→o (usually a vowel in names, dropped by the
// loose key), fe→f (Asaf, Yosef), so Hebrew and Latin consonant skeletons line up.
const HEBREW_TRANSLIT = {
  'א': 'a', 'ב': 'b', 'ג': 'g', 'ד': 'd', 'ה': 'h', 'ו': 'o', 'ז': 'z',
  'ח': 'ch', 'ט': 't', 'י': 'y', 'כ': 'k', 'ך': 'k', 'ל': 'l', 'מ': 'm',
  'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's', 'ע': 'a', 'פ': 'f', 'ף': 'f',
  'צ': 'tz', 'ץ': 'tz', 'ק': 'k', 'ר': 'r', 'ש': 'sh', 'ת': 't',
};

export function translitHebrew(str = '') {
  return [...str].map(ch => HEBREW_TRANSLIT[ch] ?? ch).join('');
}

// Normalized form: transliterate Hebrew, lowercase, strip punctuation, collapse spaces.
export function normName(str = '') {
  return translitHebrew(String(str))
    .toLowerCase()
    .replace(/[^a-z0-9֐-׿\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// "Loose key": drop vowels + h and collapse duplicate letters, so Assaf/Asaf,
// Meghan/Megan, Sara/Sarah all share a key.
function looseKey(str = '') {
  return normName(str)
    .split(' ')
    .map(tok => tok.replace(/[aeiouh]/g, '').replace(/(.)\1+/g, '$1'))
    .join(' ')
    .trim();
}

export function levenshtein(a = '', b = '') {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let prevDiag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(
        prev[j] + 1,
        prev[j - 1] + 1,
        prevDiag + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      prevDiag = tmp;
    }
  }
  return prev[b.length];
}

// Similarity in [0,1]. 1 = identical normalized; 0.95 = same loose key; otherwise
// edit-distance ratio.
export function nameScore(a, b) {
  const na = normName(a), nb = normName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (looseKey(a) && looseKey(a) === looseKey(b)) return 0.95;
  const maxLen = Math.max(na.length, nb.length);
  return maxLen ? 1 - levenshtein(na, nb) / maxLen : 0;
}

export const DEFAULT_MATCH_THRESHOLD = 0.82;

/**
 * Greedily cluster items by a person's name.
 * @param {Array} items
 * @param {(item)=>string} getName
 * @param {number} threshold
 * @returns {Array<{key:string, canonical:string, aliases:string[], items:Array}>}
 */
export function clusterByName(items, getName, threshold = DEFAULT_MATCH_THRESHOLD) {
  const clusters = [];
  for (const item of items) {
    const raw = (getName(item) || '').trim();
    if (!raw) continue;
    let best = null, bestScore = 0;
    for (const c of clusters) {
      const score = nameScore(raw, c.canonical);
      if (score > bestScore) { bestScore = score; best = c; }
    }
    if (best && bestScore >= threshold) {
      best.items.push(item);
      best._names.set(raw, (best._names.get(raw) || 0) + 1);
    } else {
      const m = new Map([[raw, 1]]);
      clusters.push({ canonical: raw, _names: m, items: [item] });
    }
  }
  // Finalize: canonical = most frequent spelling (ties → longest, prefer Latin).
  return clusters.map(c => {
    const names = [...c._names.entries()];
    names.sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const aLatin = /[a-z]/i.test(a[0]) ? 1 : 0;
      const bLatin = /[a-z]/i.test(b[0]) ? 1 : 0;
      if (bLatin !== aLatin) return bLatin - aLatin;
      return b[0].length - a[0].length;
    });
    const canonical = names[0][0];
    const aliases = names.map(n => n[0]).filter(n => n !== canonical);
    return { key: normName(canonical) || canonical, canonical, aliases, items: c.items };
  });
}

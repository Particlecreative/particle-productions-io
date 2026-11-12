/**
 * Tidying an asset check's findings against the Monday brief (Tomer, 12 Nov 2026):
 *  • a real error copied from the brief stays an error ("Linda. E" → "Linda E." is wrong in the ad) — the note says
 *    the brief has it too, so the designer isn't blamed and the requester hears about it;
 *  • "differs from the brief" when the text IS the brief is dropped (Hand Cream B&A: the brief said "Was made for men.");
 *  • notes that change nothing, or where Captain talks himself out of it ("no issue", "low-confidence"), are dropped;
 *  • the same problem reported frame by frame becomes one note.
 */
// words only (punctuation and case ignored) — "does the design say what the brief says?"
const norm = (s) => String(s || '').normalize('NFKD').replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();
// only quote styles and spacing ignored — a moved period or a capital letter IS a change
const light = (s) => String(s || '').normalize('NFKC').replace(/[‘’‚′`´]/g, "'").replace(/[“”„″]/g, '"').replace(/\s+/g, ' ').trim();

const briefRaw = (item) => { const b = item?.brief || {}; return [b.hook, b.concept, b.script, b.supporting_text, b.request_update].filter(Boolean).join('\n'); };
/** Everything the brief asked for, words only (pure). */
const briefTextOf = (item) => norm(briefRaw(item));

/** The design's text says what the brief says (same words). */
function wordsInBrief(issue, briefNorm) {
  const f = norm(issue?.found);
  return !!briefNorm && f.length >= 4 && (` ${briefNorm} `).includes(` ${f} `);
}
/** The brief has exactly this text, punctuation included (so a punctuation error came from the brief). */
const exactlyInBrief = (issue, briefLight) => !!briefLight && light(issue?.found).length >= 4 && briefLight.toLowerCase().includes(light(issue.found).toLowerCase());

// errors inside the text itself — the kind a brief can contain too
const TEXT_ERRORS = new Set(['spelling', 'wrong_word', 'brand_name', 'placeholder']);

/** One issue, with "the brief has this mistake too" when it came from the brief (pure — tested). */
function asBriefed(issue, briefLight) {
  if (!issue?.found || !TEXT_ERRORS.has(issue.type) || !exactlyInBrief(issue, briefLight)) return issue;
  const note = 'The brief has this mistake too (the requester wrote it) — fix it in the design and let the requester know';
  return { ...issue, note: issue.note ? `${note}. ${issue.note}` : note, from_brief: true };
}

/** A note whose fix is the same text as what it found changes nothing (pure). */
const isNoOp = (issue) => !!issue?.found && !!issue?.fix && light(issue.found) === light(issue.fix);

// Captain talking himself out of it ("no issue", "matches it fine", "low-confidence check only") isn't a finding
const SELF_DISMISSED = /\bno (?:real |actual )?issue\b|\bnot (?:an?|really an?) (?:issue|error|problem)\b|\bmatches (?:it )?(?:fine|correctly|ok)\b|\blow[- ]confidence\b|\bnothing to (?:fix|change)\b|\bis (?:fine|correct) as is\b/i;
const selfDismissed = (i) => SELF_DISMISSED.test(String(i?.note || ''));

/** "Differs from the brief" — or a rewrite of it (pure). */
const isBriefDifference = (i) => i?.type === 'script_mismatch' || /differs? from (?:the )?brief|than the brief|brief says/i.test(String(i?.note || ''));

/** The same problem reported frame by frame → one note, "also in N more frames" (pure). */
function mergeDuplicates(issues) {
  const out = [], seen = new Map();
  for (const i of issues) {
    const key = `${light(i.found).toLowerCase()}→${light(i.fix).toLowerCase()}|${i.type || ''}`;
    const first = seen.get(key);
    if (first) { first.also = (first.also || 0) + 1; continue; }
    const copy = { ...i };
    seen.set(key, copy);
    out.push(copy);
  }
  return out.map(({ also, ...i }) => (also ? { ...i, note: `${i.note ? `${String(i.note).trim()} ` : ''}(also in ${also} more frame${also === 1 ? '' : 's'})` } : i));
}

/** The issues an asset check keeps (pure — tested). */
function tidy(issues, item) {
  const raw = briefRaw(item), bNorm = norm(raw), bLight = light(raw);
  const kept = [];
  for (const i of issues || []) {
    if (isNoOp(i) || selfDismissed(i)) continue;
    if (isBriefDifference(i) && wordsInBrief(i, bNorm)) continue;   // it says what the brief says — not a difference
    kept.push(asBriefed(i, bLight));
  }
  return mergeDuplicates(kept);
}

module.exports = { briefTextOf, asBriefed, isNoOp, selfDismissed, mergeDuplicates, tidy, norm, light };

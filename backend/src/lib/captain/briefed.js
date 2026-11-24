/**
 * Tidying an asset check's findings against the Monday brief (Tomer, 12 Nov 2026):
 *  • a real error copied from the brief stays an error ("Linda. E" → "Linda E." is wrong in the ad) — the note says
 *    the brief has it too, so the designer isn't blamed and the requester hears about it;
 *  • "differs from the brief" when the text IS the brief is dropped (Hand Cream B&A: the brief said "Was made for men.");
 *  • notes that change nothing, or where Captain talks himself out of it ("no issue", "low-confidence"), are dropped;
 *  • the same problem reported frame by frame becomes one note;
 *  • copy approved on the ticket isn't second-guessed (Tomer, 23 Nov 2026: "the copy is approved on the ticket, and then
 *    the captain comments on it as well"): a "please check" on text that is word for word the brief — a claim, a house
 *    style, a period, "pair Gravité with Cologne" — was decided when the copy was approved, and the designer / editor
 *    can't change it anyway. Real mistakes in it (a typo, a placeholder like [date]) are still reported.
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
  return { ...issue, note: issue.note ? `${String(issue.note).trim().replace(/\.$/, '')} (the brief has it too)` : 'The brief has it too', from_brief: true };
}

// on approved copy only these are still worth a comment: they aren't a judgment on the wording
const ALWAYS_KEEP = new Set(['placeholder', 'overflow', 'cut_off', 'size_mismatch', 'baked_text', 'label_mismatch']);
/** A "please check" on copy that is word for word the approved brief — a call already made (pure). */
const onApprovedCopy = (i, briefNorm) => i?.severity === 'check' && !ALWAYS_KEEP.has(i?.type) && !BRIEF_TYPES.has(i?.type) && wordsInBrief(i, briefNorm);

// "No subtitles for the spoken line" on the end card — the CTA, web address, guarantee or shipping line is on screen
// as the end card itself; reviewers marked these "not a typo" (The Hunt, NeoRoot, 18–19 Nov 2026)
const END_CARD_LINE = /\.com\b|\b(?:visit|shop|order|buy|claim yours|link in|free shipping|guarantee|money[- ]back|risk[- ]free|try it)\b/i;
const endCardSubtitles = (i) => i?.type === 'caption_vs_voiceover' && !String(i.found || '').trim() && END_CARD_LINE.test(String(i.fix || ''));

// Character names (Tomer, 24 Nov 2026 — Gravité "The Cologne Rain Heist"): Captain swapped Gary ↔ Walt as 6 must-fixes,
// deciding who is who from how the actors look — and contradicted himself between rounds, while the editor kept the adapted
// script Omer approved. Who is who is the script's and the editor's call: a name is never "corrected" from the picture.
// A caption showing a different name than the one SAID stays — as a please-check, the ear can be wrong too.
const BRAND_WORD = /particle|gravit|neoroot|clearstep|ashford|biomella|blurr|science/i;
const NAME_NOTE = /\b(?:names?|named|characters?|address(?:es|ed|ing)?|call(?:s|ed|ing)?|wearing|who is|is the one|confus\w*)\b/i;
const NAME_SOFT_TYPES = new Set(['caption_vs_voiceover', 'vo_wrong_word']);
const NAME_KEEP_TYPES = new Set(['brand_name', 'label_mismatch', 'placeholder']);
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/** [found name, fix name] when the only change is one name swapped for a different one ("Walt, go." → "Gary, go."), else null. */
function swappedName(i) {
  const w = (s) => String(s || '').split(/\s+/).filter(Boolean).map(x => x.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '')).filter(Boolean);
  const a = w(i?.found), b = w(i?.fix);
  if (!a.length || a.length !== b.length) return null;
  const diff = a.map((x, k) => [x, b[k]]).filter(([x, y]) => x.toLowerCase() !== y.toLowerCase());
  if (diff.length !== 1) return null;
  const [x, y] = diff[0];
  if (BRAND_WORD.test(x) || BRAND_WORD.test(y)) return null;
  const title = (t) => /^\p{Lu}[\p{Ll}]+$/u.test(t), caps = (t) => /^\p{Lu}{2,}$/u.test(t);
  // Title case = a proper noun; ALL CAPS captions could be any word, so those need the note to be about names
  if (!((title(x) && title(y)) || (caps(x) && caps(y) && NAME_NOTE.test(String(i.note || ''))))) return null;
  if (editDistance(x.toLowerCase(), y.toLowerCase()) / Math.max(x.length, y.length) < 0.5) return null;   // Its/It's, Lose/Loose, Jon/John — a spelling, not a different person
  return [x, y];
}
/** 'drop' | 'soften' | null for a character-name swap. */
function nameCall(i) {
  if (!i || NAME_KEEP_TYPES.has(i.type) || !swappedName(i)) return null;
  return NAME_SOFT_TYPES.has(i.type) ? 'soften' : 'drop';
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

/**
 * How the AI reads a brief (both prompts). Tomer, 18 Nov 2026: "it should read the brief, but it's not a must to be
 * literal 1:1 — be smart." The brief says what the ad must deliver; the wording is the editor's / designer's.
 */
const BRIEF_SPIRIT = [
  'How to use the brief: read it to understand what this ad must deliver — the product, the offer (price, discount, promo code, guarantee), the claims, the key message and the call to action. The editor or designer is expected to adapt it: rewording, shortening, splitting or merging lines, changing the order, rewriting dialogue, changing capitalisation or punctuation, adding or dropping small words, using a shorter product name. None of that is an issue — don\'t report it and don\'t mention the brief for it.',
  'Report a difference from the brief ONLY when it changes something that matters: a different or missing offer, price, discount, number, promo code, URL or guarantee; a claim that is new, stronger or different from the brief (a timeframe, a percentage, "clinically proven"); a different product (not just a shorter name); a required disclaimer or footnote missing (e.g. an asterisk with nothing it refers to); the call to action or the offer missing altogether.',
  'Use type "script_mismatch", severity "check". At most 3 brief notes for the whole asset — combine related differences into one note. When in doubt, leave it out.',
].join('\n');

// brief notes the AI may still send that are about wording, not substance
const BRIEF_TYPES = new Set(['script_mismatch', 'vo_script_mismatch', 'brief_mismatch', 'brief_missing']);
const MAX_BRIEF_NOTES = 3;
const words = (s) => norm(s).split(' ').filter(Boolean);
/** A "differs from the brief" note where the ad says the same words, or a shortened version of them (pure). */
function onlyWording(i) {
  if (i?.type !== 'script_mismatch' && i?.type !== 'vo_script_mismatch') return false;
  const f = words(i.found), b = words(i.fix);
  if (!f.length || !b.length) return false;
  if (f.join(' ') === b.join(' ')) return true;                       // case / punctuation only
  const digits = (ws) => ws.filter(w => /\d/.test(w)).join(' ');
  if (digits(f) !== digits(b)) return false;                          // a number changed — that matters
  const bs = new Set(b);
  return f.length >= 2 && f.every(w => bs.has(w));                    // "Particle Gravité Cologne" for "… Cologne for Men"
}
// An AI brief note has to be about something that matters — the offer, a price or number, a claim, the product, a
// disclaimer, the CTA or the hook. "Dialogue differs from the brief across all beats" (The Borrowed Bottle, 18 Nov
// 2026: 'Pitch is at five' vs 'noon') is the editor adapting the script, not a finding.
const MATTERS = /\d|[$£€%]|\.com\b|\b(?:offer|price|discount|promo|code|coupon|free|guarantee|money[- ]back|refund|clinically|proven|results may vary|disclaimer|footnote|asterisk)\b/i;
const MATTERS_NOTE = /\b(?:offer|price|discount|promo|claim|disclaimer|footnote|asterisk|guarantee|hook|wrong product|different product|product name)\b|\b(?:no|missing|without(?: a| the)?)\s+(?:cta|call to action)\b|\b(?:cta|call to action)\s+(?:is\s+)?missing\b/i;   // a CTA worded differently isn't a note; a missing one is
const immaterial = (i) => (i?.type === 'script_mismatch' || i?.type === 'vo_script_mismatch')
  && !MATTERS.test(`${i.found || ''} ${i.fix || ''}`) && !MATTERS_NOTE.test(String(i.note || ''));
// "said in a different order" and "not in the brief's script" (on a caption check) aren't findings any more
const offBrief = (i) => i?.type === 'vo_order' || (i?.type === 'caption_vs_voiceover' && !String(i.fix || '').trim() && /brief|script/i.test(String(i.note || '')));

/**
 * A caption that only SHORTENS what is said — drops words, changes none ("THE CONCEPT" for "And that's the concept") —
 * is often on purpose (micro dramas, punchy captions): please check, not must fix (Tomer, 18 Nov 2026). A caption with a
 * different word than the voice still contradicts it and stays must fix. Pure.
 */
function shortensSpeech(i) {
  if (i?.type !== 'caption_vs_voiceover') return false;
  const cap = words(i.found), said = words(i.fix);
  if (!cap.length || cap.length >= said.length) return false;
  let k = 0;
  for (const w of said) if (w === cap[k]) k++;
  return k === cap.length;                                           // every caption word, in order, in what's said
}
const softenShortCaption = (i) => (i.severity === 'must_fix' && shortensSpeech(i)
  ? { ...i, severity: 'check', note: `The caption shortens what's said — fine if that's on purpose${i.note ? `. ${i.note}` : ''}` } : i);

/** The issues an asset check keeps (pure — tested). */
function tidy(issues, item) {
  const raw = briefRaw(item), bNorm = norm(raw), bLight = light(raw);
  const kept = [];
  let briefNotes = 0;
  for (let i of issues || []) {
    if (isNoOp(i) || selfDismissed(i) || offBrief(i) || onlyWording(i) || immaterial(i) || endCardSubtitles(i)) continue;
    if (onApprovedCopy(i, bNorm)) continue;   // approved on the ticket — not the designer's / editor's call
    const nc = nameCall(i);
    if (nc === 'drop') continue;   // who is who is the script's and the editor's call
    if (nc === 'soften') i = { ...i, severity: 'check', note: i.note || 'The caption shows a different name than the one said — check' };
    if (isBriefDifference(i) && wordsInBrief(i, bNorm)) continue;   // it says what the brief says — not a difference
    if (BRIEF_TYPES.has(i.type) && ++briefNotes > MAX_BRIEF_NOTES) continue;   // a few brief notes, not a line-by-line diff
    kept.push(asBriefed(softenShortCaption(i), bLight));
  }
  return mergeDuplicates(kept);
}

module.exports = { briefTextOf, briefRawOf: briefRaw, asBriefed, isNoOp, selfDismissed, mergeDuplicates, tidy, norm, light, onlyWording, immaterial, shortensSpeech, onApprovedCopy, endCardSubtitles, swappedName, nameCall, BRIEF_SPIRIT, MAX_BRIEF_NOTES };

/**
 * "As briefed" (Tomer, 12 Nov 2026): when the text Captain flags is exactly what the Monday brief asked for, the
 * designer / editor did their job — the wording is the requester's. It's still worth a look, but as a "please check"
 * for the requester, never a must-fix on the asset. (Hand Cream Women LP Quote: the brief said "Linda. E".)
 */
const norm = (s) => String(s || '').normalize('NFKD').replace(/[‘’‚′]/g, "'").replace(/[“”„″]/g, '"')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().toLowerCase();

/** Everything the brief asked for, normalised (pure). */
function briefTextOf(item) {
  const b = item?.brief || {};
  return norm([b.hook, b.concept, b.script, b.supporting_text, b.request_update].filter(Boolean).join('\n'));
}

/** One issue, re-labelled when its text is word for word in the brief (pure — tested). */
function asBriefed(issue, briefNorm) {
  if (!briefNorm || !issue?.found) return issue;
  const f = norm(issue.found);
  if (f.length < 4 || !(` ${briefNorm} `).includes(` ${f} `)) return issue;
  const note = 'As briefed — the brief asked for this exact text, so it’s the requester’s call, not the designer’s';
  return { ...issue, severity: 'check', note: issue.note ? `${note}. ${issue.note}` : note, from_brief: true };
}

/** A note whose fix is the same text as what it found changes nothing — dropped (pure — tested). */
// only quote styles and spacing are ignored here — a moved period or a capital letter IS a change
const light = (s) => String(s || '').normalize('NFKC').replace(/[‘’‚′`´]/g, "'").replace(/[“”„″]/g, '"').replace(/\s+/g, ' ').trim();
const isNoOp = (issue) => !!issue?.found && !!issue?.fix && light(issue.found) === light(issue.fix);

/** The issues the asset check keeps: no-ops dropped, brief-matching text re-labelled "as briefed". */
function tidy(issues, item) {
  const b = briefTextOf(item);
  return (issues || []).filter(i => !isNoOp(i)).map(i => asBriefed(i, b));
}

module.exports = { briefTextOf, asBriefed, isNoOp, tidy, norm };

/**
 * MEDIUM — the house-style check (style guide §11.4). Runs before scoring; a failure triggers one rewrite, then the
 * brief is dropped with its reasons. Also composes the Monday Brief field exactly as it will be created.
 * Pure functions — backend/test/medium.test.js.
 */
const ELEMENT_LABELS = ['Headline', 'Subtitle', 'Kicker', 'Eyebrow', 'Badge', 'Pill', 'Offer', 'CTA', 'CTA button', 'Search bar', 'Card \\d', 'Sticker header', 'Sticker question',
  'Answer line', 'Line item', 'Left column', 'Right column', 'Closing line', 'Body', 'Disclaimer', 'Price', 'Code', 'Label'];
const LABEL_RE = new RegExp(`^\\s*(?:${ELEMENT_LABELS.join('|')})\\s*:`, 'im');

/** The opening the house style uses for each kind of job (style guide §3). */
const OPENINGS = {
  reference_adaptation: { re: /^please look at (the )?attached reference/i, want: '“Please look at attached reference (…), copy style, apply to Particle design.” (video: “…copy its structure, pacing, and look for {product}.”)' },
  template_swap: { re: /^copy the layout exactly/i, want: '“Copy the layout exactly, swap the product to {product}…”' },
  static_gif: { re: /^turn the approved .+ into a gif/i, want: '“Turn the approved {X} static into a GIF design: {link} — …”' },
  creator_edit: { re: /^footage\s*:/i, want: '“FOOTAGE: {link}” then “EDIT: …”' },
  new_hooks: { re: /^we need \d(\s*[–-]\s*\d)? (additional|new) hooks/i, want: '“We need 3–4 additional hooks we will add to the existing videos here: {link}”' },
  iterate: { re: /^take our best[- ]performing/i, want: '“Take our best-performing {product} video ({version}) and replace …”' },
  original_video: { re: /^(an?|one|two|three)\b[^.]{0,120}\b(\d{2}\s*[–-]\s*\d{2}|\d{2}s?\b|man|men|guy|woman|couple|dad|father|husband)/i, want: 'the person and the moment (“A 55–60 man at his bathroom mirror, getting ready. Real, not styled.”)' },
};

const firstLine = (s) => String(s || '').split('\n').map(x => x.trim()).find(Boolean) || '';
const restAfterFirst = (s) => { const lines = String(s || '').split('\n'); const i = lines.findIndex(x => x.trim()); return lines.slice(i + 1).join('\n'); };

/** Which opening rule applies to this brief. */
function openingFor({ kind, format, move }) {
  if (kind === 'reference_adaptation') return OPENINGS.reference_adaptation;
  if (kind === 'template_swap') return OPENINGS.template_swap;
  if (kind === 'static_gif') return OPENINGS.static_gif;
  if (kind === 'creator_edit') return OPENINGS.creator_edit;
  if (kind === 'new_hooks' || (move === 'ITERATE' && format === 'video' && kind === 'new_hooks')) return OPENINGS.new_hooks;
  if (move === 'ITERATE' && format === 'video') return OPENINGS.iterate;
  if (format === 'video' && kind === 'original') return OPENINGS.original_video;
  return null;
}

/**
 * brief: { format, kind, move, lane, fields: { brief, script, copy, why, test, donts, vo_style } }, laneFirst = "Page:" / "Ad leads to:" or null.
 * Returns { passed, failures: [string] }.
 */
function styleCheck(b, { laneFirst = null } = {}) {
  const f = b.fields || {};
  const failures = [];
  const brief = String(f.brief || '').trim();
  const script = String(f.script || '');
  const copy = String(f.copy || '');
  const all = [brief, script, copy, f.hook || ''].join('\n');

  // 1. opening — magazine lanes put the destination first, then the kind's opening
  let body = brief;
  if (laneFirst) {
    if (!firstLine(brief).toLowerCase().startsWith(laneFirst.toLowerCase())) failures.push(`The first line must be “${laneFirst} {article URL}”`);
    else body = restAfterFirst(brief);
  }
  const open = openingFor(b);
  if (open && !open.re.test(firstLine(body))) failures.push(`Opening doesn't match the kind of job — use ${open.want}`);

  // 2–3. video: time-coded script with SCRIPT/VISUALS or beats, and a VO style line when there is a voiceover
  if (b.format === 'video' && b.kind !== 'creator_edit' && b.kind !== 'static_gif') {
    const timed = (script.match(/\b\d{1,3}\s*[–-]\s*\d{1,3}\s*s\b/g) || []).length;
    const beats = /\b(beat|scene)\s*\d/i.test(script) || /\[\s*\d{1,3}\s*[–-]\s*\d{1,3}\s*s?\s*\]/.test(script);
    if (timed < 2 && !beats) failures.push('The script must be time-coded (“0–4s — THE HOOK”) or written in Beats / Scenes with timings');
    if (timed >= 2 && !(/\bSCRIPT\s*:/i.test(script) && /\bVISUALS?\s*:/i.test(script)) && !beats) failures.push('Every timed beat needs SCRIPT: and VISUALS:');
    const hasVo = /\bSCRIPT\s*:\s*["“]/i.test(script) || /\bVO\b(?!\s*style\s*:\s*no vo)/i.test(script);
    if (hasVo && !(/\bVO style\s*:/i.test(`${script}\n${brief}`) || String(f.vo_style || '').trim())) failures.push('Add one “VO style:” line (the delivery, as a register)');
  }

  // 4. design: every word on the image labelled by element, in versions
  if (b.format === 'design' && !['static_gif', 'translation'].includes(b.kind)) {
    if (!/^\s*V1\b/m.test(copy) || !/^\s*V2\b/m.test(copy)) failures.push('The Copy field needs versions — V1, V2 (and V3)');
    if (!LABEL_RE.test(copy)) failures.push('Label every line of copy by element (Headline:, Subtitle:, Badge:, CTA button: …)');
  }

  // 5. sizes in house notation
  if (/\b\d{1,2}x\d{1,2}\b/.test(`${brief}\n${copy}`)) failures.push('Write sizes in house notation: 4×5 · 1×1 · 9×16');
  if (!/\b\d{1,2}\s*[×:]\s*\d{1,2}\b/.test(`${brief}\n${script}`) && !(f.sizes || []).length) failures.push('Say the sizes (4×5 · 1×1 · 9×16)');

  // 6. a Don'ts list
  if (!(Array.isArray(f.donts) ? f.donts.filter(Boolean).length : String(f.donts || '').trim())) failures.push('Add a short “Don’ts:” list');

  // 7. no first-person wishes
  if (/\bI (want|need|would like|'d like|wish)\b/i.test(all)) failures.push('No first-person “I want” — write instructions for the maker');

  // 8. exactly one Why: and one Test:
  const why = String(f.why || '').trim(), test = String(f.test || '').trim();
  if (!why || why.includes('\n')) failures.push('Exactly one “Why:” line');
  if (!test || test.includes('\n')) failures.push('Exactly one “Test:” line');
  if (/^\s*(why|test)\s*:/im.test(all)) failures.push('Why: and Test: go in their own fields, not inside the brief');

  return { passed: !failures.length, failures };
}

/** The Monday Brief field as it will be created: opening → Why → body → Don'ts → Test (spec §10.2). */
function composeBrief(f = {}) {
  const lines = String(f.brief || '').trim().split('\n');
  const i = lines.findIndex(x => x.trim());
  const opening = lines.slice(0, i + 1).join('\n');
  const body = lines.slice(i + 1).join('\n').trim();
  const donts = Array.isArray(f.donts) ? f.donts.filter(Boolean) : String(f.donts || '').split('\n').map(s => s.replace(/^[-•]\s*/, '').trim()).filter(Boolean);
  return [opening, f.why ? `Why: ${String(f.why).replace(/^why:\s*/i, '')}` : null, body || null, donts.length ? `Don'ts:\n${donts.map(d => `- ${d}`).join('\n')}` : null,
    f.test ? `Test: ${String(f.test).replace(/^test:\s*/i, '')}` : null].filter(Boolean).join('\n\n');
}

module.exports = { styleCheck, composeBrief, openingFor, OPENINGS };

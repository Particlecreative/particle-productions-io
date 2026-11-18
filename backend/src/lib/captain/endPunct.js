/**
 * End punctuation in ad copy — Captain QA rule (Tomer, 17 Nov 2026; Claude Doc "Captain QA Rule Spec: End Punctuation
 * in Ad Copy"). A closing period is a style choice, not an error: Captain flags it only when it breaks consistency,
 * grammar or platform policy. Code, not the AI, judges end marks (. ? ! …) — the AI is told to leave them alone.
 *
 *  1. Classify every text layer: type (headline · subhead · super · caption · claim · cta · url · search_headline ·
 *     search_description — from the layer name, then the text, then size), sentence count, final unit type
 *     (statement / question / exclamation / fragment), and what the brief has for that line.
 *  2. Rule table (must fix → blocks approval; please check → a comment):
 *     • a question without "?" · "??" / "?!" · a period after a CTA, button or URL · "!" or repeated marks in a Google
 *       search headline · more than one "!" in search descriptions → must fix
 *     • (designs only — in videos only the must-fixes above apply, 18 Nov 2026) a period on a claim/badge · the same
 *       layer type with the same structure punctuated two ways in one set · a
 *       multi-sentence line whose last sentence is left open while others are closed (unless that's the house style
 *       across the whole group) → please check. A line that just ends differently from the brief is NOT a note
 *       (18 Nov 2026: the brief is read for intent, not 1:1).
 *  3. Never: a brief-matched period used the same way across its group; a "?" variant compared with a "." variant;
 *     the same line flagged once per frame (one finding names the frames).
 * Pure and tested (test/captainEndPunct.test.js).
 */

const light = (s) => String(s || '').normalize('NFKC').replace(/[‘’‚′`´]/g, "'").replace(/[“”„″]/g, '"').replace(/\s+/g, ' ').trim();
const words = (s) => String(s || '').normalize('NFKD').replace(/[‘’]/g, "'").toLowerCase().match(/[\p{L}\p{N}']+/gu) || [];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const LABEL = {
  headline: 'Headline', subhead: 'Subhead', super: 'Super', caption: 'Caption', claim: 'Claim', cta: 'CTA', url: 'URL',
  search_headline: 'Search headline', search_description: 'Search description',
};

/** The line's ending: { core (text without trailing quotes/emoji/space), mark ('' . ? ! … ?? ?! …), trailer }. */
function ending(text) {
  const t = String(text || '').replace(/\s+$/u, '');
  const trailer = (t.match(/[\s"'’”»)\]}\p{Extended_Pictographic}\u{FE0F}\u{200D}]+$/u) || [''])[0];
  const core = t.slice(0, t.length - trailer.length);
  const m = core.match(/(?:\.{3}|…|[.?!]+)$/u);
  return { core, mark: m ? m[0] : '', trailer };
}

/** Sentences: split after . ? ! … followed by a space or a line break. */
const units = (core) => String(core || '').split(/(?<=[.?!…])\s+/u).map(s => s.trim()).filter(Boolean);

// A question by its wording ("Is your skin…", "Why does…") — not "How to fix…", "Why it works"
const AUX = 'is|are|am|do|does|did|can|could|should|would|will|isn\'t|aren\'t|don\'t|doesn\'t|didn\'t|can\'t|won\'t|have|has|was|were';
const Q1 = new RegExp(`^(?:${AUX})\\s+(?:you|your|it|this|that|these|those|he|she|they|we|there|my|our|any|anyone|men|guys)\\b`, 'i');
const Q2 = new RegExp(`^(?:why|what|how|when|where|who|which)\\s+(?:${AUX})\\b`, 'i');
const Q3 = /^(?:ever\s+(?:wonder|notice|tried|feel)|want\s+to\s+know|guess\s+what|know\s+what)\b/i;
const looksLikeQuestion = (s) => Q1.test(String(s).trim()) || Q2.test(String(s).trim()) || Q3.test(String(s).trim());

const finalKind = (lastUnit, mark) => (mark === '?' || /\?/.test(mark) ? 'question' : mark === '!' ? 'exclamation' : looksLikeQuestion(lastUnit) ? 'question' : mark === '.' ? 'statement' : 'fragment');

// ── layer type ──
const NAME_RULES = [
  ['search_headline', /search.{0,12}head/i], ['search_description', /search.{0,12}desc/i],
  ['url', /\b(?:url|link|website|web ?address|domain)\b/i],
  ['cta', /\b(?:cta|button|btn)\b|end ?card|endcard|end ?frame/i],
  ['claim', /\b(?:badge|claim|sticker|pill|callout|ribbon|seal|burst|roundel|tag)\b/i],
  ['caption', /\b(?:captions?|subtitles?|srt)\b/i],
  ['subhead', /\b(?:sub ?head(?:line|er)?|support(?:ing)?|body|description|desc|paragraph|copy ?text|small ?text)\b/i],
  ['super', /\b(?:super|motion|kinetic|lower ?third)\b/i],
  ['headline', /\b(?:head(?:line|er)?|hero|h1|main ?(?:text|title|line)|title)\b/i],
];
const URL_RE = /^(?:https?:\/\/)?(?:www\.)?[\w-]+(?:\.[\w-]+)*\.[a-z]{2,}(?:\/\S*)?\.?$/i;
const CTA_RE = /^(?:shop|buy|get|order|learn|discover|try|claim|save|start|see|grab|subscribe|sign up|book|download|tap|swipe|find|explore|join|unlock|reveal|check|upgrade|redeem|use code|click)\b/i;
const CLAIM_RE = /\d|%|\b(?:free|new|#1|no\.? ?1|clinically|proven|guarantee[d]?|only|just|dermatologist|award)\b/i;
const nameType = (name) => NAME_RULES.find(([, re]) => re.test(String(name || '')))?.[0] || null;
function textType(text) {
  const t = light(text);
  if (!t) return null;
  if (!/\s/.test(t) && URL_RE.test(t)) return 'url';
  const n = words(t).length;
  if (n <= 5 && CTA_RE.test(t) && !/\d|%/.test(t)) return 'cta';   // "Save 25%" is an offer (a claim), not a button
  return null;
}

/**
 * Classify the layers of one creative set. layers: [{ id, frame_id, name, text, box: { height }, lines? }] — a layer named
 * "Headline", "CTA", "Badge"… keeps that type; otherwise URL/CTA by its text, the biggest text in its frame is the
 * headline, a short claim-like line is a claim, the rest are subheads. opts.kind = 'video' → supers/captions instead.
 */
function classify(layers, { kind = 'design', voiceover = [] } = {}) {
  const vo = voiceover.map(v => ` ${words(v).join(' ')} `);
  const biggest = new Map();
  if (kind === 'design') {
    for (const l of layers) {
      const lines = Math.max(1, String(l.text || '').split('\n').length);
      const size = l.box?.height ? l.box.height / lines : 0;
      const cur = biggest.get(l.frame_id);
      if (!cur || size > cur.size) biggest.set(l.frame_id, { id: l.id, size });
    }
  }
  return layers.map((l) => {
    const e = ending(l.text);
    const us = units(e.core);
    let type = nameType(l.name) || textType(l.text);
    if (!type && kind === 'video') {
      const w = words(l.text);
      type = w.length >= 3 && vo.some(v => v.includes(` ${w.join(' ')} `)) ? 'caption' : (w.length <= 7 && us.length === 1 && CLAIM_RE.test(l.text) ? 'claim' : 'super');
    }
    if (!type) {
      const big = biggest.get(l.frame_id)?.id === l.id;
      type = big ? 'headline' : (words(l.text).length <= 7 && us.length === 1 && CLAIM_RE.test(l.text) ? 'claim' : 'subhead');
    }
    return { ...l, type, mark: e.mark, core: e.core, trailer: e.trailer, units: us, multi: us.length >= 2, final: finalKind(us[us.length - 1] || '', e.mark) };
  });
}

/** What the brief has right after this line's words: { found, mark } (mark '' = no closing mark). */
function briefEnding(text, briefRaw) {
  const w = words(text);
  if (!briefRaw || w.length < 2) return { found: false, mark: null };
  const re = new RegExp(`${w.map(esc).join('[^\\p{L}\\p{N}]+')}([.?!…]*)`, 'iu');
  const m = String(briefRaw).normalize('NFKD').replace(/[‘’]/g, "'").match(re);
  return m ? { found: true, mark: m[1] || '' } : { found: false, mark: null };
}

// a line that runs on into the next one: ends with , ; : or a dash
const runsOn = (l) => !!l.cont || !!l.stack || /[,;:\-–—]$/u.test(String(l.core || '').trim());   // cont: the next caption carries on the sentence
const withMark = (l, mark) => `${l.core.replace(/(?:\.{3}|…|[.?!]+)$/u, '')}${mark}${l.trailer || ''}`.trim();
const where = (ls, placeName) => [...new Set(ls.map(placeName))].join(', ');

/**
 * Run the rule over one creative set. layers: classified (or raw — classified here). placeName(layer) → "Frame 2 (4x5)"
 * / "0:07". Returns findings: [{ layer (the one to pin it on), layers, found, fix, severity: 'must_fix'|'check', rule, note }].
 */
function check(rawLayers, { brief = '', kind = 'design', voiceover = [], placeName = (l) => l.frame_label || l.frame_id || '' } = {}) {
  const layers = rawLayers.length && rawLayers[0].type && rawLayers[0].final ? rawLayers : classify(rawLayers, { kind, voiceover });
  const per = [];   // one per layer, merged by (rule, text) below
  const add = (l, severity, rule, fix, note) => per.push({ l, severity, rule, fix, note });
  const inGroup = new Set();   // layers already reported by a group (mixed) finding

  for (const l of layers) {
    if (!light(l.text)) continue;
    const L = LABEL[l.type] || 'Line';
    // questions: always one "?"
    if (l.final === 'question' && /^\?[?!]|^!\?/.test(l.mark)) { add(l, 'must_fix', 'repeated', withMark(l, '?'), `${L}: “${l.mark}” — a question ends with one “?”`); continue; }
    if (l.final === 'question' && (l.mark === '' || l.mark === '.') && l.type !== 'url') { add(l, 'must_fix', 'question', withMark(l, '?'), `${L} is a question — it needs a “?”`); continue; }
    if ((l.type === 'cta' || l.type === 'url') && /\./.test(l.mark) && l.mark !== '…' && l.mark !== '...') {
      add(l, 'must_fix', 'cta_period', withMark(l, ''), l.type === 'url' ? 'No period after a URL — it can break or confuse the address' : 'No period after a CTA'); continue;
    }
    if (l.type === 'search_headline') {
      if (/!/.test(l.text)) { add(l, 'must_fix', 'google', l.text.replace(/!+/g, ''), '“!” isn’t allowed in Google search headlines (disapproval risk)'); continue; }
      if (/[.?!]{2,}|…|\.{3}|•/.test(l.text)) { add(l, 'must_fix', 'google', l.text.replace(/([.?!])[.?!]+/g, '$1').replace(/…|\.{3}/g, '').replace(/•/g, ''), 'Repeated marks, ellipsis or bullets in a Google headline (disapproval risk)'); continue; }
    }
    if (l.type === 'search_description' && /([.?!])\1|\?!|!\?/.test(l.text)) { add(l, 'must_fix', 'google', l.text.replace(/([.?!])[.?!]+/g, '$1'), 'Repeated marks in a Google description (disapproval risk)'); continue; }
    if (l.type === 'claim' && l.mark === '.' && kind !== 'video') { add(l, 'check', 'claim_period', withMark(l, ''), 'Claims take no period'); continue; }   // video: style, off
  }

  // Google descriptions: at most one "!" across the ad
  const descs = layers.filter(l => l.type === 'search_description' && /!/.test(l.text));
  const bangs = descs.reduce((n, l) => n + (l.text.match(/!/g) || []).length, 0);
  if (bangs > 1) for (const l of descs.slice(1)) add(l, 'must_fix', 'google', l.text.replace(/!/g, '.'), 'More than one “!” across the Google descriptions');

  const flagged = new Set(per.map(p => p.l.id));
  // Consistency: same layer type + same structure, punctuated two ways in one set (statements / fragments only —
  // a "?" or "!" line is a different structure and is never compared with a "." line)
  const groups = new Map();
  for (const l of layers) {
    if (flagged.has(l.id) || !light(l.text) || !['headline', 'subhead', 'super', 'caption'].includes(l.type)) continue;
    if (l.final !== 'statement' && l.final !== 'fragment') continue;
    if (runsOn(l)) continue;   // "If you're a guy over 40," runs into the next line — no closing mark to align (was "40,.")
    // Video: nothing on screen is compared for period / no period (Tomer, 18 Nov 2026 — "best and less annoying"):
    // captions are loose on purpose, and supers / titles are read off the picture, so a missed title flips the majority
    // between sizes (The Hunt: "lose the period" on one size, "add one" on another). Designs keep it — exact layers.
    if (kind === 'video') continue;
    const key = `${l.type}|${l.multi ? 'multi' : 'single'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }
  const out = [];
  for (const [key, ls] of groups) {
    const [type] = key.split('|');
    const dot = ls.filter(l => l.mark === '.'), none = ls.filter(l => l.mark === '');
    if (dot.length && none.length) {
      const briefMarks = ls.map(l => briefEnding(l.text, brief)).filter(b => b.found && (b.mark === '' || b.mark === '.'));
      const target = briefMarks.length ? (briefMarks.filter(b => b.mark === '.').length >= briefMarks.filter(b => b.mark === '').length ? '.' : '')
        : (dot.length > none.length ? '.' : '');
      const off = target === '.' ? none : dot;
      const first = off[0];
      out.push({
        layer: first, layers: off, found: first.text, fix: withMark(first, target), severity: 'check', rule: 'mixed',
        note: `${LABEL[type]} ends with “.” in ${where(dot, placeName)} and with no mark in ${where(none, placeName)}. Align to ${briefMarks.length ? 'the brief' : 'the majority'} (${target === '.' ? 'with a period' : 'no period'}).`,
      });
      for (const l of ls) inGroup.add(l.id);
      continue;
    }
    // multi-sentence: last sentence left open while the others are closed → please check, unless it's the house style
    // for the whole group (every multi-sentence line in it leaves the last one open, at least two of them)
    if (type === 'headline' || type === 'super' || type === 'subhead') {
      const open = ls.filter(l => l.multi && l.mark === '' && !runsOn(l));
      const houseStyle = open.length >= 2 && open.length === ls.filter(l => l.multi).length;
      if (open.length && !houseStyle) {
        for (const l of open) {
          const b = briefEnding(l.text, brief);
          if (b.found && b.mark === '') continue;   // the brief leaves it open too
          per.push({ l, severity: 'check', rule: 'last_open', fix: withMark(l, '.'), note: `${LABEL[type]}: the last sentence is left open while the first is closed` });
          inGroup.add(l.id);
        }
      }
      // body copy (3+ sentences) is always punctuated
      for (const l of ls) if (type === 'subhead' && l.units.length >= 3 && l.mark === '' && !inGroup.has(l.id) && !runsOn(l)) {
        per.push({ l, severity: 'check', rule: 'body_open', fix: withMark(l, '.'), note: 'Body copy (3+ sentences) ends with punctuation' });
        inGroup.add(l.id);
      }
    }
  }

  // No "ends differently from the brief" note (Tomer, 18 Nov 2026: read the brief, don't hold the ad to it 1:1) — a
  // closing period the brief has and the ad drops, or the other way round, is the designer's style call. The brief
  // only breaks a tie inside the set (mixed endings above) and keeps an open last sentence the brief leaves open.

  // Captions: "." dropped at line ends while "," is kept
  const caps = kind === 'video' ? [] : layers.filter(l => l.type === 'caption' && light(l.text));   // off for video captions (18 Nov 2026)
  const commaEnd = caps.filter(l => /,$/.test(l.core));
  if (commaEnd.length && caps.some(l => l.final === 'fragment') && !caps.some(l => l.mark === '.')) {
    out.push({ layer: commaEnd[0], layers: commaEnd, found: commaEnd[0].text, fix: commaEnd[0].text.replace(/,\s*$/, ''), severity: 'check', rule: 'caption_comma',
      note: `Captions drop “.” at line ends but keep “,” (${where(commaEnd, placeName)}) — use one style for the whole video` });
  }

  // the same finding on the same text in several frames → one finding naming them
  const merged = new Map();
  for (const p of per) {
    const k = `${p.rule}|${light(p.l.text)}`;
    if (!merged.has(k)) merged.set(k, { ...p, ls: [p.l] }); else merged.get(k).ls.push(p.l);
  }
  for (const m of merged.values()) {
    const many = m.ls.length > 1;
    out.push({ layer: m.l, layers: m.ls, found: m.l.text, fix: m.fix, severity: m.severity, rule: m.rule, note: many ? `${m.note} (${where(m.ls, placeName)})` : m.note });
  }
  return out;
}

/** An AI finding that only adds/removes/changes the closing mark — code owns those (pure). */
function endOnly(issue) {
  if (!issue?.found || issue?.fix == null) return false;
  const a = light(issue.found), b = light(issue.fix);
  if (a === b) return false;
  const strip = (s) => s.replace(/[\s"'’”)\]]*(?:\.{3}|…|[.?!]+)?[\s"'’”)\]]*$/u, '');
  return strip(a) === strip(b);
}

const bareEnd = (s) => light(s).replace(/[\s"'’”)\]]*(?:\.{3}|…|[.?!]+)?[\s"'’”)\]]*$/u, '').toLowerCase();
/** covers(found): is this AI finding about one of the lines the code judged (so its end-mark note can go)? */
const coverer = (texts) => { const set = new Set(texts.map(bareEnd).filter(Boolean)); return (found) => set.has(bareEnd(found)); };

/** A Figma design task: frames [{ id, size, texts: [{ id, name, text, box }] }] → Captain issues (node_id / frame_id). */
function forDesign({ frames, brief = '' }) {
  const layers = (frames || []).flatMap((f, n) => (f.texts || []).map(t => ({ id: t.id, frame_id: f.id, frame_label: `frame ${n + 1}${f.size ? ` (${f.size})` : ''}`, name: t.name, text: t.text, box: t.box })));
  const issues = check(layers, { brief, kind: 'design' }).map(p => ({ node_id: p.layer.id, frame_id: p.layer.frame_id, found: p.found, fix: p.fix, type: 'punctuation', severity: p.severity, note: p.note, rule: `End punctuation · ${p.rule}` }));
  return { issues, covers: coverer(layers.map(l => l.text)) };
}

/** A video: the transcribed on-screen text [{ start, end, text }] (+ voiceover, to tell captions from supers). */
function forVideo({ onScreen, voiceover = [], brief = '' }) {
  const ts = (s) => { const n = Math.max(0, Math.round(Number(s) || 0)); return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`; };
  const shown = (onScreen || []).filter(t => t && t.text);
  // a caption broken mid-sentence ("there's your actual age" → "and there's the age people think you are.") carries on:
  // the next one starts in lowercase — it gets no closing mark of its own
  const layers = shown.map((t, n) => ({ id: `t${n}`, frame_id: 'video', frame_label: ts(t.start), name: '', text: t.text, start: t.start, end: t.end,
    cont: /(?:^|\n)[\s"'“‘(]*\p{Ll}/u.test(String(shown[n + 1]?.text || '')),
    // an end card or a stack of supers read as one block (3+ lines, or a web address in it) isn't a sentence to close
    stack: String(t.text).trim().split('\n').length >= 3 || /\b[\w-]+\.(?:com|co\.uk|net|org|io|shop)\b/i.test(String(t.text)) }));
  const issues = check(layers, { brief, kind: 'video', voiceover: (voiceover || []).map(v => v.text || '') })
    .map(p => ({ start: p.layer.start, end: p.layer.end, found: p.found, fix: p.fix, type: 'punctuation', severity: p.severity, note: p.note }));
  return { issues, covers: coverer(layers.map(l => l.text)) };
}

/** The house rule as the AI reads it (both prompts). */
const PROMPT_RULE = 'End punctuation (a closing . ? ! … at the end of a line) is checked by code with the house rule — do NOT report a period that is there or missing at the END of a headline, super, claim, CTA, URL or caption, and never call different endings "inconsistent". A closing period is a style choice. DO report a sentence left unclosed INSIDE a line (e.g. "Not working Here\'s why" → "Not working? Here\'s why") as type "punctuation", severity "must_fix".';

module.exports = { check, classify, ending, units, looksLikeQuestion, briefEnding, endOnly, forDesign, forVideo, PROMPT_RULE, LABEL };

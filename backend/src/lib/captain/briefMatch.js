/**
 * Brief-match on delivery: when a video or design arrives for a Monday item whose brief passed pre-flight, compare
 * what was made with the approved on-screen text — missing lines, changed wording, a version or size missing a line.
 * Pure functions — tested in backend/test/captain.test.js.
 *
 * Issues come out in the same shape as the AI's (video: start/end seconds; design: node_id/frame_node_id), with
 * type brief_mismatch (wording changed) or brief_missing, always severity "check": the editor may have had a reason.
 */
const MAX_ISSUES = 8;

const norm = (s) => String(s || '').normalize('NFKC').toLowerCase()
  .replace(/[’‘`´]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')
  .replace(/[^\p{L}\p{N}%$'\s-]+/gu, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s) => norm(s).split(' ').filter(Boolean);

/** Longest common subsequence of two token lists → similarity 0..1 against the approved line's length. */
function similarity(approved, seen) {
  const a = tokens(approved), b = tokens(seen);
  if (!a.length) return 1;
  if (!b.length) return 0;
  const dp = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev + 1 : Math.max(dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  const lcs = dp[b.length];
  return (2 * lcs) / (a.length + Math.min(b.length, a.length + 4));   // a longer on-screen chunk isn't punished much
}

const vnum = (v) => { const m = String(v || '').match(/(\d+)/); return m ? Number(m[1]) : null; };

/** The approved lines that belong in this deliverable (version/variant and size), split into on-screen and voiceover. */
function linesFor(approved, { variant = null, size = null } = {}) {
  const lines = (approved || []).filter(l => String(l.text || '').trim());
  const versions = [...new Set(lines.map(l => vnum(l.version)).filter(Boolean))];
  const keep = lines.filter(l => {
    const v = vnum(l.version);
    if (v && variant && v !== variant) return false;
    if (v && !variant && versions.length > 1) return false;           // file names no version, brief has several: only shared lines are certain
    if (l.size && size && l.size !== size) return false;
    return true;
  });
  return { onScreen: keep.filter(l => l.kind !== 'vo'), voiceover: keep.filter(l => l.kind === 'vo') };
}

/** Best match for `text` among single entries and runs of up to 3 consecutive entries (long lines get split on screen). */
function bestMatch(text, entries) {
  let best = { sim: 0, text: null, start: null, end: null, idx: -1 };
  for (let i = 0; i < entries.length; i++) {
    let joined = '';
    for (let k = 0; k < 3 && i + k < entries.length; k++) {
      joined = `${joined} ${entries[i + k].text || ''}`.trim();
      const sim = similarity(text, joined);
      if (sim > best.sim) best = { sim, text: joined, start: entries[i].start ?? null, end: entries[i + k].end ?? entries[i + k].start ?? null, idx: i };
    }
  }
  return best;
}

/**
 * Video: approved lines vs the on-screen text and voiceover the AI transcribed.
 * deliverable: { variant, size }. Returns [{ start, end, found, fix, type, severity, note }].
 */
function matchVideo(approved, { onScreen = [], voiceover = [] } = {}, deliverable = {}) {
  const want = linesFor(approved, deliverable);
  const issues = [];
  const check = (line, entries, okAt, nearAt, what) => {
    const b = bestMatch(line.text, entries);
    if (b.sim >= okAt) return;
    const where = [line.version, line.size].filter(Boolean).join(' · ');
    const note = `approved in brief pre-flight${where ? ` (${where})` : ''}`;
    if (b.sim >= nearAt) issues.push({ start: b.start ?? line.start ?? 0, end: b.end ?? b.start ?? line.end ?? 0, found: b.text, fix: line.text, type: 'brief_mismatch', severity: 'check', note: `${what} wording changed — ${note}` });
    else issues.push({ start: line.start ?? 0, end: line.end ?? line.start ?? 0, found: '', fix: line.text, type: 'brief_missing', severity: 'check', note: `${what} line missing — ${note}` });
  };
  for (const l of want.onScreen) check(l, onScreen, 0.92, 0.5, 'On-screen');
  for (const l of want.voiceover) check(l, voiceover, 0.85, 0.45, 'Voiceover');
  return issues.slice(0, MAX_ISSUES);
}

/**
 * Design: approved lines vs the exact text layers. A line on every version ("On all versions") must be in every
 * frame of its size; a version's line must be in at least one frame of each size.
 * frames: [{ id, size, texts: [{ id, text }] }]. Returns [{ node_id, frame_node_id, found, fix, type, severity, note }].
 */
function matchDesign(approved, frames = []) {
  const lines = (approved || []).filter(l => l.kind !== 'vo' && String(l.text || '').trim());
  const issues = [];
  const frameText = (f) => f.texts.map(t => ({ text: t.text, id: t.id }));
  const scoreIn = (line, f) => {
    const entries = frameText(f);
    const b = bestMatch(line.text, entries);
    return { ...b, layer: entries[b.idx]?.id || f.id };
  };
  const sizes = [...new Set(frames.map(f => f.size || null))];
  for (const line of lines) {
    const label = [line.version, line.size].filter(Boolean).join(' · ');
    const pool = frames.filter(f => !line.size || !f.size || f.size === line.size);
    if (!pool.length) continue;
    const groups = line.version ? sizes.filter(s => !line.size || !s || s === line.size).map(s => pool.filter(f => (f.size || null) === s)) : pool.map(f => [f]);
    for (const group of groups) {
      if (!group.length) continue;
      const scored = group.map(f => ({ f, ...scoreIn(line, f) })).sort((a, b) => b.sim - a.sim);
      const top = scored[0];
      if (top.sim >= 0.92) continue;
      const frameLabel = `${top.f.size ? `${top.f.size} ` : ''}frame "${String(top.f.name || top.f.id).slice(0, 40)}"`;
      if (top.sim >= 0.5) issues.push({ node_id: top.layer, frame_node_id: top.f.id, found: top.text, fix: line.text, type: 'brief_mismatch', severity: 'check', note: `wording changed from the approved brief${label ? ` (${label})` : ''}` });
      else issues.push({ node_id: top.f.id, frame_node_id: top.f.id, found: '', fix: line.text, type: 'brief_missing', severity: 'check', note: `approved line missing in ${frameLabel}${label ? ` (${label})` : ''}` });
      if (issues.length >= MAX_ISSUES) return issues;
    }
  }
  return issues;
}

module.exports = { similarity, linesFor, bestMatch, matchVideo, matchDesign, norm };

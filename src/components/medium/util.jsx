export const STATUS = {
  QUEUED: ['Queued', 'amber'], WRITING: ['Writing…', 'amber'], PENDING_REVIEW: ['Waiting for review', 'gray'], APPROVED: ['Approved', 'green'], SUBMITTED: ['On Monday', 'green'],
  REJECTED: ['Rejected', 'gray'], DROPPED: ['Didn’t make it', 'red'], ERROR: ['Something went wrong', 'red'],
};
export const BAND = { ready: ['Ready', 'green'], one_more_pass: ['Almost there', 'amber'], below_bar: ['Needs work', 'red'], blocked: ['Has a blocker', 'red'] };
export const SUB_LABEL = { evidence: 'Evidence', pattern_fit: 'Pattern fit', hook_strength: 'Hook strength', proof: 'Proof', freshness: 'Freshness', message_match: 'Message match', maker_ready: 'Maker-ready', test_design: 'Test design' };
export const SUB_WEIGHT = { evidence: 15, pattern_fit: 15, hook_strength: 15, proof: 15, freshness: 10, message_match: 10, maker_ready: 10, test_design: 10 };
/** Moves in a strategist's words: emoji, name, one line. */
export const MOVE_INFO = {
  NEW_ANGLE: ['✨', 'Something new', 'An angle we haven’t tried for this product yet.'],
  ITERATE: ['🎣', 'New hooks for a winner', 'Keep the body that works and test fresh openings.'],
  REFRESH: ['🔄', 'Fresh take on a winner', 'Same idea, new people and look — for an ad that’s tiring.'],
  TRANSFER_PRODUCT: ['➡️', 'Take a winner to another product', 'A winning idea, moved to a product it fits.'],
  TRANSFER_LANE: ['🛣️', 'Take a winner to another lane', 'Same product, another storefront — SFY, GT or WAC.'],
  TRANSFER_FORMAT: ['🔁', 'Video ↔ static', 'Turn a winning video into statics, or the reverse.'],
  HEADLINE_HOOK: ['🪝', 'Headline → video hook', 'A winning static’s headline opens a new video.'],
  REVIVE: ['🌱', 'Bring back an unused idea', 'A sibling of a winner that never got to run.'],
  FREEFORM: ['💡', 'Your idea', 'Written from your own words.'],
};
export const MOVE_LABEL = Object.fromEntries(Object.entries(MOVE_INFO).map(([k, v]) => [k, v[1]]));
export const KIND_LABEL = { original: 'Original concept', reference_adaptation: 'Reference adaptation', template_swap: 'Template swap', static_gif: 'Static → GIF', creator_edit: 'Creator edit', new_hooks: 'New hooks', translation: 'Translation' };
export const FINDING = { supports: ['Supports', 'green'], overlap: ['Overlap', 'amber'], risk: ['Risk', 'red'], gap: ['Gap', 'gray'], bonus: ['Bonus', 'violet'] };
export const LANE_LABEL = { Particle: 'Particle', SFY: 'Science For You', GT: 'Gentleman Today', WAC: 'We Are Colognes' };

export const money = (n) => (n == null ? '' : n < 0.01 ? '<1¢' : n < 1 ? `${Math.round(n * 100)}¢` : `$${Number(n).toFixed(2)}`);
export function relTime(iso) {
  if (!iso) return '';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function Chip({ tone = 'gray', children, title }) {
  return <span className={`trk-chip ${tone}`} title={title}>{children}</span>;
}

/** A score: the number, its band, and "uncalibrated" until real outcomes exist. */
export function ScoreBadge({ score, band }) {
  if (score == null && !band) return <Chip>No score</Chip>;
  const [label, tone] = BAND[band] || ['', 'gray'];
  const short = { ready: 'ready', one_more_pass: 'one more pass', below_bar: 'below the bar' }[band];
  return <Chip tone={tone} title={`${label} (uncalibrated)`}>{score == null ? 'Blocked' : `${score}${short ? ` · ${short}` : ''}`}</Chip>;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

/**
 * One friendly verdict per brief — what a strategist needs to know before opening it.
 * { key, label, tone, emoji, line }; works on list rows (band / preflight / must_fix) and full briefs (score / preflight objects).
 */
export function readiness(b) {
  if (!b) return null;
  const band = b.band ?? b.score?.band;
  const pf = typeof b.preflight === 'string' ? b.preflight : b.preflight?.verdict;
  const mustFix = Number(b.must_fix ?? b.preflight?.must_fix ?? 0);
  switch (b.status) {
    case 'QUEUED': case 'WRITING': return { key: 'writing', label: 'Writing…', tone: 'amber', emoji: '✍️', line: 'Medium is writing and checking it — about a minute.' };
    case 'APPROVED': return { key: 'approved', label: 'Approved', tone: 'green', emoji: '👍', line: 'Approved — not on Monday yet.' };
    case 'SUBMITTED': return { key: 'monday', label: 'On Monday', tone: 'green', emoji: '📮', line: 'The ticket is on Monday.' };
    case 'REJECTED': return { key: 'rejected', label: 'Rejected', tone: 'gray', emoji: '🗂️', line: b.review_reason ? `Rejected: ${b.review_reason}` : 'Rejected.' };
    case 'DROPPED': return { key: 'dropped', label: 'Didn’t make it', tone: 'red', emoji: '🧯', line: 'It failed the house-style check twice — fix it by hand or write it again.' };
    case 'ERROR': return { key: 'error', label: 'Something went wrong', tone: 'red', emoji: '⚠️', line: 'Writing failed — try again.' };
    default: break;
  }
  if (mustFix > 0 || band === 'blocked') return { key: 'fix', label: 'Needs a fix', tone: 'red', emoji: '🛠️', line: mustFix > 0 ? `Captain Caption found ${plural(mustFix, 'thing')} to fix before it can be approved.` : 'One of the brand rules blocks it — open it to see which.' };
  if (!pf || pf === 'error') return { key: 'unchecked', label: 'Not checked yet', tone: 'amber', emoji: '⏳', line: 'Captain Caption hasn’t checked it yet — press “Check again”.' };
  if (band === 'below_bar') return { key: 'work', label: 'Needs work', tone: 'amber', emoji: '👀', line: 'It’s below the bar — improve it, or edit it yourself.' };
  if (band === 'one_more_pass') return { key: 'almost', label: 'Almost there', tone: 'amber', emoji: '✨', line: 'Good to go — Medium has a few ideas that could make it stronger.' };
  return { key: 'ready', label: 'Ready to approve', tone: 'green', emoji: '✅', line: 'Captain checked every line and it clears the bar.' };
}
export const READY_ORDER = { ready: 0, almost: 1, unchecked: 2, work: 3, fix: 4, writing: 5 };

/** Who asked for it, in plain words. */
export function origin(b) {
  if (b.source === 'autopilot') return 'Autopilot';
  if (b.source === 'holiday') return 'Holiday plan';
  if (b.source === 'mass') return 'Mass production';
  if (b.source === 'freeform') return b.author ? `${String(b.author).split(' ')[0]}’s idea` : 'An idea';
  return b.author ? String(b.author).split(' ')[0] : 'Medium';
}

/** The line a strategist recognises a brief by: its hook (once, in curly quotes), else the concept part of the ticket name. */
export function headline(b) {
  const hook = String(b?.hook ?? b?.fields?.hook ?? '').trim().replace(/^["“”'‘’]+|["“”'‘’]+$/g, '').trim();
  if (hook) return `“${hook}”`;
  const name = String(b?.ticket_name || '').trim();
  if (!name) return null;
  const parts = name.split('|').map(x => x.trim()).filter(Boolean);
  return parts.length > 2 ? parts.slice(3).join(' · ') || parts[parts.length - 1] : name;
}

/** "Fri, Dec 4" from 2026-12-04. */
export function niceDate(ymd) {
  if (!ymd) return '';
  const d = new Date(`${String(ymd).slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? String(ymd) : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// typical seconds left at the start of each writing step (measured roughly; the screen counts down from there)
const LEFT = { context: 80, transfer: 75, writing: 65, rewrite: 45, scoring: 30, proofreading: 18, improving1: 70, improving2: 45, references: 100, freeform_writing: 90, freeform_checking: 40 };
const PER_BRIEF = 80;
const fmtLeft = (s) => (s < 60 ? `about ${Math.max(5, Math.round(s / 5) * 5)}s left` : `about ${Math.round(s / 60)} min left`);

/** Where a brief that's being written is: { pct, label, left } — ahead = briefs before it in the line (pure). */
export function progressInfo(b, ahead = 0, now = Date.now()) {
  if (b.status === 'QUEUED' || (b.status === 'WRITING' && !b.progress)) {
    if (b.status === 'WRITING') return { pct: 3, label: 'Starting…', left: fmtLeft(PER_BRIEF) };
    return { pct: 0, label: ahead > 0 ? `Waiting in line — ${ahead} ahead` : 'Next in line', left: fmtLeft(PER_BRIEF * (ahead + 1)) };
  }
  const p = b.progress || {};
  const elapsed = (now - new Date(p.at || now).getTime()) / 1000;
  const base = LEFT[p.stage] ?? PER_BRIEF;
  const left = base - elapsed;
  return { pct: Math.min(97, Number(p.pct) || 3), label: p.label || 'Writing…', left: left > 4 ? fmtLeft(left) : 'almost done…' };
}

export const STATUS = {
  QUEUED: ['Queued', 'amber'], WRITING: ['Writing…', 'amber'], PENDING_REVIEW: ['Waiting for review', 'gray'], APPROVED: ['Approved', 'green'], SUBMITTED: ['On Monday', 'green'],
  REJECTED: ['Rejected', 'gray'], DROPPED: ['Dropped (style)', 'red'], ERROR: ['Error', 'red'],
};
export const BAND = { ready: ['Ready to submit', 'green'], one_more_pass: ['One more pass recommended', 'amber'], below_bar: ['Below the bar', 'red'], blocked: ['Blocked by guardrails', 'red'] };
export const SUB_LABEL = { evidence: 'Evidence', pattern_fit: 'Pattern fit', hook_strength: 'Hook strength', proof: 'Proof', freshness: 'Freshness', message_match: 'Message match', maker_ready: 'Maker-ready', test_design: 'Test design' };
export const SUB_WEIGHT = { evidence: 15, pattern_fit: 15, hook_strength: 15, proof: 15, freshness: 10, message_match: 10, maker_ready: 10, test_design: 10 };
export const MOVE_LABEL = { ITERATE: 'Iterate', REFRESH: 'Refresh', TRANSFER_PRODUCT: 'Transfer · product', TRANSFER_LANE: 'Transfer · lane', TRANSFER_FORMAT: 'Transfer · format', HEADLINE_HOOK: 'Headline → hook', REVIVE: 'Revive', NEW_ANGLE: 'New angle', FREEFORM: 'Freeform' };
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

/** A score: the number, its band, and "uncalibrated" until AfterLife outcomes exist. */
export function ScoreBadge({ score, band }) {
  if (score == null && !band) return <Chip>No score</Chip>;
  const [label, tone] = BAND[band] || ['', 'gray'];
  const short = { ready: 'ready', one_more_pass: 'one more pass', below_bar: 'below the bar' }[band];
  return <Chip tone={tone} title={`${label} (uncalibrated)`}>{score == null ? 'Blocked' : `${score}${short ? ` · ${short}` : ''}`}</Chip>;
}

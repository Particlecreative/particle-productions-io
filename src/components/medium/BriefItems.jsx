import { LANE_LABEL, MOVE_LABEL, readiness, origin, relTime, headline, progressInfo } from './util';

const FORMAT = { video: ['🎬', 'Video'], design: ['🎨', 'Static'] };

export function ReadyPill({ b, r = readiness(b) }) {
  if (!r) return null;
  return <span className={`md-ready ${r.tone}`} title={r.line}><span aria-hidden>{r.emoji}</span>{r.label}</span>;
}

/** A brief as a card: the hook is the hero, then why, then who asked. */
export function BriefCard({ b, onOpen }) {
  const r = readiness(b);
  const [emoji, fmt] = FORMAT[b.format] || ['📝', 'Brief'];
  return (
    <button type="button" className="md-brief" onClick={onOpen}>
      <div className="md-brief-top">
        <span aria-hidden>{emoji}</span>
        <span className="truncate"><b className="font-semibold" style={{ color: 'var(--trk-text)' }}>{b.product || fmt}</b>{b.lane && b.lane !== 'Particle' ? ` · ${LANE_LABEL[b.lane] || b.lane}` : ''}</span>
        <span className="ml-auto"><ReadyPill r={r} /></span>
      </div>
      <div className="md-brief-hook">{headline(b) || 'Writing…'}</div>
      {b.why && <div className="md-brief-why">{b.why}</div>}
      <div className="md-brief-meta">{MOVE_LABEL[b.move] || 'Brief'} · {origin(b)} · {relTime(b.created_at)}</div>
    </button>
  );
}

/** A brief that's being written: what it is, the step it's on, a bar, and about how long is left. */
export function WritingRow({ b, ahead = 0, onOpen }) {
  const p = progressInfo(b, ahead);
  const [emoji] = FORMAT[b.format] || ['📝'];
  const what = b.req_headline ? `“${b.req_headline}”` : [b.product || 'A brief', MOVE_LABEL[b.move] ? MOVE_LABEL[b.move].toLowerCase() : null].filter(Boolean).join(' — ');
  return (
    <button type="button" className="md-row" onClick={onOpen}>
      <span aria-hidden className="text-[20px]">{emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold truncate" style={{ color: 'var(--trk-text)' }}>{what}</span>
        <span className="block text-[12.5px] trk-muted truncate">{p.label}{b.lane && b.lane !== 'Particle' ? ` · ${LANE_LABEL[b.lane] || b.lane}` : ''} · {origin(b)}</span>
        <span className="block mt-1.5 h-[5px] rounded-full overflow-hidden" style={{ background: 'var(--trk-glass-hi)' }}><span className="block h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(3, p.pct)}%`, background: 'var(--trk-electric)' }} /></span>
      </span>
      <span className="text-right flex-none min-w-[92px]"><span className="block text-[13px] font-semibold tabular-nums" style={{ color: 'var(--trk-text)' }}>{p.pct}%</span><span className="block text-[11.5px] trk-dim">{p.left}</span></span>
    </button>
  );
}

/** A brief as a list row (runs, the briefs list). */
export function BriefRow({ b, onOpen, ahead = 0 }) {
  if (['QUEUED', 'WRITING'].includes(b.status)) return <WritingRow b={b} ahead={ahead} onOpen={onOpen} />;
  const r = readiness(b);
  const [emoji] = FORMAT[b.format] || ['📝'];
  return (
    <button type="button" className="md-row" onClick={onOpen}>
      <span aria-hidden className="text-[20px]">{emoji}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold truncate" style={{ color: 'var(--trk-text)' }}>{headline(b) || `${b.product || 'Brief'} — writing…`}</span>
        <span className="block text-[12.5px] trk-muted truncate">{[b.product, b.lane && b.lane !== 'Particle' ? LANE_LABEL[b.lane] || b.lane : null, MOVE_LABEL[b.move], origin(b), relTime(b.created_at)].filter(Boolean).join(' · ')}</span>
        {b.error && <span className="block text-[12.5px] truncate" style={{ color: 'var(--trk-red)' }}>{b.error}</span>}
      </span>
      <ReadyPill r={r} />
    </button>
  );
}

import { useMemo, useState } from 'react';
import { Sparkles, CalendarDays } from 'lucide-react';
import { STATUS, MOVE_LABEL, LANE_LABEL, Chip, ScoreBadge, relTime } from './util';

const BELIEF = { proven: ['Proven', 'green'], testing: ['Testing', 'amber'], assumption: ['Assumption', 'gray'], retired: ['Retired', 'gray'] };

/** The week at a glance: what waits for review, what Medium believes, what it borrows, and the next holiday. */
export default function StrategyRoom({ overview, briefs, onOpen, go }) {
  const [lane, setLane] = useState('');
  const counts = useMemo(() => {
    const m = {};
    for (const r of overview?.counts || []) m[r.status] = (m[r.status] || 0) + r.n;
    return m;
  }, [overview]);
  const queue = (briefs || []).filter(b => ['PENDING_REVIEW', 'QUEUED', 'WRITING', 'DROPPED'].includes(b.status) && (!lane || b.lane === lane));
  const next = (overview?.holidays || []).find(h => h.days_to_brief_by >= 0) || overview?.holidays?.[0];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Waiting for review" value={counts.PENDING_REVIEW || 0} sub={`${(counts.QUEUED || 0) + (counts.WRITING || 0)} being written`} />
        <Tile label="Approved" value={(counts.APPROVED || 0) + (counts.SUBMITTED || 0)} sub="shadow mode — kept in CP" />
        <Tile label="Medium briefs → winners" value="[AfterLife]" sub="fills in once the first briefs are scored" small />
        <div className="trk-glass p-5">
          <div className="trk-label flex items-center gap-1.5"><CalendarDays size={13} /> Next holiday</div>
          {next ? (<>
            <div className="text-[22px] font-semibold mt-2">{next.name}</div>
            <div className="text-[12.5px] trk-muted mt-1">{next.days_to_brief_by >= 0 ? `Briefs due in ${next.days_to_brief_by} day${next.days_to_brief_by === 1 ? '' : 's'} (${next.brief_by})` : `Brief window closed ${-next.days_to_brief_by} days ago`} · sale {next.date}</div>
          </>) : <div className="trk-dim text-sm mt-2">—</div>}
        </div>
      </div>

      <div className="grid xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-5">
        <div className="trk-glass p-5">
          <div className="flex flex-wrap items-center gap-2">
            <div className="trk-label">Review queue</div>
            <div className="trk-seg ml-auto">{['', ...(overview?.options?.lanes || [])].map(l => <button key={l || 'all'} type="button" className={lane === l ? 'on' : ''} onClick={() => setLane(l)}>{l || 'All lanes'}</button>)}</div>
          </div>
          <div className="mt-2">
            {!queue.length && (
              <div className="py-8 text-center">
                <div className="text-3xl">🔮</div>
                <div className="mt-2 font-semibold">Nothing waiting{lane ? ` in ${LANE_LABEL[lane]}` : ''}</div>
                <button type="button" className="trk-btn primary mt-3" onClick={() => go('generate')}><Sparkles size={13} /> Generate briefs</button>
              </div>
            )}
            {queue.map(b => <BriefRow key={b.id} b={b} onOpen={() => onOpen(b.id)} />)}
          </div>
        </div>

        <div className="space-y-5">
          <div className="trk-glass p-5">
            <div className="flex items-center"><div className="trk-label">What Medium believes right now</div><button type="button" className="ml-auto text-[12px] trk-muted hover:underline" onClick={() => go('learns')}>All assumptions →</button></div>
            <div className="mt-2 space-y-2.5">
              {(overview?.beliefs || []).slice(0, 5).map(x => { const [l, t] = BELIEF[x.status] || BELIEF.assumption; return (
                <div key={x.id} className="text-[13.5px]"><Chip tone={t}>{l}</Chip> <span className="ml-1">{x.claim}</span><div className="text-[12px] trk-dim mt-0.5">Would change its mind: {x.change_condition}</div></div>
              ); })}
            </div>
          </div>
          <div className="trk-glass p-5">
            <div className="trk-label">Customer language Medium reuses</div>
            {(overview?.language_bank || []).length
              ? <div className="mt-2 flex flex-wrap gap-1.5">{overview.language_bank.slice(0, 8).map((q, i) => <Chip key={i}>“{q}”</Chip>)}</div>
              : <div className="mt-2 text-[13px] trk-dim">Empty — fills from Upspring ad comments once connected, or add phrases in “What it learns from”.</div>}
          </div>
          <div className="trk-glass p-5">
            <div className="trk-label">Structure donors in rotation</div>
            <div className="mt-2 space-y-1 text-[13px]">{(overview?.donors || []).map(d => <div key={d.brand} className="flex gap-2"><b>{d.brand}</b><span className="trk-muted flex-1">{d.takes}</span><span className="trk-dim tabular-nums">{d.usage_count}</span></div>)}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BriefRow({ b, onOpen }) {
  const [label, tone] = STATUS[b.status] || [b.status, 'gray'];
  return (
    <button type="button" className="w-full text-left py-3 px-2 rounded-xl hover:bg-[var(--trk-glass-hi)] transition-colors" style={{ borderTop: '1px solid var(--trk-line)' }} onClick={onOpen}>
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-[18px] mt-0.5">{b.format === 'design' ? '🎨' : '🎬'}</span>
        <div className="min-w-0 flex-1">
          <div className="font-semibold truncate">{b.ticket_name || `${b.product || 'Brief'} — writing…`}</div>
          <div className="mt-1 flex flex-wrap gap-1.5 items-center text-[12px]">
            <Chip tone={tone}>{label}</Chip>
            {b.lane && <Chip>{b.lane}</Chip>}
            {b.move && <Chip>{MOVE_LABEL[b.move] || b.move}</Chip>}
            {b.status === 'PENDING_REVIEW' && <ScoreBadge score={b.score} band={b.band} />}
            {b.preflight === 'passed' && <Chip tone="green">Captain ✓</Chip>}
            {b.preflight === 'issues' && <Chip tone="red">Captain: {b.must_fix} must-fix</Chip>}
            <span className="trk-dim">{relTime(b.created_at)}{b.author ? ` · ${b.author}` : ''}</span>
          </div>
          {b.why && <div className="mt-1 text-[12.5px] trk-muted line-clamp-2">Why: {b.why}</div>}
          {b.error && <div className="mt-1 text-[12.5px] line-clamp-2" style={{ color: 'var(--trk-red)' }}>{b.error}</div>}
        </div>
      </div>
    </button>
  );
}

function Tile({ label, value, sub, small }) {
  return (
    <div className="trk-glass p-5">
      <div className="trk-label">{label}</div>
      <div className={`cc-stat mt-2 ${small ? '!text-[30px] trk-muted' : ''}`}>{value}</div>
      <div className="mt-1 text-[12px] trk-muted">{sub}</div>
    </div>
  );
}

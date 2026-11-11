import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { LANE_LABEL } from './util';
import { BriefRow } from './BriefItems';

const VIEWS = [
  ['waiting', 'Waiting for you', ['PENDING_REVIEW']],
  ['writing', 'Being written', ['QUEUED', 'WRITING']],
  ['approved', 'Approved', ['APPROVED', 'SUBMITTED']],
  ['archive', 'Not used', ['REJECTED', 'DROPPED', 'ERROR']],
  ['all', 'Everything', null],
];

/** Every brief, simply: a view, a lane, a search box. */
export default function Briefs({ briefs, overview, onOpen }) {
  const [view, setView] = useState('waiting');
  const [lane, setLane] = useState('');
  const [q, setQ] = useState('');
  const counts = useMemo(() => Object.fromEntries(VIEWS.map(([k, , st]) => [k, (briefs || []).filter(b => !st || st.includes(b.status)).length])), [briefs]);
  const list = useMemo(() => {
    const st = VIEWS.find(v => v[0] === view)?.[2];
    const needle = q.trim().toLowerCase();
    return (briefs || []).filter(b => (!st || st.includes(b.status)) && (!lane || b.lane === lane)
      && (!needle || [b.hook, b.ticket_name, b.product, b.why, b.author].some(x => String(x || '').toLowerCase().includes(needle))));
  }, [briefs, view, lane, q]);

  return (
    <div className="trk-glass rounded-3xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="trk-seg overflow-x-auto max-w-full">
          {VIEWS.map(([k, label]) => <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>{label}{counts[k] ? ` · ${counts[k]}` : ''}</button>)}
        </div>
        <div className="flex gap-2 ml-auto flex-wrap">
          <select className="trk-input !w-auto" value={lane} onChange={(e) => setLane(e.target.value)} aria-label="Lane"><option value="">All lanes</option>{(overview?.options?.lanes || []).map(l => <option key={l} value={l}>{LANE_LABEL[l] || l}</option>)}</select>
          <label className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 trk-dim" /><input className="trk-input !pl-9 !w-[220px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hooks, products…" aria-label="Search briefs" /></label>
        </div>
      </div>
      <div className="mt-3">
        {list.length ? list.map(b => <BriefRow key={b.id} b={b} onOpen={() => onOpen(b.id)} />)
          : <div className="md-empty"><div className="md-emoji" aria-hidden>🔍</div><div className="mt-2 font-semibold">Nothing here</div><div className="md-sub mt-1">{q || lane ? 'Try another search or lane.' : 'Briefs show up here as soon as Medium writes them.'}</div></div>}
      </div>
    </div>
  );
}

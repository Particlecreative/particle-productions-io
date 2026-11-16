import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { LANE_LABEL } from './util';
import { BriefRow } from './BriefItems';

const FORMATS = [['', 'All'], ['video', '🎬 Video'], ['design', '🎨 Design']];
const FORMAT_KEY = 'cp_medium_briefs_format';
const isFormat = (b, f) => !f || (f === 'design' ? b.format === 'design' : b.format !== 'design');

const VIEWS = [
  ['waiting', 'Waiting for you', ['PENDING_REVIEW']],
  ['writing', 'Being written', ['QUEUED', 'WRITING']],
  ['approved', 'Approved', ['APPROVED', 'SUBMITTED']],
  ['archive', 'Not used', ['REJECTED', 'DROPPED', 'ERROR']],
  ['all', 'Everything', null],
];

/** Every brief, simply: a view, video or design, a lane, a search box. */
export default function Briefs({ briefs, overview, onOpen }) {
  const [view, setView] = useState('waiting');
  const [lane, setLane] = useState('');
  const [q, setQ] = useState('');
  const [format, setFormatState] = useState(() => { try { const v = localStorage.getItem(FORMAT_KEY) || ''; return FORMATS.some(([k]) => k === v) ? v : ''; } catch { return ''; } });
  const setFormat = (v) => { setFormatState(v); try { localStorage.setItem(FORMAT_KEY, v); } catch { /* private window */ } };
  // the view counts follow the video / design and lane choice, so "Waiting for you · 12" means 12 of what you're looking at
  const scoped = useMemo(() => (briefs || []).filter(b => isFormat(b, format) && (!lane || b.lane === lane)), [briefs, format, lane]);
  const counts = useMemo(() => Object.fromEntries(VIEWS.map(([k, , st]) => [k, scoped.filter(b => !st || st.includes(b.status)).length])), [scoped]);
  const formatCounts = useMemo(() => {
    const st = VIEWS.find(v => v[0] === view)?.[2];
    const inView = (briefs || []).filter(b => (!st || st.includes(b.status)) && (!lane || b.lane === lane));
    return Object.fromEntries(FORMATS.map(([k]) => [k, inView.filter(b => isFormat(b, k)).length]));
  }, [briefs, view, lane]);
  const list = useMemo(() => {
    const st = VIEWS.find(v => v[0] === view)?.[2];
    const needle = q.trim().toLowerCase();
    return scoped.filter(b => (!st || st.includes(b.status))
      && (!needle || [b.hook, b.ticket_name, b.product, b.why, b.author].some(x => String(x || '').toLowerCase().includes(needle))));
  }, [scoped, view, q]);

  return (
    <div className="trk-glass rounded-3xl p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="trk-seg overflow-x-auto max-w-full">
          {VIEWS.map(([k, label]) => <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}>{label}{counts[k] ? ` · ${counts[k]}` : ''}</button>)}
        </div>
        <div className="flex gap-2 ml-auto flex-wrap items-center">
          <div className="trk-seg" role="group" aria-label="Video or design">
            {FORMATS.map(([k, label]) => <button key={k || 'all'} type="button" aria-pressed={format === k} className={format === k ? 'on' : ''} onClick={() => setFormat(k)}>{label}{k && formatCounts[k] ? ` · ${formatCounts[k]}` : ''}</button>)}
          </div>
          <select className="trk-input !w-auto" value={lane} onChange={(e) => setLane(e.target.value)} aria-label="Lane"><option value="">All lanes</option>{(overview?.options?.lanes || []).map(l => <option key={l} value={l}>{LANE_LABEL[l] || l}</option>)}</select>
          <label className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 trk-dim" /><input className="trk-input !pl-9 !w-[220px]" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hooks, products…" aria-label="Search briefs" /></label>
        </div>
      </div>
      <div className="mt-3">
        {list.length ? list.map(b => <BriefRow key={b.id} b={b} ahead={b.status === 'QUEUED' ? (briefs || []).filter(x => ['QUEUED', 'WRITING'].includes(x.status) && new Date(x.created_at) < new Date(b.created_at)).length : 0} onOpen={() => onOpen(b.id)} />)
          : <div className="md-empty"><div className="md-emoji" aria-hidden>🔍</div><div className="mt-2 font-semibold">Nothing here</div><div className="md-sub mt-1">{q || lane || format ? `Try another search${format ? `, ${format === 'video' ? 'Design' : 'Video'}` : ''} or lane.` : 'Briefs show up here as soon as Medium writes them.'}</div></div>}
      </div>
    </div>
  );
}

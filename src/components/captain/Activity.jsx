import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, RefreshCw, Loader2, X } from 'lucide-react';
import { captainApi } from '../../lib/captainService';
import { relTime, statusMeta, TRIGGERS, money, discIcon } from './util';
import CheckDrawer from './CheckDrawer';

const STATUS_FILTERS = [['', 'All'], ['issues', 'Issues'], ['passed', 'Passed'], ['error', 'Errors'], ['skipped', 'Skipped']];
const DISC_FILTERS = [['', 'All'], ['video', '🎬 Video'], ['design', '🎨 Design'], ['brief', '📝 Brief']];

/** The home screen: every check, skip and error — searchable ("recieve" finds every place it was caught). */
export default function Activity({ notify }) {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') || '';
  const status = params.get('status') || '';
  const discipline = params.get('discipline') || '';
  const open = params.get('check');
  const [draft, setDraft] = useState(q);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef(null);

  const setParam = useCallback((key, value) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: key === 'q' });
  }, [params, setParams]);

  const [waiting, setWaiting] = useState(0);
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const [list, jobs] = await Promise.all([captainApi.checks({ q, status, discipline, limit: 100 }), captainApi.jobs().catch(() => ({ jobs: [] }))]);
      setData(list);
      setWaiting((jobs.jobs || []).filter(j => j.status === 'queued' || j.status === 'running').length);
    } catch (e) { notify(e.message, true); } finally { setLoading(false); }
  }, [q, status, discipline, notify]);
  useEffect(() => { load(); }, [load]);

  // Instant search (debounced) — kept in the URL so a view can be shared
  useEffect(() => {
    clearTimeout(timer.current);
    if (draft === q) return undefined;
    timer.current = setTimeout(() => setParam('q', draft.trim()), 250);
    return () => clearTimeout(timer.current);
  }, [draft, q, setParam]);

  // While something is being checked, refresh every few seconds
  const busy = useMemo(() => waiting > 0 || (data?.checks || []).some(c => c.status === 'running' || c.status === 'queued'), [data, waiting]);
  useEffect(() => { if (!busy) return undefined; const t = setInterval(() => load(true), 5000); return () => clearInterval(t); }, [busy, load]);

  const checks = data?.checks || [];
  const chips = [q && ['q', `“${q}”`], status && ['status', STATUS_FILTERS.find(s => s[0] === status)?.[1]], discipline && ['discipline', DISC_FILTERS.find(s => s[0] === discipline)?.[1]]].filter(Boolean);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-[520px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 trk-muted" />
          <input className="trk-input !pl-9" placeholder="Search items, campaigns, people, or a typo (e.g. custumer)…" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Search checks" />
        </div>
        <div className="trk-seg">{DISC_FILTERS.map(([k, l]) => <button key={k || 'all'} type="button" className={discipline === k ? 'on' : ''} onClick={() => setParam('discipline', k)}>{l}</button>)}</div>
        <div className="trk-seg">{STATUS_FILTERS.map(([k, l]) => <button key={k || 'all'} type="button" className={status === k ? 'on' : ''} onClick={() => setParam('status', k)}>{l}</button>)}</div>
        <button type="button" className="trk-btn !py-1.5 ml-auto" onClick={() => load()} disabled={loading}>{loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Refresh</button>
      </div>
      {chips.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {chips.map(([k, l]) => (
            <button key={k} type="button" className="trk-chip" onClick={() => { if (k === 'q') setDraft(''); setParam(k, ''); }}>{l} <X size={11} /></button>
          ))}
        </div>
      )}

      {waiting > 0 && (
        <div className="mt-4 trk-glass px-4 py-3 text-sm flex items-center gap-2">
          <Loader2 size={14} className="animate-spin" /> The Captain is working on {waiting} job{waiting === 1 ? '' : 's'} — this list updates by itself.
        </div>
      )}

      <div className="mt-4 trk-glass p-2">
        {!data && <div className="p-8 text-center trk-muted text-sm"><Loader2 size={16} className="inline animate-spin mr-2" />Loading…</div>}
        {data && !checks.length && (
          <div className="p-10 text-center">
            <div className="text-4xl">🧑‍✈️</div>
            <div className="mt-2 font-semibold">{q || status || discipline ? 'Nothing matches these filters' : 'No checks yet'}</div>
            <div className="text-sm trk-muted mt-1">{q || status || discipline ? 'Try clearing a filter.' : 'Paste a Frame.io link or brief text in “Check a link” to run the first one.'}</div>
          </div>
        )}
        {checks.map(c => <Row key={c.id} c={c} onOpen={() => setParam('check', c.id)} />)}
        {data && data.total > checks.length && <div className="p-3 text-center text-xs trk-muted">Showing the latest {checks.length} of {data.total}</div>}
      </div>

      {open && <CheckDrawer id={open} notify={notify} onClose={() => setParam('check', '')} onChanged={() => load(true)} />}
    </div>
  );
}

function Row({ c, onOpen }) {
  const s = statusMeta(c);
  const title = c.item_name || c.asset?.name || 'Untitled';
  return (
    <button type="button" className="cc-row" onClick={onOpen}>
      <div className="cc-thumb">{c.thumb_url ? <img src={c.thumb_url} alt="" className="w-full h-full object-cover" loading="lazy" /> : discIcon(c.discipline)}</div>
      <div className="min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span aria-hidden>{discIcon(c.discipline)}</span>
          <span className="font-semibold truncate">{title}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] trk-muted">
          {c.discipline === 'brief' && c.asset?.lane && <span>{c.asset.lane}</span>}
          {c.deliverable && <span>{c.discipline === 'brief' && c.asset?.lane ? '· ' : ''}{c.deliverable}{c.round ? ` · round ${c.round}` : ''}</span>}
          {c.person && <span>· {c.person}</span>}
          {c.product && <span>· {c.product}</span>}
          {c.trigger && <span>· {TRIGGERS[c.trigger] || c.trigger}</span>}
          {c.status === 'skipped' && c.skip_reason && <span>· {c.skip_reason}</span>}
          {c.status === 'error' && c.error && <span className="truncate max-w-[420px]" style={{ color: 'var(--trk-red)' }}>· {c.error}</span>}
        </div>
        {c.top_issues?.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {c.top_issues.slice(0, 3).map(i => (
              <span key={i.idx} className={`trk-chip ${i.severity === 'check' ? 'amber' : i.severity === 'info' ? 'gray' : 'red'}`} style={{ maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                <span className="cc-strike">{String(i.found || '').slice(0, 28)}</span>{i.fix ? <>→ {String(i.fix).slice(0, 28)}</> : null}
              </span>
            ))}
            {c.issue_count > 3 && <span className="trk-chip gray">+{c.issue_count - 3}</span>}
          </div>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 text-right">
        <span className={`trk-chip ${s.tone}`}>{s.icon} {s.label}</span>
        <span className="text-[11px] trk-dim" title={new Date(c.created_at).toLocaleString()}>
          {relTime(c.created_at)}{c.duration_ms ? ` · ${Math.round(c.duration_ms / 1000)}s` : ''}{c.cost_usd != null ? ` · ${money(Number(c.cost_usd))}` : ''}
        </span>
      </div>
    </button>
  );
}

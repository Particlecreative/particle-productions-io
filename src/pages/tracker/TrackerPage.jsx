import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  LayoutGrid, GanttChart, List, Search, RefreshCw, Loader2, AlertTriangle, Lock, HelpCircle, Check, X, Undo2,
  ChevronDown, ChevronUp, ExternalLink,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import { useNotifications } from '../../context/NotificationsContext';
import { trackerApi } from '../../lib/trackerService';
import Board from '../../components/tracker/Board';
import Timeline from '../../components/tracker/Timeline';
import Drawer from '../../components/tracker/Drawer';
import {
  stageList, stageColor, isDone, todayIL, daysUntil, countdown, TONE, shortDate, relTime, money, CountUp, StageDot,
  HealthDot, FaceStack, TicketDots, Signal, BudgetBar,
} from '../../components/tracker/parts';
import { nextMilestone } from '../../components/tracker/Board';
import '../../components/tracker/tracker.css';

const VIEWS = [['board', 'Board', LayoutGrid], ['timeline', 'Timeline', GanttChart], ['list', 'List', List]];
const PREF = 'cp_tracker_view_v1';
const LEVEL = { red: 0, amber: 1, gray: 2 };
const readPrefs = () => { try { return JSON.parse(localStorage.getItem(PREF) || '{}'); } catch { return {}; } };

/** The tracker's own team entries replace the old ones; what the CP / Monday add stays. */
function withTeam(p, team) {
  const keep = (list) => list.filter(m => m.source !== 'tracker');
  const mine = (kind) => team.filter(m => m.kind === kind).map(m => ({ ...m, source: 'tracker' }));
  return { ...p, team: { internal: [...mine('internal'), ...keep(p.team?.internal || [])], external: [...mine('external'), ...keep(p.team?.external || [])] } };
}

export default function TrackerPage() {
  const { isEditor, isAdmin, user } = useAuth();
  const { brandId, brand } = useBrand();
  const { addNotification } = useNotifications();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  const prefs = useMemo(readPrefs, []);
  const [view, setViewState] = useState(prefs.view || 'board');
  const [showDone, setShowDone] = useState(!!prefs.showDone);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState(null);
  const [type, setType] = useState('');
  const [attentionOnly, setAttentionOnly] = useState(false);
  const [askOpen, setAskOpen] = useState(true);
  const [allAttention, setAllAttention] = useState(false);
  const loadedAt = useRef(0);
  const today = data?.today || todayIL();

  const setView = (v) => { setViewState(v); try { localStorage.setItem(PREF, JSON.stringify({ ...readPrefs(), view: v })); } catch { /* ignore */ } };
  const toggleDone = () => setShowDone(v => { try { localStorage.setItem(PREF, JSON.stringify({ ...readPrefs(), showDone: !v })); } catch { /* ignore */ } return !v; });

  // quiet = no spinner (auto-refresh); after a write the refresh still reports a failure, so stale data never looks saved
  const load = useCallback(async (force = false, quiet = false, afterWrite = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try { setData(await trackerApi.get(brandId, { force })); loadedAt.current = Date.now(); } catch (e) {
      if (!quiet) setError(e.message);
      else if (afterWrite) setToast({ text: `Saved — but the page couldn’t refresh (${e.message}). Reload to see the latest.`, error: true });
    } finally { setLoading(false); }
  }, [brandId]);
  useEffect(() => { if (isEditor) { setData(null); load(); } }, [load, isEditor]);
  useEffect(() => {
    if (!isEditor) return undefined;
    const tick = () => { if (document.visibilityState === 'visible' && loadedAt.current && Date.now() - loadedAt.current > 5 * 60 * 1000) load(false, true); };
    const t = setInterval(tick, 60 * 1000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [load, isEditor]);
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), toast.undo ? 7000 : 4000); return () => clearTimeout(t); }, [toast]);

  const patchProd = (id, fn) => setData(d => (d ? { ...d, productions: d.productions.map(p => (p.id === id ? fn(p) : p)) } : d));
  const openId = params.get('p');
  const open = data?.productions.find(p => p.id === openId) || null;
  const openProd = (p) => setParams(p ? { p: p.id } : {}, { replace: !!openId });
  const closeDrawer = useCallback(() => setParams({}, { replace: true }), [setParams]);

  // ── Writes ──
  const moveStage = useCallback(async (p, next, { undo = true } = {}) => {
    const prev = { stage: p.stage, stage_days: p.stage_days, stage_since: p.stage_since, stage_by: p.stage_by };
    patchProd(p.id, x => ({ ...x, stage: next, stage_days: 0, stage_since: new Date().toISOString(), stage_by: user?.name || null }));
    try {
      await trackerApi.setStage(p.id, next, user);
      addNotification('stage_change', `${user?.name || 'Someone'} changed stage of ${p.name} to "${next}"`, p.id);
      setToast({ text: `${p.name} → ${next}`, undo: undo ? () => moveStage({ ...p, stage: next }, prev.stage, { undo: false }) : null });
      load(false, true, true);
    } catch (e) {
      patchProd(p.id, x => ({ ...x, ...prev }));
      setToast({ text: e.message || 'Couldn’t change the stage', error: true });
    }
  }, [user, addNotification, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveTracker = useCallback(async (p, patch) => {
    const before = p;
    const empty = { deadline: null, deadline_label: '', notes: '', links: [], team: [], health: null };
    patchProd(p.id, x => {
      const tracker = { ...empty, ...(x.tracker || {}), ...patch, updated_by: user?.name || null, updated_at: new Date().toISOString() };
      return patch.team ? withTeam({ ...x, tracker }, patch.team) : { ...x, tracker };
    });
    try {
      await trackerApi.save(brandId, p.id, patch);
      load(false, true, true); // ids for new links / team, fresh signals
    } catch (e) {
      patchProd(p.id, () => before);
      throw e;
    }
  }, [brandId, user, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const linkTicket = useCallback(async (t, body) => {
    // Move it straight away; the server's answer follows
    setData(d => {
      if (!d) return d;
      const strip = (list) => (list || []).filter(x => x.id !== t.id);
      const target = body.production_id;
      const moved = { ...t, tv: { ...(t.tv || {}), production_id: target || null, source: target ? 'confirmed' : body.decision === 'none' ? 'none' : t.tv?.source, decided_by: user?.name } };
      return {
        ...d,
        ask: body.decision === 'clear' ? d.ask : strip(d.ask),
        productions: d.productions.map(p => ({ ...p, tickets: p.id === target ? [moved, ...strip(p.tickets)] : strip(p.tickets) })),
      };
    });
    try {
      await trackerApi.linkTicket(brandId, t.id, { ...body, board: t.board });
      const to = body.production_id && data?.productions.find(p => p.id === body.production_id);
      setToast({ text: to ? `Linked to ${to.name}` : body.decision === 'none' ? 'Marked as not a production ticket' : 'Back to automatic matching' });
      load(false, true, true);
    } catch (e) {
      setToast({ text: e.message, error: true });
      load(false, true);
    }
  }, [brandId, user, data, load]);

  /** Any Monday ticket, by its link or ID — e.g. one from another department that isn't named after the production */
  const linkById = useCallback(async (p, input) => {
    const m = String(input || '').match(/(?:pulses|items)\/(\d+)/) || String(input || '').trim().match(/^(\d{6,})$/);
    if (!m) { setToast({ text: 'Paste a Monday ticket link (…/pulses/123…) or its ID', error: true }); return false; }
    try {
      await trackerApi.linkTicket(brandId, m[1], { production_id: p.id });
      setToast({ text: `Linked to ${p.name} — fetching it from Monday…` });
      await load(false, true, true);
      return true;
    } catch (e) { setToast({ text: e.message, error: true }); return false; }
  }, [brandId, load]);

  // ── What's shown ──
  const stages = useMemo(() => stageList(), []);
  const all = data?.productions || [];
  const live = all.filter(p => !isDone(p.stage));
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter(p =>
      (showDone || !isDone(p.stage) || stage === p.stage) &&
      (!stage || p.stage === stage) &&
      (!type || p.production_type === type) &&
      (!attentionOnly || p.signals?.some(s => s.level !== 'gray')) &&
      (!needle || [p.id, p.name, p.producer, ...(p.product_type || []), p.tracker?.notes, p.tracker?.deadline_label, ...(p.team?.internal || []).map(m => m.name), ...(p.team?.external || []).map(m => m.name)]
        .filter(Boolean).some(v => String(v).toLowerCase().includes(needle))));
  }, [all, q, stage, type, attentionOnly, showDone]);
  const boardStages = stages.filter(s => (showDone || !isDone(s) || stage === s) && (!stage || s === stage));
  const types = [...new Set(all.map(p => p.production_type).filter(Boolean))];

  const kpi = useMemo(() => {
    const active = live.filter(p => p.stage !== 'Paused');
    const dueWeek = active.filter(p => { const n = daysUntil(p.tracker?.deadline, today); return n != null && n >= 0 && n <= 7; });
    const overdue = active.filter(p => p.tracker?.deadline && p.tracker.deadline < today);
    const shooting = active.filter(p => { const n = daysUntil(p.shoot?.next, today); return n != null && n <= 14; });
    const attention = live.filter(p => p.signals?.some(s => s.level !== 'gray'));
    const tickets = live.flatMap(p => p.tickets || []).filter(t => t.open);
    const planned = active.reduce((a, p) => a + (p.budget?.planned || 0), 0);
    const actual = active.reduce((a, p) => a + (p.budget?.actual || 0), 0);
    return { active, paused: live.length - active.length, dueWeek, overdue, shooting, attention, tickets, planned, actual };
  }, [live, today]);

  const attention = useMemo(() => live
    .filter(p => p.signals?.some(s => s.level !== 'gray'))
    .map(p => ({ p, s: [...p.signals].sort((a, b) => LEVEL[a.level] - LEVEL[b.level]) }))
    .sort((a, b) => (LEVEL[a.s[0].level] - LEVEL[b.s[0].level]) || (b.s.length - a.s.length)), [live]);

  if (!isEditor) {
    return (
      <div className="max-w-xl mx-auto mt-16 text-center p-10 rounded-3xl border border-gray-200 bg-white">
        <Lock className="mx-auto text-gray-400" />
        <h2 className="mt-3 text-xl font-bold text-gray-800">Editors only</h2>
        <p className="mt-1 text-gray-500 text-sm">The Production Tracker shows budgets and team, so it’s limited to Editors and Admins.</p>
      </div>
    );
  }

  const longDate = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });

  return (
    <div className="trk max-w-[2400px] mx-auto pb-16">
      <div className="trk-canvas p-5 sm:p-8 md:p-10">
        {/* Hero */}
        <div className="flex flex-wrap items-end gap-6">
          <div className="min-w-0">
            <div className="trk-eyebrow">Production Tracker · {brand?.name || brandId} · {longDate}</div>
            <h1 className="trk-title text-[46px] sm:text-[88px] md:text-[112px] mt-3 break-words">
              {kpi.active.length} live production{kpi.active.length === 1 ? '' : 's'}
            </h1>
            <div className="mt-3 text-[15px] trk-muted">
              {kpi.overdue.length ? <span style={{ color: '#ffb3c2' }}>{kpi.overdue.length} past deadline · </span> : null}
              {kpi.dueWeek.length} due this week · {kpi.shooting.length} shooting in the next two weeks{kpi.paused ? ` · ${kpi.paused} paused` : ''}
            </div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {data && <span className="text-[11px] trk-dim hidden sm:inline">Updated {relTime(data.generated_at)}</span>}
            <button type="button" className="trk-btn" onClick={() => load(true)} disabled={loading}>
              {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-6 px-4 py-3 rounded-2xl text-sm flex items-center gap-2" style={{ background: 'rgba(255,92,122,.12)', border: '1px solid rgba(255,92,122,.35)' }}>
            <AlertTriangle size={16} /> {error}
            <button type="button" onClick={() => load(true)} className="ml-auto font-semibold underline">Try again</button>
          </div>
        )}

        {!data ? (
          <div className="py-28 text-center trk-muted flex flex-col items-center gap-3">
            {!error && <><Loader2 className="animate-spin" /><span className="text-sm">Gathering productions, crew and Monday tickets…</span></>}
          </div>
        ) : (
          <>
            {/* KPIs */}
            <div className="mt-8 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <Kpi label="Needs attention" value={kpi.attention.length} tone={kpi.attention.length ? '#ffb547' : undefined} sub={attentionOnly ? 'Showing only these' : 'Click to filter'} active={attentionOnly} onClick={() => setAttentionOnly(v => !v)} />
              <Kpi label="Past deadline" value={kpi.overdue.length} tone={kpi.overdue.length ? '#ff5c7a' : undefined} sub={kpi.overdue.map(p => p.name).join(', ') || 'Nothing late'} onClick={() => kpi.overdue[0] && openProd(kpi.overdue[0])} />
              <Kpi label="Due in 7 days" value={kpi.dueWeek.length} sub={kpi.dueWeek.map(p => p.name).join(', ') || 'Clear week'} onClick={() => kpi.dueWeek[0] && openProd(kpi.dueWeek[0])} />
              <Kpi label="Shooting · 14 days" value={kpi.shooting.length} sub={kpi.shooting.map(p => `${p.name} ${shortDate(p.shoot.next)}`).join(', ') || 'No shoots booked'} onClick={() => kpi.shooting[0] && openProd(kpi.shooting[0])} />
              <Kpi label="Monday tickets open" value={kpi.tickets.length} sub={data.ask?.length ? `${data.ask.length} need a production` : 'All linked'} onClick={() => setAskOpen(true)} />
              <Kpi label="Budget used" value={kpi.planned ? `${Math.round((kpi.actual / kpi.planned) * 100)}%` : '—'} tone={kpi.planned && kpi.actual > kpi.planned ? '#ff5c7a' : undefined} sub={`${money(kpi.actual)} of ${money(kpi.planned)} · live`} />
            </div>

            {/* Pipeline */}
            <div className="mt-8">
              <div className="flex items-center gap-3 mb-3">
                <span className="trk-label">Pipeline</span>
                {stage && <button type="button" className="trk-chip gray hover:text-white" onClick={() => setStage(null)}><X size={11} /> {stage}</button>}
              </div>
              <div className="flex flex-wrap sm:flex-nowrap gap-1.5">
                {stages.map(s => {
                  const n = all.filter(p => p.stage === s).length;
                  const on = stage === s;
                  return (
                    <button key={s} type="button" onClick={() => setStage(on ? null : s)}
                      className="rounded-2xl px-3 py-2 text-left flex flex-col justify-between gap-1 min-w-[92px] h-[74px] transition-all"
                      style={{
                        flex: `${Math.max(1, isDone(s) ? Math.min(n, 2) : n)} 1 0`,
                        background: on ? stageColor(s) : `${stageColor(s)}26`,
                        boxShadow: `inset 0 0 0 1px ${stageColor(s)}${on ? '' : '66'}`,
                        color: on ? '#030b2e' : '#fff',
                        opacity: stage && !on ? 0.5 : 1,
                      }}>
                      <span className="text-[11px] font-bold uppercase tracking-[0.12em] truncate">{s}</span>
                      <span className="trk-title text-[32px]" style={{ color: 'inherit' }}>{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Needs attention */}
            {attention.length > 0 && (
              <div className="mt-8">
                <div className="flex items-center gap-3 mb-3">
                  <span className="trk-label">Needs attention · {attention.length}</span>
                  {attention.length > 4 && (
                    <button type="button" className="ml-auto text-[12px] font-semibold trk-muted hover:text-white flex items-center gap-1" onClick={() => setAllAttention(v => !v)}>
                      {allAttention ? <>Less <ChevronUp size={13} /></> : <>All {attention.length} <ChevronDown size={13} /></>}
                    </button>
                  )}
                </div>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                  {(allAttention ? attention : attention.slice(0, 4)).map(({ p, s }) => (
                    <button key={p.id} type="button" onClick={() => openProd(p)} className="trk-card p-4 flex gap-3"
                      style={{ borderColor: s[0].level === 'red' ? 'rgba(255,92,122,.45)' : 'rgba(255,181,71,.35)' }}>
                      <span className="w-1.5 rounded-full flex-none" style={{ background: s[0].level === 'red' ? '#ff5c7a' : '#ffb547' }} />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-[11px] trk-muted"><StageDot stage={p.stage} size={6} /> {p.stage} · {p.id}</span>
                        <span className="block trk-title text-[24px] mt-1 truncate">{p.name}</span>
                        <span className="mt-2 flex flex-wrap gap-1.5">{s.slice(0, 3).map(x => <Signal key={x.kind} s={x} />)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Monday tickets that need a production */}
            {data.monday && data.ask?.length > 0 && (
              <div className="mt-8 trk-glass p-4 md:p-5" style={{ borderColor: 'rgba(255,122,26,.35)' }}>
                <button type="button" className="w-full flex items-center gap-2 text-left" onClick={() => setAskOpen(v => !v)}>
                  <HelpCircle size={15} style={{ color: '#ff9d4d' }} />
                  <span className="trk-label" style={{ color: '#ffc98a' }}>Monday tickets that need a production · {data.ask.length}</span>
                  <span className="ml-auto trk-muted">{askOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</span>
                </button>
                {askOpen && (
                  <div className="mt-4 flex flex-col gap-2.5">
                    <div className="text-[12px] trk-muted -mt-1 mb-1">TV &amp; SP tickets I couldn’t match for sure. Pick the production — it’s saved in the CP, Monday isn’t changed.</div>
                    {data.ask.map(t => <AskRow key={t.id} t={t} data={data} onLink={linkTicket} />)}
                  </div>
                )}
              </div>
            )}

            {/* Toolbar */}
            <div className="mt-8 flex flex-wrap items-center gap-2">
              <div className="trk-seg">
                {VIEWS.map(([k, label, Icon]) => <button key={k} type="button" className={view === k ? 'on' : ''} onClick={() => setView(k)}><Icon size={13} /> {label}</button>)}
              </div>
              <div className="relative flex-1 min-w-[180px] max-w-[360px]">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 trk-dim" />
                <input className="trk-input !pl-9 !rounded-full" placeholder="Search productions, people, notes…" value={q} onChange={(e) => setQ(e.target.value)} />
              </div>
              {types.length > 1 && (
                <div className="trk-seg">
                  <button type="button" className={!type ? 'on' : ''} onClick={() => setType('')}>All</button>
                  {types.map(t => <button key={t} type="button" className={type === t ? 'on' : ''} onClick={() => setType(type === t ? '' : t)}>{t}</button>)}
                </div>
              )}
              <button type="button" className="trk-btn ml-auto" onClick={toggleDone}>{showDone ? <Check size={14} /> : null} Completed</button>
            </div>

            <div className={`mt-5 ${loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}`}>
              {view === 'board' && <Board stages={boardStages} productions={filtered} today={today} onOpen={openProd} onMove={moveStage} canEdit={isEditor} />}
              {view === 'timeline' && <Timeline productions={filtered} today={today} onOpen={openProd} />}
              {view === 'list' && <ListView productions={filtered} today={today} onOpen={openProd} />}
            </div>

            {data.warnings?.length > 0 && <div className="mt-6 text-[11px]" style={{ color: '#ffd699' }}>{data.warnings.join(' · ')}</div>}
          </>
        )}
      </div>

      {open && (
        <Drawer p={open} data={data} today={today} canEdit={isEditor} isAdmin={isAdmin}
          onClose={closeDrawer} onSave={saveTracker} onStage={moveStage} onTicket={linkTicket} onLinkById={linkById} />
      )}

      {toast && (
        <div className="trk fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] flex items-center gap-3 px-5 py-3 rounded-full text-sm shadow-2xl"
          style={{ background: toast.error ? '#5a1024' : '#0b1546', border: '1px solid rgba(232,236,255,.15)' }}>
          {toast.error ? <AlertTriangle size={15} /> : <Check size={15} style={{ color: '#2fd38a' }} />}
          <span>{toast.text}</span>
          {toast.undo && <button type="button" className="font-semibold flex items-center gap-1" style={{ color: '#aab0ff' }} onClick={() => { const u = toast.undo; setToast(null); u(); }}><Undo2 size={14} /> Undo</button>}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, sub, tone, onClick, active }) {
  return (
    <button type="button" onClick={onClick} className="trk-glass p-4 md:p-5 text-left transition-colors hover:bg-white/[.07]"
      style={active ? { borderColor: 'rgba(140,147,255,.7)', background: 'rgba(74,85,255,.14)' } : undefined}>
      <div className="trk-label">{label}</div>
      <div className="trk-title text-[48px] md:text-[64px] mt-1" style={tone ? { color: tone } : undefined}>{typeof value === 'number' ? <CountUp value={value} /> : value}</div>
      {sub && <div className="text-[12px] trk-muted mt-1 truncate">{sub}</div>}
    </button>
  );
}

function AskRow({ t, data, onLink }) {
  const [busy, setBusy] = useState(false);
  const run = async (body) => { setBusy(true); try { await onLink(t, body); } finally { setBusy(false); } };
  const sugg = t.tv?.suggestions || [];
  const options = data.productions.filter(p => !isDone(p.stage));
  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-2.5 rounded-2xl px-3.5 py-3" style={{ background: 'rgba(255,122,26,.07)', border: '1px solid rgba(255,122,26,.2)' }}>
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <span className="w-2 h-8 rounded-full flex-none" style={{ background: t.status?.color || '#c4c4c4' }} />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold truncate" title={t.name}>{t.name}</div>
          <div className="text-[11px] trk-muted">{t.status?.label}{t.timeline?.to ? ` · ${shortDate(t.timeline.from)} → ${shortDate(t.timeline.to)}` : ''}</div>
        </div>
        <FaceStack list={t.people.map(id => data.people[id]).filter(Boolean)} size={22} />
        {t.monday_url && <a href={t.monday_url} target="_blank" rel="noopener noreferrer" className="trk-muted hover:text-white" title="Open on Monday"><ExternalLink size={13} /></a>}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {sugg.slice(0, 3).map(s => (
          <button key={s.id} type="button" disabled={busy} onClick={() => run({ production_id: s.id })} title={s.why} className="trk-btn !py-1.5 !text-[12px]">
            <Check size={12} /> {s.name}
          </button>
        ))}
        <select className="trk-input !w-auto !py-1.5 !rounded-full !text-[12px] max-w-[220px]" value="" disabled={busy} onChange={(e) => e.target.value && run({ production_id: e.target.value })}>
          <option value="">{sugg.length ? 'Another…' : 'Pick a production…'}</option>
          {options.map(p => <option key={p.id} value={p.id}>{p.id} · {p.name}</option>)}
        </select>
        <button type="button" disabled={busy} onClick={() => run({ decision: 'none' })} className="text-[12px] font-semibold trk-muted hover:text-white px-2">Not a production</button>
      </div>
    </div>
  );
}

function ListView({ productions, today, onOpen }) {
  const rows = [...productions].sort((a, b) => {
    const da = a.tracker?.deadline || '9999';
    const db = b.tracker?.deadline || '9999';
    return da.localeCompare(db) || a.id.localeCompare(b.id);
  });
  if (!rows.length) return <div className="py-16 text-center trk-muted text-sm">No productions match.</div>;
  return (
    <div className="trk-glass overflow-x-auto trk-scroll">
      <table className="w-full min-w-[1100px] text-[13px]">
        <thead>
          <tr className="text-left trk-label">
            {['Production', 'Stage', 'Our deadline', 'Next', 'Team', 'Monday', 'Budget', 'Flags'].map(h => <th key={h} className="px-4 py-3 font-bold">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map(p => {
            const cd = countdown(p.tracker?.deadline, today);
            const ms = nextMilestone(p, today);
            return (
              <tr key={p.id} onClick={() => onOpen(p)} className="cursor-pointer hover:bg-white/[.04]" style={{ borderTop: '1px solid var(--trk-line)' }}>
                <td className="px-4 py-3 min-w-[240px]">
                  <div className="flex items-center gap-2"><HealthDot health={p.tracker?.health} /><span className="font-semibold">{p.name}</span></div>
                  <div className="text-[11px] trk-muted">{p.id}{p.production_type ? ` · ${p.production_type}` : ''}</div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap"><span className="flex items-center gap-2"><StageDot stage={p.stage} />{p.stage}</span>{p.stage_days != null && <span className="text-[11px] trk-dim">{p.stage_days}d</span>}</td>
                <td className="px-4 py-3">
                  {cd ? <><span className="font-bold" style={{ color: TONE[cd.tone] }}>{cd.text}</span><div className="text-[11px] trk-muted truncate max-w-[200px]">{p.tracker.deadline_label || shortDate(p.tracker.deadline)}</div></> : <span className="trk-dim">—</span>}
                </td>
                <td className="px-4 py-3 text-[12px] trk-muted max-w-[220px] truncate">{ms?.text || '—'}</td>
                <td className="px-4 py-3"><span className="flex items-center gap-2"><FaceStack list={p.team?.internal} tone="internal" max={3} size={22} /><FaceStack list={p.team?.external} tone="external" max={2} size={22} /></span></td>
                <td className="px-4 py-3 whitespace-nowrap">{p.tickets?.length ? <TicketDots tickets={p.tickets} max={6} /> : <span className="trk-dim">—</span>}</td>
                <td className="px-4 py-3 min-w-[130px]"><BudgetBar budget={p.budget} compact />{(p.budget?.planned || p.budget?.actual) ? <div className="text-[11px] trk-muted mt-1">{money(p.budget.actual)} / {money(p.budget.planned)}</div> : null}</td>
                <td className="px-4 py-3"><span className="flex flex-wrap gap-1">{(p.signals || []).filter(s => s.level !== 'gray').slice(0, 2).map(s => <Signal key={s.kind} s={s} />)}</span></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

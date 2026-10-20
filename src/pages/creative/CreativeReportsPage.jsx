import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnimatePresence, LazyMotion, domMax, m } from 'motion/react';
import {
  Sparkles, Play, ArrowRight, Calendar, CheckCircle2, Loader2, AlertTriangle, Film, PenTool, Users,
  Link2, Plug, ChevronDown, X, Lock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import { creativeApi, LIVE } from '../../lib/creativeReportService';
import { addDays, sundayOf, weekLabelOf, relTime } from '../../components/creative/deck/format';

const NAVY = '#030b2e';
const ELECTRIC = '#0808f8';

export function ParticleOnlyGate({ children }) {
  const { brandId, switchBrand } = useBrand();
  if (brandId === 'particle') return children;
  return (
    <div className="max-w-xl mx-auto mt-16 text-center p-10 rounded-3xl" style={{ background: NAVY, color: '#e8ecff' }}>
      <div className="text-xs font-bold tracking-[0.2em] uppercase" style={{ color: '#8c93ff' }}>Creative Weekly</div>
      <h2 className="mt-3 text-3xl font-black" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', textTransform: 'uppercase' }}>Particle only</h2>
      <p className="mt-2 opacity-70">The studio deck reads Particle’s Creative Studio boards on Monday.</p>
      <button type="button" onClick={() => switchBrand('particle')} className="mt-6 px-5 py-2.5 rounded-full font-semibold text-white" style={{ background: ELECTRIC }}>
        Switch to Particle
      </button>
    </div>
  );
}

export function EditorsOnly({ children }) {
  const { isEditor } = useAuth();
  if (isEditor) return children;
  return (
    <div className="max-w-xl mx-auto mt-16 text-center p-10 rounded-3xl border border-gray-200 bg-white">
      <Lock className="mx-auto text-gray-400" />
      <h2 className="mt-3 text-xl font-bold text-gray-800">Editors only</h2>
      <p className="mt-1 text-gray-500 text-sm">Creative Weekly includes per-person performance data, so it’s limited to Editors and Admins.</p>
    </div>
  );
}

const STEPS = [
  { key: 'monday', label: 'Reading the Monday boards', icon: Calendar },
  { key: 'people', label: 'Matching editors & designers', icon: Users },
  { key: 'deliveries', label: 'Counting what shipped', icon: CheckCircle2 },
  { key: 'cp', label: 'Importing the CP weekly', icon: Link2 },
  { key: 'claude', label: 'Writing the executive summary', icon: Sparkles },
  { key: 'slides', label: 'Building your slides', icon: Play },
];

function GenerateOverlay({ state }) {
  if (!state) return null;
  const { step, error, totals, people, claude } = state;
  return (
    <LazyMotion features={domMax} strict>
      <AnimatePresence>
        <m.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center p-6"
          style={{ background: `radial-gradient(900px 600px at 80% 0%, rgba(8,8,248,.45), transparent 60%), ${NAVY}` }}>
          <div className="w-full max-w-lg" style={{ color: '#e8ecff' }}>
            <div className="text-xs font-bold tracking-[0.22em] uppercase" style={{ color: '#8c93ff' }}>Creative Weekly</div>
            <div className="mt-2 text-5xl font-black leading-none" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', textTransform: 'uppercase', color: '#fff' }}>
              {error ? 'Something went wrong' : 'Building your deck'}
            </div>
            <div className="mt-8 flex flex-col gap-3">
              {STEPS.filter(s => s.key !== 'claude' || claude).map((s, i) => {
                const idx = STEPS.findIndex(x => x.key === s.key);
                const done = !error && step > idx;
                const active = !error && step === idx;
                const Icon = s.icon;
                return (
                  <m.div key={s.key} initial={{ opacity: 0, x: -12 }} animate={{ opacity: done || active ? 1 : 0.4, x: 0 }} transition={{ delay: i * 0.05 }}
                    className="flex items-center gap-3 text-lg">
                    <span className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: done ? 'rgba(0,200,117,.18)' : active ? 'rgba(74,85,255,.25)' : 'rgba(255,255,255,.06)' }}>
                      {done ? <CheckCircle2 size={18} color="#00c875" /> : active ? <Loader2 size={18} className="animate-spin" color="#8c93ff" /> : <Icon size={16} />}
                    </span>
                    <span>{s.label}</span>
                    {s.key === 'deliveries' && done && totals && (
                      <span className="ml-auto text-sm" style={{ color: '#8c93ff' }}>{totals.video} videos · {totals.design} designs</span>
                    )}
                    {s.key === 'people' && done && people != null && <span className="ml-auto text-sm" style={{ color: '#8c93ff' }}>{people} creatives</span>}
                  </m.div>
                );
              })}
            </div>
            {error && (
              <div className="mt-8 p-4 rounded-2xl text-sm" style={{ background: 'rgba(226,68,92,.15)', border: '1px solid rgba(226,68,92,.4)' }}>
                <div className="flex items-center gap-2 font-semibold"><AlertTriangle size={16} /> {error}</div>
                <button type="button" onClick={state.onClose} className="mt-3 px-4 py-2 rounded-full bg-white/10 hover:bg-white/20">Close</button>
              </div>
            )}
          </div>
        </m.div>
      </AnimatePresence>
    </LazyMotion>
  );
}

function IntegrationsModal({ open, onClose, data, reload, isAdmin }) {
  if (!open) return null;
  const Row = ({ ok, warn, title, detail, action }) => (
    <div className="flex items-start gap-3 py-3 border-b border-gray-100 last:border-0">
      <span className={`mt-1 w-2.5 h-2.5 rounded-full ${ok ? 'bg-emerald-500' : warn ? 'bg-amber-400' : 'bg-gray-300'}`} />
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-800 text-sm">{title}</div>
        {detail && <div className="text-xs text-gray-500 mt-0.5 break-words">{detail}</div>}
      </div>
      {action}
    </div>
  );
  const fio = data?.frameio;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 560, width: '94vw' }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>Data sources</h2>
          <button type="button" onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>
        {!data ? <div className="py-8 text-center text-gray-400"><Loader2 className="animate-spin inline" /></div> : (
          <>
            <Row ok={data.monday?.ok} title="Monday.com — Video Projects & Design Projects 2.0"
              detail={data.monday?.ok ? (data.monday.warnings?.length ? data.monday.warnings.join(' · ') : 'Connected. Deliveries are read from status history.') : data.monday?.error} />
            <Row ok={data.dropbox?.connected && data.dropbox?.can_list_shared !== false} warn={data.dropbox?.connected}
              title="Dropbox — finished files & thumbnails"
              detail={data.dropbox?.error || (data.dropbox?.connected ? 'Connected (via Settings → Integrations).' : 'Not connected.')} />
            <Row ok={fio?.connected && !fio?.error} warn={fio?.connected && fio?.error}
              title="Frame.io — review links, thumbnails & latest cuts"
              detail={!fio?.configured ? 'Needs FRAMEIO_CLIENT_ID / SECRET / REDIRECT_URI on the server (Adobe Developer Console → OAuth Web App).'
                : fio?.connected ? `${fio.account_name ? `Account: ${fio.account_name}. ` : ''}${fio.error ? `${fio.error}${fio.hint ? ` — ${fio.hint}` : ''}` : 'Connected.'}` : 'Not connected yet.'}
              action={isAdmin && fio?.configured ? (
                fio.connected
                  ? <button type="button" className="text-xs text-gray-500 hover:text-red-600" onClick={async () => { await creativeApi.frameioDisconnect(); reload(); }}>Disconnect</button>
                  : <button type="button" className="text-xs px-3 py-1.5 rounded-full text-white font-semibold" style={{ background: ELECTRIC }} onClick={async () => { const { url } = await creativeApi.frameioConnect(); window.location.href = url; }}>Connect</button>
              ) : null} />
            <Row ok={data.anthropic?.configured} title="Claude — executive summary & per-person lines"
              detail={data.anthropic?.configured ? 'Ready.' : 'ANTHROPIC_API_KEY not set — summaries fall back to auto-written bullets.'} />
          </>
        )}
      </div>
    </div>
  );
}

function WeekCard({ r, onOpen, onPresent }) {
  const t = r.totals || {};
  return (
    <m.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="group relative rounded-3xl overflow-hidden cursor-pointer" onClick={onOpen}
      style={{ background: `radial-gradient(420px 260px at 90% -10%, rgba(8,8,248,.55), transparent 60%), ${NAVY}`, color: '#e8ecff', minHeight: 196 }}>
      <div className="p-6 flex flex-col h-full gap-3">
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.18em] uppercase" style={{ color: '#8c93ff' }}>
          Week {r.week_number ?? ''}
          <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] tracking-wider ${r.status === 'final' ? 'bg-emerald-400/20 text-emerald-300' : 'bg-white/10 text-white/70'}`}>{r.status === 'final' ? 'Final' : 'Draft'}</span>
          {r.shared && <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/10 text-white/70">Shared</span>}
        </div>
        <div className="text-3xl font-black leading-none" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', textTransform: 'uppercase', color: '#fff' }}>{r.week_label || weekLabelOf(r.week_start)}</div>
        <div className="flex gap-5 mt-auto text-sm">
          <span className="flex items-center gap-1.5"><Film size={14} className="opacity-60" /><b className="text-white">{t.video ?? 0}</b> videos</span>
          <span className="flex items-center gap-1.5"><PenTool size={14} className="opacity-60" /><b className="text-white">{t.design ?? 0}</b> designs</span>
        </div>
        <div className="text-[11px] opacity-50">Edited {relTime(r.updated_at)}</div>
      </div>
      <button type="button" onClick={(e) => { e.stopPropagation(); onPresent(); }}
        className="absolute bottom-5 right-5 w-11 h-11 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ background: ELECTRIC }} title="Present">
        <Play size={18} fill="#fff" color="#fff" />
      </button>
    </m.div>
  );
}

export default function CreativeReportsPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [gen, setGen] = useState(null);
  const [integrations, setIntegrations] = useState(null);
  const [showIntegrations, setShowIntegrations] = useState(false);
  const [pickWeek, setPickWeek] = useState('');
  const [notice, setNotice] = useState(null);

  const load = useCallback(async () => {
    try { setData(await creativeApi.list()); } catch (e) { setError(e.message); }
  }, []);
  const loadIntegrations = useCallback(async () => {
    try { setIntegrations(await creativeApi.integrations()); } catch { setIntegrations({}); }
  }, []);
  useEffect(() => { load(); loadIntegrations(); }, [load, loadIntegrations]);

  // Frame.io OAuth callback lands here (?frameio=connected|error)
  useEffect(() => {
    const f = params.get('frameio');
    if (!f) return;
    setNotice(f === 'connected' ? { ok: true, text: 'Frame.io connected — thumbnails and latest cuts will appear in the deck.' } : { ok: false, text: `Frame.io: ${params.get('msg') || 'connection failed'}` });
    setShowIntegrations(true);
    params.delete('frameio'); params.delete('msg');
    setParams(params, { replace: true });
  }, [params, setParams]);

  const thisWeek = data?.current_week || sundayOf();
  const reports = data?.reports || [];
  const current = reports.find(r => r.week_start === thisWeek);
  const past = reports.filter(r => r.week_start !== thisWeek);
  const missingWeeks = useMemo(() => {
    const have = new Set(reports.map(r => r.week_start));
    return Array.from({ length: 10 }, (_, i) => addDays(thisWeek, -7 * i)).filter(w => !have.has(w));
  }, [reports, thisWeek]);

  async function generate(weekStart) {
    const claude = !!integrations?.anthropic?.configured || !LIVE;
    let step = 0;
    setGen({ step: 0, claude });
    const tick = setInterval(() => { step = Math.min(step + 1, 3); setGen(g => (g && !g.error && g.step < 3 ? { ...g, step } : g)); }, 1300);
    try {
      let res;
      try { res = await creativeApi.generate(weekStart); } catch (e) {
        if (e.status === 409 && e.data?.id) { clearInterval(tick); setGen(null); navigate(`/creative-reports/${e.data.id}`); return; }
        throw e;
      }
      clearInterval(tick);
      const t = res.report.snapshot?.metrics?.totals;
      setGen({ step: 4, claude, totals: t, people: t?.people });
      if (claude) {
        try { await creativeApi.narrative(res.report.id); } catch { /* deck still works with auto-bullets */ }
      }
      setGen({ step: 5, claude, totals: t, people: t?.people });
      await new Promise(r => setTimeout(r, 450));
      setGen({ step: 6, claude, totals: t, people: t?.people });
      navigate(`/creative-reports/${res.report.id}`, { state: { justGenerated: true } });
    } catch (e) {
      clearInterval(tick);
      setGen({ step: 0, error: e.message || 'Generation failed', onClose: () => setGen(null) });
    }
  }

  return (
    <ParticleOnlyGate>
      <EditorsOnly>
        <LazyMotion features={domMax} strict>
          <div className="max-w-6xl mx-auto">
            <div className="flex flex-wrap items-end gap-4 mb-6">
              <div>
                <h1 className="brand-title text-4xl" style={{ color: 'var(--brand-primary)' }}>Creative Weekly</h1>
                <p className="text-sm text-gray-500 mt-1">The studio’s week as a live deck for Guy & Ayal — Monday, Dropbox, Frame.io and the CP weekly in one place.</p>
              </div>
              <button type="button" onClick={() => setShowIntegrations(true)} className="ml-auto flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-full border border-gray-200 bg-white hover:border-gray-300">
                <Plug size={13} /> Data sources
                {integrations && ['monday', 'dropbox', 'frameio'].map(k => {
                  const ok = k === 'monday' ? integrations.monday?.ok : k === 'dropbox' ? integrations.dropbox?.connected : integrations.frameio?.connected;
                  return <span key={k} className={`w-2 h-2 rounded-full ${ok ? 'bg-emerald-500' : 'bg-gray-300'}`} title={k} />;
                })}
              </button>
            </div>

            {notice && (
              <div className={`mb-4 px-4 py-3 rounded-2xl text-sm flex items-center gap-2 ${notice.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
                {notice.ok ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />} {notice.text}
                <button type="button" className="ml-auto opacity-60" onClick={() => setNotice(null)}><X size={14} /></button>
              </div>
            )}
            {error && <div className="mb-4 px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm">{error}</div>}

            {/* This week */}
            <div className="relative rounded-[32px] overflow-hidden mb-10" style={{ background: `radial-gradient(900px 520px at 85% -20%, rgba(8,8,248,.7), transparent 60%), radial-gradient(600px 400px at -10% 120%, rgba(8,8,248,.3), transparent 60%), ${NAVY}`, color: '#e8ecff' }}>
              <div className="p-8 md:p-12 flex flex-col md:flex-row gap-8 md:items-end">
                <div className="flex-1">
                  <div className="text-xs font-bold tracking-[0.22em] uppercase" style={{ color: '#8c93ff' }}>This week</div>
                  <div className="mt-3 text-6xl md:text-7xl font-black leading-[0.85]" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', textTransform: 'uppercase', color: '#fff' }}>
                    {weekLabelOf(thisWeek)}
                  </div>
                  {current ? (
                    <div className="mt-5 flex flex-wrap gap-6 text-base">
                      <span><b className="text-white text-2xl">{current.totals?.video ?? 0}</b> videos</span>
                      <span><b className="text-white text-2xl">{current.totals?.design ?? 0}</b> designs</span>
                      <span><b className="text-white text-2xl">{current.totals?.in_progress ?? 0}</b> in the pipeline</span>
                    </div>
                  ) : (
                    <p className="mt-4 max-w-lg opacity-75">Pulls deliveries from Monday’s status history, thumbnails from Dropbox & Frame.io, and the productions + updates from this week’s CP weekly — then builds the deck.</p>
                  )}
                </div>
                <div className="flex gap-3">
                  {current ? (
                    <>
                      <button type="button" onClick={() => navigate(`/creative-reports/${current.id}`)} className="px-6 py-3.5 rounded-full font-semibold bg-white/10 hover:bg-white/20 flex items-center gap-2">
                        Open <ArrowRight size={16} />
                      </button>
                      <button type="button" onClick={() => navigate(`/creative-reports/${current.id}/present`)} className="px-6 py-3.5 rounded-full font-semibold text-white flex items-center gap-2" style={{ background: ELECTRIC, boxShadow: '0 12px 40px -8px rgba(8,8,248,.9)' }}>
                        <Play size={16} fill="#fff" /> Present
                      </button>
                    </>
                  ) : (
                    <button type="button" disabled={!data} onClick={() => generate(thisWeek)}
                      className="px-7 py-4 rounded-full font-bold text-white flex items-center gap-2 text-lg disabled:opacity-50"
                      style={{ background: ELECTRIC, boxShadow: '0 14px 48px -8px rgba(8,8,248,.95)' }}>
                      <Sparkles size={20} /> Generate this week’s deck
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Past weeks */}
            <div className="flex items-center gap-3 mb-4">
              <h2 className="text-sm font-bold uppercase tracking-wider text-gray-500">Past weeks</h2>
              <div className="ml-auto flex items-center gap-2">
                <div className="relative">
                  <select value={pickWeek} onChange={e => setPickWeek(e.target.value)} className="appearance-none text-sm pl-3 pr-8 py-2 rounded-full border border-gray-200 bg-white">
                    <option value="">Generate another week…</option>
                    {missingWeeks.filter(w => w !== thisWeek).map(w => <option key={w} value={w}>{weekLabelOf(w)}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
                <button type="button" disabled={!pickWeek} onClick={() => generate(pickWeek)} className="text-sm px-4 py-2 rounded-full text-white font-semibold disabled:opacity-40" style={{ background: NAVY }}>Generate</button>
              </div>
            </div>
            {!data ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {[0, 1, 2].map(i => <div key={i} className="h-48 rounded-3xl bg-gray-100 animate-pulse" />)}
              </div>
            ) : past.length ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {past.map(r => <WeekCard key={r.id} r={r} onOpen={() => navigate(`/creative-reports/${r.id}`)} onPresent={() => navigate(`/creative-reports/${r.id}/present`)} />)}
              </div>
            ) : (
              <div className="text-sm text-gray-400 py-10 text-center border border-dashed border-gray-200 rounded-3xl">No past decks yet — generate an earlier week to compare.</div>
            )}
          </div>
          <GenerateOverlay state={gen} />
          <IntegrationsModal open={showIntegrations} onClose={() => setShowIntegrations(false)} data={integrations} reload={loadIntegrations} isAdmin={isAdmin} />
        </LazyMotion>
      </EditorsOnly>
    </ParticleOnlyGate>
  );
}

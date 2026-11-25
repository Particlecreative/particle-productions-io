// On Air (17 Nov 2026; redesigned 18 Nov for creative people — see the result, then the numbers): what's running right
// now. TV from Particle Brain (hourly: totals, every creative / station / daypart, site visits and store orders from TV)
// and the media agency's daily reports (read from Gmail at 17:00: the agency's note, the booked plan, the creatives we
// sent), matched to the TV Library by creative code;
// Meta from AfterLife (live creatives, who made them, how they do against our own 2026 average). Day / Week / Month
// everywhere. Click a Meta ad to watch it and read it like AfterLife shows it. The growth team sees TV only.
import { Suspense, lazy, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Tv, Smartphone, RefreshCw, Loader2, AlertTriangle, Mail, ExternalLink, Play, ArrowUpRight, ArrowDownRight, Sparkles,
  MessageCircle, Heart, Share2, Bookmark, Search, X, ChevronDown, Send, CheckCircle2, Radio, Film, Clock, Plug, ThumbsUp, Eye,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import { onairApi, LIVE } from '../../lib/onairService';
import { apiGet } from '../../lib/apiClient';
import { meApi } from '../../lib/meService';

const NAVY = '#030b2e';
const BLUE = '#0808f8';
const RED = '#e2445c';
const GREEN = '#00a35c';
const DISPLAY = { fontFamily: '"Sofia Sans Extra Condensed", sans-serif' };
const PERIODS = [['day', 'Day'], ['week', 'Week'], ['month', 'Month']];

// ── formatting
const money = (v, { exact = false } = {}) => {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v), a = Math.abs(n), s = n < 0 ? '−' : '';
  if (!exact && a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (!exact && a >= 1e4) return `${s}$${Math.round(a / 1e3)}k`;
  if (!exact && a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}k`;
  return `${s}$${Math.round(a).toLocaleString('en-US')}`;
};
const pct = (v, d = 1) => (v == null ? '—' : `${(v * 100).toFixed(d)}%`);
const x2 = (v) => (v == null ? '—' : Number(v).toFixed(2));
const int = (v) => (v == null ? '—' : Math.round(v).toLocaleString('en-US'));
const DATE = /^\d{4}-\d{2}-\d{2}/;
const fmtDay = (d, o = { weekday: 'short', day: 'numeric', month: 'short' }) => (d && DATE.test(d) ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' }) : '—');
const fmtMonth = (m, long = true) => (m && /^\d{4}-\d{2}/.test(m) ? new Date(`${m.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('en-GB', { month: long ? 'long' : 'short', timeZone: 'UTC' }) : '—');
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) : '—');
const dayDiff = (a, b) => (a && b ? Math.round((Date.parse(`${b.slice(0, 10)}T12:00:00Z`) - Date.parse(`${a.slice(0, 10)}T12:00:00Z`)) / 86400000) : null);
const first = (n) => String(n || '').trim().split(/\s+/)[0];
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const change = (cur, prev) => (cur != null && prev ? (cur - prev) / Math.abs(prev) : null);

function Delta({ v, invert = false, small = false, suffix = '' }) {
  if (v == null || !Number.isFinite(v) || Math.abs(v) < 0.005) return null;
  const up = v > 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return <span className={`inline-flex items-center gap-0.5 font-semibold whitespace-nowrap ${small ? 'text-[10.5px]' : 'text-[12px]'}`} style={{ color: good ? GREEN : RED }}><Icon size={small ? 11 : 13} />{Math.round(Math.abs(v) * 100)}%{suffix}</span>;
}

function Segmented({ value, onChange, options, size = 'md', label }) {
  return (
    <div className="inline-flex p-1 rounded-2xl bg-white border border-gray-200" role="tablist" aria-label={label}>
      {options.map(([k, l, Icon]) => (
        <button key={k} type="button" role="tab" aria-selected={value === k} onClick={() => onChange(k)}
          className={`flex items-center justify-center gap-1.5 font-semibold rounded-xl whitespace-nowrap transition-colors ${size === 'sm' ? 'text-xs px-3 py-1.5' : 'text-sm px-4 py-2'} ${value === k ? 'text-white' : 'text-gray-600 hover:bg-gray-100'}`}
          style={value === k ? { background: NAVY } : undefined}>
          {Icon && <Icon size={size === 'sm' ? 13 : 15} />}{l}
        </button>
      ))}
    </div>
  );
}

function Tile({ label, value, sub, accent = NAVY, delta, className = '' }) {
  return (
    <div className={`rounded-2xl bg-white border border-gray-200 px-4 py-3 min-w-0 ${className}`}>
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 truncate">{label}</div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="font-black leading-none tabular-nums text-[32px] sm:text-[38px]" style={{ ...DISPLAY, color: accent }}>{value}</span>
        {delta}
      </div>
      {sub && <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{sub}</div>}
    </div>
  );
}

function Empty({ icon: Icon = Radio, title, children }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-200 px-6 py-12 text-center">
      <Icon className="mx-auto text-gray-300" size={30} />
      <div className="mt-2 font-semibold" style={{ color: NAVY }}>{title}</div>
      {children && <div className="text-sm text-gray-500 mt-1 max-w-[520px] mx-auto">{children}</div>}
    </div>
  );
}

const H2 = ({ children, aside, right }) => (
  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-2">
    <h2 className="font-black uppercase text-[22px] sm:text-[24px] leading-none" style={{ ...DISPLAY, color: NAVY }}>{children}</h2>
    {aside && <span className="text-xs text-gray-400">{aside}</span>}
    {right && <span className="ml-auto">{right}</span>}
  </div>
);

function Fold({ title, aside, children, open: initial = false }) {
  const [open, setOpen] = useState(initial);
  return (
    <section className="rounded-2xl bg-white border border-gray-200">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <span className="text-[14px] font-bold" style={{ color: NAVY }}>{title}</span>
        {aside && <span className="text-xs text-gray-400 truncate">{aside}</span>}
        <ChevronDown size={16} className={`ml-auto flex-none text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </section>
  );
}

/** The written summary at the top of each tab — what happened, in one breath. */
function Story({ icon: Icon, lines }) {
  return (
    <div className="rounded-2xl p-4 sm:p-5 text-white relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${NAVY} 0%, #0b1a6b 60%, ${BLUE} 130%)` }}>
      <div className="flex gap-3">
        <span className="flex-none w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center"><Icon size={18} /></span>
        <div className="min-w-0 flex flex-col gap-1.5">
          {lines.filter(Boolean).map((l, i) => <p key={i} className={i === 0 ? 'text-[15.5px] sm:text-[17px] font-semibold leading-snug' : 'text-[13px] text-white/80 leading-snug'}>{l}</p>)}
        </div>
      </div>
    </div>
  );
}

/** One measure over time — bars, the newest in full colour, a period still running striped. */
function TrendChart({ points, fmt, color = BLUE, height = 132 }) {
  const max = Math.max(1, ...points.map(p => p.value || 0));
  const every = points.length > 16 ? Math.ceil(points.length / 8) : 1;
  if (!points.length) return <div className="text-sm text-gray-400 py-8 text-center">No history yet</div>;
  return (
    <div>
      <div className="flex items-end gap-[3px] sm:gap-1" style={{ height }}>
        {points.map((p, i) => {
          const last = i === points.length - 1;
          const h = p.value ? Math.max(3, (p.value / max) * (height - 18)) : 0;
          return (
            <div key={p.key || i} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full group" title={p.title || `${p.label}: ${fmt(p.value)}`}>
              {last && <span className="text-[11px] font-bold tabular-nums mb-0.5 whitespace-nowrap" style={{ color: NAVY }}>{fmt(p.value)}</span>}
              <div className="w-full rounded-t-md group-hover:!opacity-100 transition-opacity" style={{
                height: h, background: p.partial ? `repeating-linear-gradient(135deg, ${color}, ${color} 4px, ${color}99 4px, ${color}99 8px)` : color,
                opacity: last ? 1 : 0.42,
              }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-[3px] sm:gap-1 mt-1">
        {points.map((p, i) => <span key={p.key || i} className="flex-1 min-w-0 text-center text-[10px] text-gray-400 truncate">{i % every === 0 || i === points.length - 1 ? p.short : ''}</span>)}
      </div>
    </div>
  );
}

function ChartCard({ title, metrics, metric, onMetric, points, fmt, note, color }) {
  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-4 min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400">{title}</div>
        <div className="ml-auto flex gap-1">
          {metrics.map(([k, l]) => (
            <button key={k} type="button" onClick={() => onMetric(k)} className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${metric === k ? 'text-white' : 'bg-gray-100 text-gray-600'}`} style={metric === k ? { background: NAVY } : undefined}>{l}</button>
          ))}
        </div>
      </div>
      <TrendChart points={points} fmt={fmt} color={color} />
      {note && <div className="text-[10.5px] text-gray-400 mt-2">{note}</div>}
    </div>
  );
}

function OnAirFull() {
  const { isGrowth } = useAuth();
  const { brandId } = useBrand();
  const [params, setParams] = useSearchParams();
  const tab = !isGrowth && params.get('tab') === 'meta' ? 'meta' : 'tv';   // the growth team: TV only
  const period = PERIODS.some(([k]) => k === params.get('p')) ? params.get('p') : 'week';
  const set = (k, v) => { const next = new URLSearchParams(params); if (v == null) next.delete(k); else next.set(k, v); setParams(next, { replace: true }); };
  useEffect(() => { meApi.pageView(`On Air · ${tab === 'meta' ? 'Meta' : 'TV'}`); }, [tab]);
  if (brandId && brandId !== 'particle') return <div className="p-10 text-center text-sm text-gray-500">On Air works on Particle — switch to the Particle brand.</div>;
  return (
    <div className="max-w-[1500px] mx-auto pb-16">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3 mb-4">
        <div className="min-w-0 flex-1 basis-[260px]">
          <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: RED }}>
            <span className="relative flex w-2.5 h-2.5"><span className="absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping" style={{ background: RED }} /><span className="relative inline-flex rounded-full w-2.5 h-2.5" style={{ background: RED }} /></span>
            On air now
          </div>
          <h1 className="font-black uppercase leading-none text-[38px] sm:text-[52px] mt-1" style={{ ...DISPLAY, color: NAVY }}>On Air</h1>
          <p className="text-sm text-gray-500 mt-1.5 max-w-[720px]">{isGrowth ? 'What’s running on TV right now — the numbers from Particle Brain, the notes from the media agency.' : 'What’s running right now — on TV from Particle Brain and the media agency, on Meta from AfterLife.'}</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Segmented value={period} onChange={(k) => set('p', k === 'week' ? null : k)} options={PERIODS} label="Period" />
          {!isGrowth && <Segmented value={tab} onChange={(k) => set('tab', k === 'tv' ? null : k)} options={[['tv', 'TV', Tv], ['meta', 'Meta ads', Smartphone]]} label="On Air" />}
        </div>
      </div>
      {!LIVE && <div className="mb-3 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Local preview — made-up data (the live page reads Particle Brain, the agency’s emails{isGrowth ? '' : ' and AfterLife'}).</div>}
      {tab === 'tv' ? <TvTab period={period} /> : <MetaTab period={period} />}
    </div>
  );
}

// ═══════════════════════════════════════ TV ═══════════════════════════════════════

function TvTab({ period }) {
  const { isEditor, isAdmin } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [product, setProduct] = useState('');
  const load = useCallback(() => { setError(null); onairApi.tv().then(setData).catch(e => setError(e.message)); }, []);
  useEffect(load, [load]);
  const refresh = async () => {
    setBusy(true); setError(null);
    try { setData(await onairApi.refresh()); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const connect = async () => { try { const r = await onairApi.googleConnect(); if (r?.url) window.location.href = r.url; } catch (e) { setError(e.message); } };

  if (error && !data) return <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>;
  if (!data) return <div className="py-20 text-center text-gray-400"><Loader2 className="inline animate-spin" /></div>;

  const canRead = data.google?.connected && data.google?.can_read !== false;
  const brain = data.brain || {};
  const canRefresh = canRead || brain.configured;
  const products = data.products || [];
  const shown = product ? products.filter(p => p.product === product) : products;
  const needsReconnect = !data.google?.connected || data.google?.can_read === false || data.sync?.needs_reconnect;

  return (
    <div className="flex flex-col gap-6">
      {needsReconnect && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 flex flex-wrap items-center gap-3">
          <Mail size={18} className="text-amber-700 flex-none" />
          <div className="text-sm text-amber-900 flex-1 min-w-[220px]">
            {isAdmin
              ? <><b>Let CP read the agency’s emails.</b> Reconnect Google once — it adds read-only Gmail access (nothing is sent, labelled or changed). Then the TV report fills itself every day at 17:00.</>
              : <><b>The TV report isn’t connected yet.</b> An admin reconnects Google once (read-only Gmail) and it fills itself every day at 17:00.</>}
          </div>
          {isAdmin && <button type="button" onClick={connect} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-white" style={{ background: NAVY }}><Plug size={13} /> Reconnect Google</button>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          {products.length > 1 && <button type="button" onClick={() => setProduct('')} className={`flex-none text-xs font-semibold px-3 py-1.5 rounded-full ${!product ? 'text-white' : 'bg-white border border-gray-200 text-gray-600'}`} style={!product ? { background: NAVY } : undefined}>All products</button>}
          {products.map(p => (
            <button key={p.product} type="button" onClick={() => setProduct(product === p.product ? '' : p.product)}
              className={`flex-none text-xs font-semibold px-3 py-1.5 rounded-full ${product === p.product ? 'text-white' : 'bg-white border border-gray-200 text-gray-700'}`} style={product === p.product ? { background: NAVY } : undefined}>
              {p.product}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-gray-500">
          <Clock size={12} />
          {brain.configured
            ? <span title={`Particle Brain is copied every hour; the agency’s email is read at 17:00${data.sync?.at ? ` (last read ${fmtTime(data.sync.at)})` : ''}`}>Particle Brain hourly{brain.sync?.at ? ` · synced ${fmtTime(brain.sync.at)}` : ''} · agency email 17:00</span>
            : <span>Read every day at 17:00{data.sync?.at ? ` · last read ${fmtTime(data.sync.at)}` : ''}</span>}
          {isEditor && canRefresh && <button type="button" onClick={refresh} disabled={busy} className="flex items-center gap-1 font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-gray-300 text-gray-700 disabled:opacity-50"><RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> {busy ? 'Reading…' : 'Read now'}</button>}
        </div>
      </div>
      {error && <div className="px-4 py-2 rounded-xl bg-red-50 text-red-700 text-xs">{error}</div>}
      {isEditor && brain.configured && brain.sync && brain.sync.ok === false && (
        <div className="px-4 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2"><AlertTriangle size={14} className="flex-none" /> Particle Brain didn’t answer at {fmtTime(brain.sync.at)} — showing the numbers from the last good copy. {brain.sync.error}</div>
      )}

      {!products.length && canRefresh && <Empty icon={Tv} title="No agency reports yet">The next read is at 17:00{isEditor ? ' — or press “Read now”' : ''}. Reports are the daily “Particle … Campaign” emails from the agency.</Empty>}

      {shown.map(p => <ProductBlock key={p.product} p={p} period={period} />)}

      {(data.pipeline || []).length > 0 && <Pipeline items={data.pipeline} />}
      {(data.notes || []).length > 0 && <Notes notes={data.notes} />}
    </div>
  );
}

/** The agency's RBD sheet: every creative that aired in the period with its real numbers vs the period before. */
function airSpots(p, period, prevLabel) {
  const list = p.air?.spots?.[period];
  if (!list?.length) return null;
  const pv = (x) => x?.spend ?? x?.spent;
  return {
    spots: list,
    move: (s) => (s.prev && (pv(s.prev) || s.prev.orders)
      ? { text: `${prevLabel.charAt(0).toUpperCase()}${prevLabel.slice(1)}: ${money(pv(s.prev))} · MER ${x2(s.prev.mer)}`, mer: s.prev.mer }
      : s.is_new ? { text: period === 'day' ? 'First day on air' : `New — first aired ${fmtDay(s.first_seen, { day: 'numeric', month: 'short' })}`, fresh: true } : null),
  };
}

/** One product's period: totals now and before, the chart, the spots and how each moved. */
function tvPeriod(p, period) {
  const base = tvPeriodBase(p, period);
  const air = airSpots(p, period, period === 'month' ? base.prevLabel : period === 'day' ? 'the day before' : 'last week');
  return air ? { ...base, ...air, fromSheet: true } : base;
}
function tvPeriodBase(p, period) {
  const per = p.periods || {};
  if (period === 'day') {
    const cur = per.day || null;
    return {
      cur, prev: cur?.prev || null, label: cur ? fmtDay(cur.label || cur.date) : 'The last day', prevLabel: 'the day before', partial: false,
      points: (p.history?.daily || []).slice(-21).map(d => ({ key: d.date, label: fmtDay(d.date), short: fmtDay(d.date, { day: 'numeric' }), ...d })),
      spots: p.spots, move: (s) => (s.moved && (s.moved.spent || s.moved.orders) ? { text: `${s.moved.spent >= 0 ? '+' : '−'}${money(Math.abs(s.moved.spent))} · ${s.moved.orders >= 0 ? '+' : ''}${int(s.moved.orders)} orders`, sub: p.previous_report ? `since the ${fmtDay(p.previous_report, { day: 'numeric', month: 'short' })} report` : 'since the last report' } : null),
    };
  }
  if (period === 'month') {
    const cur = per.month || null;
    const months = p.history?.monthly || [];
    const years = new Set(months.map(m => m.month.slice(0, 4))).size > 1;   // 13 months from Brain: say which November
    return {
      cur, prev: cur?.prev || null, label: fmtMonth(cur?.label || p.month?.month), prevLabel: fmtMonth(p.month?.prev_month), partial: !!cur?.partial,
      prevSame: cur?.prev_same || null, sameLabel: cur?.days ? `${fmtMonth(p.month?.prev_month, false)} 1–${cur.days}` : null,
      points: months.map(m => ({ key: m.month, label: `${fmtMonth(m.month)}${years ? ` ${m.month.slice(0, 4)}` : ''}`, short: `${fmtMonth(m.month, false)}${years ? ` ’${m.month.slice(2, 4)}` : ''}`, ...m })),
      spots: p.month?.spots || [], move: (s) => (s.prev ? { text: `${fmtMonth(p.month?.prev_month, false)}: ${money(s.prev.spent)} · MER ${x2(s.prev.mer)}`, mer: s.prev.mer } : s.is_new ? { text: 'New this month', fresh: true } : null),
    };
  }
  const cur = per.week || null;
  return {
    cur, prev: cur?.prev || null, label: `Week of ${fmtDay(p.week_of, { day: 'numeric', month: 'short' })}`, prevLabel: 'last week', partial: cur?.partial !== false,
    prevSame: cur?.prev_same || null, sameLabel: 'same days last week',
    points: (p.history?.weekly || []).map(w => ({ key: w.date, label: `Week of ${fmtDay(w.date, { day: 'numeric', month: 'short' })}`, short: fmtDay(w.date, { day: 'numeric', month: 'numeric' }), ...w })),
    spots: p.spots, move: (s) => (s.week_prev ? { text: `Last week: ${money(s.week_prev.spent)} · MER ${x2(s.week_prev.mer)}`, mer: s.week_prev.mer } : s.is_new || s.new_in_report ? { text: 'New this week', fresh: true } : null),
  };
}

const verdictTv = (mer, ref) => (mer == null || !ref ? null : mer >= ref * 1.15 ? ['Strong', GREEN] : mer <= ref * 0.85 ? ['Weak', RED] : ['Fine', '#5b6280']);

function ProductBlock({ p, period }) {
  const { isGrowth } = useAuth();
  const nav = useNavigate();
  const [metric, setMetric] = useState('spend');
  const [sort, setSort] = useState('spend');
  const [all, setAll] = useState(false);
  const P = tvPeriod(p, period);
  const cur = P.cur || {}, prev = P.prev || {};
  // a period still running is compared with the same days of the one before (Brain has every day); else the whole one
  const fair = P.partial && P.prevSame;
  const cmp = fair ? P.prevSame : prev;
  const cmpLabel = fair ? P.sameLabel : P.prevLabel;
  const showDelta = !P.partial || fair;
  const site = p.brain?.site?.[period] || null, sitePrev = p.brain?.site?.[`${period}_prev`] || null;
  const visits = (x) => x?.sessions?.sessions ?? x?.sessions?.tv_sessions ?? x?.sessions?.visits ?? null;
  const est = p.brain?.estimated?.after_last || [];
  const libPath = isGrowth ? '/tv-library' : '/library';
  const openPrd = (id) => nav(isGrowth ? '/tv-productions' : `/production/${encodeURIComponent(id)}`);

  const ranked = P.spots.filter(s => s.mer != null && (s.share == null || s.share >= 0.04));
  const best = [...ranked].sort((a, b) => b.mer - a.mer)[0];
  const worst = [...ranked].sort((a, b) => a.mer - b.mer)[0];
  const fresh = P.spots.filter(s => s.is_new);
  const nameOf = (s) => s?.library?.title || s?.name;
  const story = [
    cur.spend != null
      ? `${P.label}${P.partial ? ' so far' : ''}: ${money(cur.spend)} on ${p.product} TV → ${int(cur.orders)} orders, MER ${x2(cur.mer)}${cmp.mer != null && cur.mer != null ? ` (${cur.mer >= cmp.mer ? 'up' : 'down'} from ${x2(cmp.mer)} ${cmpLabel})` : ''}.`
      : `${p.product}: no numbers for this period yet.`,
    visits(site) != null || site?.store?.new_customers != null
      ? `From TV: ${[visits(site) != null ? `${int(visits(site))} site visits` : null, site?.store?.new_customers != null ? `${int(site.store.new_customers)} new customers` : null].filter(Boolean).join(' and ')}.`
      : null,
    est.length ? `The agency hasn’t reported ${est.length === 1 ? fmtDay(est[0].date, { weekday: 'long' }) : `${est.length} days`} yet — the media pre-log has ${money(p.brain.estimated.spend_after_last)} booked.` : null,
    best && worst && best !== worst ? `Strongest spot: ${nameOf(best)} — MER ${x2(best.mer)}. Weakest: ${nameOf(worst)} — ${x2(worst.mer)}.` : null,
    fresh.length ? `New on air: ${fresh.slice(0, 3).map(nameOf).join(', ')}${fresh.length > 3 ? ` +${fresh.length - 3}` : ''}.` : null,
  ];
  const sorted = [...P.spots].sort(sort === 'mer' ? (a, b) => (b.mer ?? -1) - (a.mer ?? -1) : sort === 'new' ? (a, b) => Number(!!b.is_new) - Number(!!a.is_new) || (b.spent || 0) - (a.spent || 0) : (a, b) => (b.spent || 0) - (a.spent || 0));
  const spots = all ? sorted : sorted.slice(0, 9);
  const metrics = [['spend', 'Spend', money], ['orders', 'Orders', int], ['mer', 'MER', x2]];
  const mfmt = metrics.find(m => m[0] === metric)[2];

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <h2 className="font-black uppercase text-[30px] sm:text-[36px] leading-none" style={{ ...DISPLAY, color: NAVY }}>{p.product}</h2>
        <span className="text-xs text-gray-500 pb-1">
          {p.brain
            ? <>Particle Brain · through {fmtDay(p.brain.last)}{p.report_date ? ` · agency report ${fmtDay(p.report_date, { day: 'numeric', month: 'short' })}` : ''}</>
            : <>Agency report of {fmtDay(p.report_date)}{p.received_at ? ` · in at ${fmtTime(p.received_at).split(', ').pop()}` : ''}</>}
        </span>
      </div>

      <Story icon={Tv} lines={story} />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3">
        <Tile label={`Spent · ${P.label}`} value={money(cur.spend)} delta={showDelta ? <Delta v={change(cur.spend, cmp.spend)} /> : null}
          sub={fair ? `${cmpLabel} ${money(cmp.spend)} · all ${P.prevLabel} ${money(prev.spend)}` : `${P.prevLabel} ${money(prev.spend)}${P.partial ? ' (full)' : ''}`} />
        <Tile label="Orders" value={int(cur.orders)} delta={showDelta ? <Delta v={change(cur.orders, cmp.orders)} /> : null} sub={`${cmpLabel} ${int(cmp.orders)}`} />
        <Tile label="MER" value={x2(cur.mer)} delta={<Delta v={change(cur.mer, cmp.mer)} />} sub={`revenue ÷ spend · ${cmpLabel} ${x2(cmp.mer)}`} />
        <Tile label="AOV" value={money(cur.aov, { exact: true })} delta={<Delta v={change(cur.aov, cmp.aov)} />} sub={`per order · ${cmpLabel} ${money(cmp.aov, { exact: true })}`} />
        <Tile label="CPO" value={money(cur.cpo, { exact: true })} delta={<Delta v={change(cur.cpo, cmp.cpo)} invert />} sub={`spend per order · ${cmpLabel} ${money(cmp.cpo, { exact: true })}`} className="col-span-2 md:col-span-1" />
      </div>
      {site && <SiteStrip site={site} prev={sitePrev} visits={visits} prevLabel={P.prevLabel} partial={P.partial} />}

      <div className="grid gap-3 lg:grid-cols-[1.4fr_1fr]">
        <ChartCard title={period === 'day' ? 'Per day' : period === 'month' ? 'Per month' : 'Per week'} metrics={metrics.map(([k, l]) => [k, l])} metric={metric} onMetric={setMetric}
          points={P.points.map(pt => ({ ...pt, value: pt[metric], title: `${pt.label}${pt.partial ? ' (so far)' : ''}: ${mfmt(pt[metric])}` }))} fmt={mfmt}
          color={metric === 'mer' ? '#7e5bef' : BLUE}
          note={p.brain
            ? (period === 'month' ? 'Calendar months — the last 13, so the same month last year is there too. Striped = still running.' : period === 'week' ? 'Monday-to-Sunday weeks, like the agency’s. Striped = this week so far.' : null)
            : (period === 'month' ? 'Months group the agency’s weeks by the week they start. Striped = still running.' : period === 'week' ? 'Striped = this week so far.' : null)} />
        {p.note?.text && (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 flex gap-3">
            <span className="flex-none w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white" style={{ background: '#5a63a8' }}>AG</span>
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-gray-500 flex flex-wrap items-center gap-x-2">The agency · {fmtTime(p.note.at)}{p.note.link && <a href={p.note.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-[#0808f8] hover:underline">Open the email <ExternalLink size={11} /></a>}</div>
              <p className="text-[13.5px] leading-relaxed mt-1 whitespace-pre-line line-clamp-[9]" style={{ color: NAVY }}>{p.note.text}</p>
            </div>
          </div>
        )}
      </div>

      {p.plan && <PlanCard plan={p.plan} />}

      <div>
        <H2 aside={`${P.spots.length} spot${P.spots.length === 1 ? '' : 's'} · ${period === 'day' ? `aired ${P.fromSheet ? fmtDay(p.air?.last) : 'on the last day'}` : period === 'month' ? 'everything that aired this month' : 'aired this week'}${P.fromSheet ? (p.air?.source === 'brain' ? ' · from Particle Brain' : ' · from the agency’s day-by-day sheet') : ''}`}
          right={<Segmented size="sm" value={sort} onChange={setSort} options={[['spend', 'Spend'], ['mer', 'MER'], ['new', 'New']]} label="Sort spots" />}>
          {period === 'month' ? `On air in ${fmtMonth(p.month?.month)}` : 'On air now'}
        </H2>
        {!P.spots.length && <Empty icon={Film} title="No spots in this period yet" />}
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {spots.map(s => <SpotCard key={s.code} s={s} refMer={cur.mer} move={P.move(s)} onLibrary={() => nav(libPath)} onProduction={openPrd} />)}
        </div>
        {P.spots.length > 9 && <button type="button" onClick={() => setAll(!all)} className="mt-3 text-sm font-semibold px-4 py-2 rounded-xl bg-white border border-gray-200 hover:border-gray-300" style={{ color: NAVY }}>{all ? 'Show fewer' : `Show all ${P.spots.length}`}</button>}
      </div>

      {p.air && (p.air.stations?.[period]?.length > 0 || p.air.dayparts?.[period]?.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
          <StationsCard rows={p.air.stations[period] || []} refMer={cur.mer} label={P.label} />
          <DaypartsCard rows={p.air.dayparts[period] || []} hours={p.air.daypart_hours || {}} refMer={cur.mer} label={P.label} />
          {p.air.markets?.[period]?.length > 1 && (
            <StationsCard title="Markets" sub="where it ran" rows={p.air.markets[period].map(m => ({ ...m, station: m.market, market: null }))} refMer={cur.mer} label={P.label} />
          )}
        </div>
      )}

      {(p.placements.length > 0 || p.dayparts.length > 0) && <Placements p={p} refMer={cur.mer} />}
    </section>
  );
}

/** What TV brought to the site and the store in the period (Particle Brain: TV-attributed sessions and store orders). */
function SiteStrip({ site, prev, visits, prevLabel, partial }) {
  const st = site.store || {}, ps = prev?.store || {};
  const customers = (st.new_customers || 0) + (st.returning_customers || 0);
  const codes = (st.tv_code_revenue || 0) + (st.non_tv_code_revenue || 0) + (st.no_code_revenue || 0);
  const items = [
    visits(site) != null && ['Site visits from TV', int(visits(site)), visits(prev), (a, b) => change(a, b), `${prevLabel} ${int(visits(prev))}`, visits(site)],
    st.tv_orders != null && ['Store orders from TV', int(st.tv_orders), ps.tv_orders, null, st.tv_revenue != null ? `${money(st.tv_revenue)} revenue` : `${prevLabel} ${int(ps.tv_orders)}`, st.tv_orders],
    st.new_customers != null && ['New customers', int(st.new_customers), ps.new_customers, null, customers ? `${pct(st.new_customers / customers, 0)} of TV customers are new` : `${prevLabel} ${int(ps.new_customers)}`, st.new_customers],
    // Brain's promo-code split covers part of the TV revenue only, so it is shown as its own three parts (no "of $X")
    codes > 0 && ['Revenue with the TV promo code', pct((st.tv_code_revenue || 0) / codes, 0), null, null, `${money(st.tv_code_revenue)} TV code · ${money(st.non_tv_code_revenue || 0)} other code · ${money(st.no_code_revenue || 0)} no code`, null],
  ].filter(Boolean);
  if (!items.length) return null;
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-gray-400 mb-2">What TV brought in · site and store</div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-3">
        {items.map(([label, value, before, , sub, raw]) => (
          <div key={label} className="min-w-0">
            <div className="text-[11px] text-gray-500 truncate">{label}</div>
            <div className="flex items-baseline gap-1.5"><span className="text-[22px] font-bold tabular-nums leading-tight" style={{ color: NAVY }}>{value}</span>{!partial && raw != null && before ? <Delta v={change(raw, before)} small /> : null}</div>
            <div className="text-[11px] text-gray-400 truncate" title={sub}>{sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** This week's booked plan (the agency's Future sheet): what's booked, where, and which creatives rotate — the ones not aired yet are coming up. */
function PlanCard({ plan }) {
  const [all, setAll] = useState(false);
  const list = all ? plan.creatives : plan.creatives.slice(0, 8);
  const coming = plan.creatives.filter(c => !c.aired);
  const mtotal = plan.markets.reduce((a, m) => a + (m.cost || 0), 0) || 1;
  const COLORS = ['#0808f8', '#3d47ff', '#7e5bef', '#a78bfa', '#c4b5fd', '#ddd6fe'];
  return (
    <section className="rounded-2xl bg-white border border-gray-200 p-4">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <h3 className="font-black uppercase text-[22px] leading-none" style={{ ...DISPLAY, color: NAVY }}>Booked this week</h3>
        <span className="text-xs text-gray-400">week of {fmtDay(plan.week, { day: 'numeric', month: 'short' })} · the agency’s plan</span>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 mt-2">
        <span className="font-black tabular-nums text-[30px] leading-none" style={{ ...DISPLAY, color: NAVY }}>{money(plan.total.cost)}</span>
        <span className="text-[13px] text-gray-600"><b className="tabular-nums" style={{ color: NAVY }}>{int(plan.total.spots)}</b> spots · <b className="tabular-nums" style={{ color: NAVY }}>{int(plan.lines)}</b> lines</span>
        {coming.length > 0 && <span className="text-[12px] font-semibold" style={{ color: RED }}>{coming.length} booked creative{coming.length === 1 ? '' : 's'} not aired yet</span>}
      </div>
      <div className="flex h-2.5 rounded-full overflow-hidden mt-3 bg-gray-100">
        {plan.markets.map((m, i) => <span key={m.market} title={`${m.market}: ${money(m.cost)} · ${int(m.spots)} spots`} style={{ width: `${(m.cost / mtotal) * 100}%`, background: COLORS[i % COLORS.length] }} />)}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5 text-[11px] text-gray-500">
        {plan.markets.map((m, i) => <span key={m.market} className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />{m.market} {money(m.cost)}</span>)}
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {list.map(c => (
          <div key={c.name} className="flex items-center gap-2.5 rounded-xl border border-gray-100 p-2">
            <div className="relative w-16 aspect-video rounded-lg overflow-hidden bg-gradient-to-br from-[#0b1550] to-[#2a35b8] flex-none">
              {c.library?.thumb_url ? <img src={c.library.thumb_url} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" /> : <Film size={14} className="absolute inset-0 m-auto text-white/50" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="text-[13px] font-semibold truncate" style={{ color: NAVY }}>{c.library?.title || c.name}</span>
                {!c.aired && <span className="flex-none text-[9.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded text-white" style={{ background: RED }}>Coming up</span>}
              </div>
              <div className="text-[11px] text-gray-400 truncate">{c.lines} line{c.lines === 1 ? '' : 's'} · {c.stations} station{c.stations === 1 ? '' : 's'} · ~{money(c.cost)}{c.code ? ` · ${c.code}` : ''}</div>
              <div className="h-1 rounded-full bg-gray-100 mt-1 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(3, (c.share || 0) * 100)}%`, background: BLUE }} /></div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3 mt-2 text-[11px] text-gray-400">
        {plan.creatives.length > 8 && <button type="button" onClick={() => setAll(!all)} className="font-semibold text-[#0808f8] hover:underline">{all ? 'Show fewer' : `Show all ${plan.creatives.length}`}</button>}
        {plan.unassigned > 0 && <span>{plan.unassigned} line{plan.unassigned === 1 ? '' : 's'} without a creative assigned yet</span>}
        <span>Cost per creative is split evenly between the creatives rotating on a line.</span>
      </div>
    </section>
  );
}

/** Where it works: stations for the period, by spend, MER coloured against the product's MER. */
function StationsCard({ rows, refMer, label, title = 'Where it works', sub = 'stations' }) {
  const [all, setAll] = useState(false);
  const max = Math.max(1, ...rows.map(r => r.spend || 0));
  const list = all ? rows : rows.slice(0, 8);
  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-4">
      <div className="flex items-baseline gap-2 mb-2"><h3 className="text-[14px] font-bold" style={{ color: NAVY }}>{title}</h3><span className="text-xs text-gray-400">{sub} · {label}</span></div>
      {!rows.length && <div className="text-sm text-gray-400 py-4">No airings in this period.</div>}
      <div className="flex flex-col gap-1.5">
        {list.map(r => {
          const v = verdictTv(r.mer, refMer);
          return (
            <div key={r.station} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 items-center">
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5 min-w-0"><span className="text-[12.5px] font-semibold truncate" style={{ color: NAVY }}>{r.station}</span><span className="text-[10.5px] text-gray-400 truncate">{r.market}</span></div>
                <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-0.5"><div className="h-full rounded-full" style={{ width: `${((r.spend || 0) / max) * 100}%`, background: v ? v[1] : BLUE, opacity: 0.75 }} /></div>
              </div>
              <div className="text-right tabular-nums leading-tight">
                <div className="text-[12.5px] font-semibold" style={{ color: NAVY }}>{money(r.spend)} <span className="text-gray-400 font-normal">· {int(r.orders)} orders</span></div>
                <div className="text-[11px] font-bold" style={{ color: v ? v[1] : '#5b6280' }}>MER {x2(r.mer)}</div>
              </div>
            </div>
          );
        })}
      </div>
      {rows.length > 8 && <button type="button" onClick={() => setAll(!all)} className="mt-2 text-xs font-semibold text-[#0808f8] hover:underline">{all ? 'Show fewer' : `Show all ${rows.length}`}</button>}
    </div>
  );
}

/** When it works: time of day for the period — spend and MER per daypart. */
function DaypartsCard({ rows, hours, refMer, label }) {
  const max = Math.max(1, ...rows.map(r => r.spend || 0));
  return (
    <div className="rounded-2xl bg-white border border-gray-200 p-4">
      <div className="flex items-baseline gap-2 mb-2"><h3 className="text-[14px] font-bold" style={{ color: NAVY }}>When it works</h3><span className="text-xs text-gray-400">time of day · {label}</span></div>
      {!rows.length && <div className="text-sm text-gray-400 py-4">No airings in this period.</div>}
      <div className="flex flex-col gap-2">
        {rows.map(r => {
          const v = verdictTv(r.mer, refMer);
          return (
            <div key={r.daypart}>
              <div className="flex items-baseline gap-2 text-[12px]">
                <span className="font-semibold" style={{ color: NAVY }}>{r.daypart}</span><span className="text-[10.5px] text-gray-400">{hours[r.daypart] || ''}</span>
                <span className="ml-auto tabular-nums text-gray-600">{money(r.spend)} · {int(r.spots)} spots</span>
                <span className="tabular-nums font-bold w-[64px] text-right" style={{ color: v ? v[1] : '#5b6280' }}>MER {x2(r.mer)}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden mt-0.5"><div className="h-full rounded-full" style={{ width: `${((r.spend || 0) / max) * 100}%`, background: v ? v[1] : BLUE, opacity: 0.75 }} /></div>
            </div>
          );
        })}
      </div>
      <div className="text-[10.5px] text-gray-400 mt-2">Green = above the product’s MER for the period, red = below.</div>
    </div>
  );
}

/** The production it came from: PRD + its name in the CP (click → the production; the growth team → TV Productions) */
function PrdChip({ id, name, onOpen }) {
  if (!id) return <span className="text-[11px] text-gray-400">No production linked (Before 2026)</span>;
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onOpen?.(id); }} className="inline-flex items-center gap-1 max-w-full text-[11px] font-semibold px-1.5 py-0.5 rounded-md bg-[#eef0ff] text-[#0808f8] hover:bg-[#e2e5ff]" title={`${id} · ${name || ''}`}>
      <span className="tabular-nums flex-none">{id}</span>{name && <span className="truncate font-medium text-[#3a4170]">· {name}</span>}
    </button>
  );
}

function SpotCard({ s, refMer, move, onLibrary, onProduction }) {
  const lib = s.library;
  const title = lib?.title || s.name;
  const v = verdictTv(s.mer, refMer);
  return (
    <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow">
      <div className="relative aspect-video bg-gradient-to-br from-[#0b1550] to-[#2a35b8] overflow-hidden">
        {lib?.thumb_url ? <img src={lib.thumb_url} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
          : <div className="absolute inset-0 flex items-center justify-center px-6 text-center"><span className="font-black uppercase text-white/25 text-[28px] leading-none" style={DISPLAY}>{title}</span></div>}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        {lib?.url && <a href={lib.url} target="_blank" rel="noreferrer" className="absolute inset-0 flex items-center justify-center group" aria-label={`Watch ${title}`}><span className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform"><Play size={20} className="ml-0.5" style={{ color: NAVY }} /></span></a>}
        <div className="absolute top-2 left-2 flex gap-1">
          {s.is_new && <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md text-white" style={{ background: RED }}>New</span>}
          {s.length && <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-black/50 text-white">:{s.length}</span>}
        </div>
        {v && <span className="absolute bottom-2 left-2 text-[11px] font-bold px-2.5 py-1 rounded-full text-white shadow" style={{ background: v[1] }}>{v[0]}{s.mer != null ? ` · MER ${x2(s.mer)}` : ''}</span>}
        {s.share != null && <span className="absolute bottom-2 right-2 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-black/50 text-white">{pct(s.share, 0)} of spend</span>}
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <div className="text-[15px] font-semibold leading-snug line-clamp-2" style={{ color: NAVY }} title={lib ? `Our name in the CP: ${title}` : title}>{title}</div>
        {lib && <div className="min-w-0"><PrdChip id={lib.production_id} name={lib.production_name} onOpen={onProduction} /></div>}
        <div className="text-[11px] text-gray-400 truncate" title="What the agency calls it · its creative code">{[lib && s.name && s.name !== title ? `Agency: “${s.name}”` : null, s.code].filter(Boolean).join(' · ')}</div>
        {s.first?.date && <div className="text-[11px] text-gray-500 truncate" title="The first time it aired">First aired {fmtDay(s.first.date)}{s.first.time ? ` · ${s.first.time}` : ''}{s.first.station ? ` · ${s.first.station}` : ''}</div>}
        <div className="grid grid-cols-3 gap-2 mt-1">
          {[['Spent', money(s.spent)], ['Orders', int(s.orders)], ['CPO', money(s.cpo)]].map(([k, val]) => (
            <div key={k}><div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{k}</div><div className="text-[16px] font-bold tabular-nums leading-tight" style={{ color: NAVY }}>{val}</div></div>
          ))}
        </div>
        <div className="mt-auto pt-2 border-t border-gray-100 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px]">
          {move ? (
            <span className={move.fresh ? 'font-semibold' : 'text-gray-600'} style={move.fresh ? { color: RED } : undefined}>
              {move.text} {move.mer != null && s.mer != null && <Delta v={change(s.mer, move.mer)} small suffix=" MER" />}
              {move.sub && <span className="text-gray-400"> {move.sub}</span>}
            </span>
          ) : <span className="text-gray-400">No earlier numbers</span>}
          <span className="ml-auto">{lib ? <button type="button" onClick={onLibrary} className="font-semibold text-[#0808f8] hover:underline">TV Library</button> : <span className="text-gray-400" title="No commercial in the TV Library has this code">Not in the TV Library</span>}</span>
        </div>
        {s.stations?.length > 0 && <div className="flex flex-wrap gap-1">{s.stations.map(st => <span key={st.station} className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-[#f0f1fb] text-[#3a4170]" title={`${money(st.spent)} · ${int(st.orders)} orders · MER ${x2(st.mer)}`}>{st.station.replace(/^OTT-/, 'OTT · ')}</span>)}</div>}
      </div>
    </div>
  );
}

function Placements({ p, refMer }) {
  const color = (mer) => (verdictTv(mer, refMer) || [null, NAVY])[1];
  return (
    <Fold title={`Big placements${p.dayparts.length ? ' & dayparts' : ''}`} aside={`${p.placements.length + p.dayparts.length} rows · this week`}>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[560px]">
          <thead><tr className="text-left text-[10.5px] font-bold uppercase tracking-wider text-gray-400">{['Where', 'When', 'Creative', 'Cost', 'Orders', 'MER', 'CPO / CPV'].map(h => <th key={h} className="py-1.5 pr-3 font-bold">{h}</th>)}</tr></thead>
          <tbody className="divide-y divide-gray-50">
            {p.placements.map((r, i) => (
              <tr key={`p${i}`}><td className="py-1.5 pr-3 font-semibold" style={{ color: NAVY }}>{r.network}{r.date ? <span className="text-gray-400 font-normal"> · {fmtDay(r.date, { day: 'numeric', month: 'short' })}</span> : ''}</td>
                <td className="py-1.5 pr-3 text-gray-500">{r.period || '—'}</td><td className="py-1.5 pr-3">{r.creative || '—'}</td><td className="py-1.5 pr-3 tabular-nums">{money(r.cost)}</td>
                <td className="py-1.5 pr-3 tabular-nums">{int(r.orders)}</td><td className="py-1.5 pr-3 tabular-nums font-semibold" style={{ color: color(r.mer) }}>{x2(r.mer)}</td><td className="py-1.5 pr-3 tabular-nums text-gray-500">{r.cpv != null ? `CPV ${money(r.cpv, { exact: true })}` : '—'}</td></tr>
            ))}
            {p.dayparts.map((r, i) => (
              <tr key={`d${i}`}><td className="py-1.5 pr-3 font-semibold" style={{ color: NAVY }}>Fox News</td><td className="py-1.5 pr-3 text-gray-500">{r.daypart}</td><td className="py-1.5 pr-3">{r.creative}</td>
                <td className="py-1.5 pr-3 tabular-nums">{money(r.cost)}</td><td className="py-1.5 pr-3 tabular-nums">{int(r.orders)}</td><td className="py-1.5 pr-3 tabular-nums font-semibold" style={{ color: color(r.mer) }}>{x2(r.mer)}</td>
                <td className="py-1.5 pr-3 tabular-nums text-gray-500">{r.cpo != null ? `CPO ${money(r.cpo, { exact: true })}` : '—'}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </Fold>
  );
}

const STEPS = [['sent', 'Sent to the agency', Send, 'Sent'], ['confirmed', 'Agency confirmed', CheckCircle2, 'Confirmed'], ['on_air', 'On air', Radio, 'On air']];
function Pipeline({ items }) {
  return (
    <Fold title="From us to the networks" aside={`${items.length} new creative${items.length === 1 ? '' : 's'} emailed to the agency`} open>
      <div className="divide-y divide-gray-100 -mx-4">
        {items.map((it, i) => {
          const at = STEPS.findIndex(([k]) => k === it.status);
          return (
            <div key={i} className="px-4 py-3 grid gap-3 lg:grid-cols-[1.3fr_1.4fr_1fr] items-center">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold truncate" style={{ color: NAVY }}>{it.title}</div>
                <div className="text-[11px] text-gray-400 truncate">{[it.product, `sent by ${first(it.sent_by)} · ${fmtTime(it.sent_at)}`, it.library?.code].filter(Boolean).join(' · ')}</div>
                {it.library && <div className="text-[11px] mt-0.5 truncate"><span className="text-gray-400">In the CP: </span><span className="font-semibold text-[#3a4170]">{it.library.title}</span>{it.library.production_id && <span className="text-[#0808f8] font-semibold"> · {it.library.production_id}{it.library.production_name ? ` ${it.library.production_name}` : ''}</span>}</div>}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                {STEPS.map(([k, label, Icon, short], j) => (
                  <div key={k} className="flex items-center gap-1.5 min-w-0">
                    <span className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${j <= at ? 'text-white' : 'text-gray-400 bg-gray-100'}`} style={j <= at ? { background: k === 'on_air' ? RED : j === at ? BLUE : `${BLUE}99` } : undefined}>
                      <Icon size={11} />{k === 'on_air' && it.on_air_since ? `On air · ${fmtDay(it.on_air_since, { day: 'numeric', month: 'short' })}` : <><span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span></>}
                    </span>
                    {j < STEPS.length - 1 && <span className={`w-3 h-px ${j < at ? 'bg-[#0808f8]' : 'bg-gray-200'}`} />}
                  </div>
                ))}
              </div>
              <div className="min-w-0 flex flex-wrap items-center gap-1">
                {it.networks.slice(0, 7).map(n => <span key={n} className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-[#f0f1fb] text-[#3a4170]">{n}</span>)}
                {!it.networks.length && it.agency.length > 0 && <span className="text-[11.5px] text-gray-500 truncate" title={it.agency[it.agency.length - 1].text}>“{it.agency[it.agency.length - 1].text}”</span>}
                <span className="ml-auto flex gap-1">
                  {it.links.slice(0, 1).map(u => <a key={u} href={u} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-gray-400 hover:text-[#0808f8] hover:bg-gray-100" aria-label="Open the file"><Play size={13} /></a>)}
                  {it.link && <a href={it.link} target="_blank" rel="noreferrer" className="p-1.5 rounded-lg text-gray-400 hover:text-[#0808f8] hover:bg-gray-100" aria-label="Open the email"><Mail size={13} /></a>}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Fold>
  );
}

function Notes({ notes }) {
  const [all, setAll] = useState(false);
  const list = all ? notes : notes.slice(0, 4);
  return (
    <Fold title="What the agency says" aside="notes and replies, newest first">
      <div className="grid gap-2 md:grid-cols-2">
        {list.map((n, i) => (
          <div key={i} className="rounded-xl bg-[#f7f8ff] p-3.5">
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              <span className={`font-bold px-1.5 py-0.5 rounded ${n.kind === 'report' ? 'bg-[#eef0ff] text-[#0808f8]' : 'bg-white text-gray-600'}`}>{n.kind === 'report' ? 'Daily report' : 'Reply'}</span>
              <span className="truncate">{n.product ? `${n.product} · ` : ''}{fmtTime(n.at)}</span>
              {n.link && <a href={n.link} target="_blank" rel="noreferrer" className="ml-auto text-gray-400 hover:text-[#0808f8]" aria-label="Open the email"><ExternalLink size={12} /></a>}
            </div>
            {n.kind !== 'report' && <div className="text-[12px] font-semibold mt-1 truncate" style={{ color: NAVY }}>{n.subject}</div>}
            <p className="text-[13px] leading-relaxed text-gray-700 mt-1 line-clamp-5 whitespace-pre-line">{n.text}</p>
            {n.networks?.length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{n.networks.map(x => <span key={x} className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-white text-[#3a4170]">{x}</span>)}</div>}
          </div>
        ))}
      </div>
      {notes.length > 4 && <button type="button" onClick={() => setAll(!all)} className="mt-2 text-xs font-semibold text-[#0808f8] hover:underline">{all ? 'Show fewer' : `Show all ${notes.length}`}</button>}
    </Fold>
  );
}

// ═══════════════════════════════════════ META ═══════════════════════════════════════
// Video and static apart. Every creative is set against OUR internal team's 2026 creatives of the same format
// (video editors + designers; externals for reference only): ratio to the average + percentile → verdict + insights.

const MET = {
  hook: { label: 'Thumb-stop', hint: '3-sec views ÷ impressions (the hook rate)', fmt: (v) => pct(v, 0), good: 'high', video: true },
  hold: { label: 'Hold', hint: 'ThruPlays ÷ 3-sec views — of those who stopped, how many kept watching', fmt: (v) => pct(v, 0), good: 'high', video: true },
  avg_watch: { label: 'Avg watch', hint: 'average seconds watched per play', fmt: (v) => `${Number(v).toFixed(1)}s`, good: 'high', video: true },
  p50: { label: 'Watched half', hint: 'share of plays that reached 50%', fmt: (v) => pct(v, 0), good: 'high', video: true },
  ctr: { label: 'CTR', hint: 'link clicks ÷ impressions', fmt: (v) => pct(v, 2), good: 'high' },
  roas: { label: 'ROAS', hint: 'revenue ÷ spend (Meta)', fmt: (v) => `${x2(v)}×`, good: 'high' },
  aov: { label: 'AOV', hint: 'revenue per purchase', fmt: (v) => money(v, { exact: true }), good: 'high' },
  cpa: { label: 'CPA', hint: 'spend per purchase', fmt: (v) => money(v, { exact: true }), good: 'low' },
  cpm: { label: 'CPM', hint: 'cost per 1,000 impressions', fmt: (v) => money(v, { exact: true }), good: 'low' },
};
const CARD_METRICS = { video: ['hook', 'hold', 'avg_watch', 'ctr', 'roas', 'aov'], static: ['ctr', 'roas', 'aov', 'cpa', 'cpm'] };
const fmtOf = (c) => (c.format === 'video' ? 'video' : 'static');
/** how good it is, 0–100, whatever the direction (CPA: lower is better) */
const scoreOf = (m, x) => (x?.pct == null ? null : MET[m].good === 'low' ? 100 - x.pct : x.pct);
const overall = (c) => {
  if (!c.vs?.judged) return null;
  const sc = CARD_METRICS[fmtOf(c)].map(m => scoreOf(m, c.vs?.metrics?.[m])).filter(v => v != null);
  return sc.length ? sc.reduce((a, b) => a + b, 0) / sc.length : null;
};
const verdictMeta = (c) => {
  const o = overall(c);
  if (o == null) return ['Too early to tell', '#8a90a6'];
  return o >= 62 ? ['Above our average', GREEN] : o <= 38 ? ['Below our average', RED] : ['Our usual', '#5b6280'];
};

/** What makes this creative different from what we usually make — plain sentences, strongest first (max 3). */
function insightsOf(c) {
  const v = c.vs;
  const kind = fmtOf(c) === 'video' ? 'videos' : 'statics';
  if (!v || !v.metrics) return [];
  if (!v.judged) return [{ tone: 'muted', text: `Early days — ${money(v.spend)} spent so far, too little to compare with our ${kind}.` }];
  const M = v.metrics, sc = (m) => scoreOf(m, M[m]);
  const out = [];
  const both = (a, b) => sc(a) != null && sc(b) != null;
  if (fmtOf(c) === 'video') {
    if (both('hook', 'hold') && sc('hook') >= 75 && sc('hold') <= 30) out.push({ tone: 'warn', w: 3, text: `Stops the scroll, then loses them — a strong first 3 seconds (thumb-stop ${MET.hook.fmt(M.hook.v)}), a weak middle (hold ${MET.hold.fmt(M.hold.v)}).` });
    if (both('hook', 'hold') && sc('hold') >= 75 && sc('hook') <= 30) out.push({ tone: 'warn', w: 3, text: `Whoever stays, watches (hold ${MET.hold.fmt(M.hold.v)}) — but the opening doesn’t stop the scroll. A new hook could unlock it.` });
    if (both('hook', 'hold') && sc('hook') >= 85 && sc('hold') >= 85) out.push({ tone: 'good', w: 3, text: 'Hooks and holds — top of our videos on both the first 3 seconds and the watch-through.' });
  }
  if (both('ctr', 'roas') && sc('ctr') >= 75 && sc('roas') <= 30) out.push({ tone: 'warn', w: 3, text: `Gets the click, not the sale — CTR ${MET.ctr.fmt(M.ctr.v)} but ROAS ${MET.roas.fmt(M.roas.v)}. Check the landing page or the offer.` });
  if (both('ctr', 'roas') && sc('ctr') <= 30 && sc('roas') >= 75) out.push({ tone: 'good', w: 3, text: `Few clicks, but they buy — ROAS ${MET.roas.fmt(M.roas.v)} on a low CTR. A qualified audience.` });
  for (const m of Object.keys(MET)) {
    const x = M[m]; const s2 = sc(m);
    if (s2 == null || (MET[m].video && fmtOf(c) !== 'video')) continue;
    const avg = x.avg != null ? ` vs our ${MET[m].fmt(x.avg)}` : '';
    const name = MET[m].label === MET[m].label.toUpperCase() ? MET[m].label : MET[m].label.toLowerCase();
    const low = MET[m].good === 'low';
    if (s2 >= 90) out.push({ tone: 'good', w: 2 + (s2 - 90) / 10, text: `${low ? 'Lowest' : 'Top'} ${Math.max(1, 100 - s2)}% ${name} of our ${kind} this year — ${MET[m].fmt(x.v)}${avg}.` });
    else if (s2 <= 10) out.push({ tone: 'bad', w: 2 + (10 - s2) / 10, text: `${low ? 'Highest' : 'Bottom'} ${Math.max(1, s2)}% ${name} of our ${kind} — ${MET[m].fmt(x.v)}${avg}.` });
  }
  if (!out.length) return [{ tone: 'muted', text: `In line with our usual ${kind} — nothing stands out yet.` }];
  return out.sort((a, b) => b.w - a.w).slice(0, 3);
}
const TONE = { good: '#0b7a45', bad: '#b4233a', warn: '#9a5b00', muted: '#7a8099' };

/** The account for the period: now vs before, and the chart's points. */
function metaPeriod(data, period) {
  const T = data.totals || {};
  if (period === 'day') {
    const d = T.daily || T.series || [];
    return { label: fmtDay(data.last_day), prevLabel: 'the day before', cur: d[d.length - 1], prev: d[d.length - 2], partial: false,
      points: d.map(x => ({ key: x.d, label: fmtDay(x.d), short: fmtDay(x.d, { day: 'numeric' }), spend: x.spend, roas: x.roas })), newIn: 0, newLabel: 'on the last day' };
  }
  if (period === 'month') {
    const m = T.monthly || [];
    return { label: fmtMonth(m[m.length - 1]?.m), prevLabel: fmtMonth(m[m.length - 2]?.m), cur: m[m.length - 1], prev: m[m.length - 2], partial: !!m[m.length - 1]?.partial,
      points: m.map(x => ({ key: x.m, label: fmtMonth(x.m), short: fmtMonth(x.m, false), partial: x.partial, spend: x.spend, roas: x.roas })), newIn: 27, newLabel: 'in the last 4 weeks' };
  }
  const w = T.weekly || [];
  return { label: 'The last 7 days', prevLabel: 'the 7 days before', cur: w[w.length - 1], prev: w[w.length - 2], partial: false,
    points: w.map(x => ({ key: x.end, label: `${fmtDay(x.start, { day: 'numeric', month: 'short' })} – ${fmtDay(x.end, { day: 'numeric', month: 'short' })}`, short: fmtDay(x.end, { day: 'numeric', month: 'numeric' }), spend: x.spend, roas: x.roas })), newIn: 6, newLabel: 'in the last 7 days' };
}
const curOf = (c, period) => c.periods?.[period] || (period === 'week' ? c.d7 : null) || {};
const prevOf = (c, period) => c.periods?.[`${period}_prev`] || (period === 'week' ? c.prev7 : null) || {};

const SORTS = [['spend', 'Spend'], ['roas', 'ROAS'], ['standout', 'Stands out most'], ['newest', 'Newest'], ['movers', 'Biggest movers']];
function MetaTab({ period }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [format, setFormat] = useState('video');
  const [show, setShow] = useState('live');
  const [q, setQ] = useState('');
  const [product, setProduct] = useState('');
  const [maker, setMaker] = useState('');
  const [sort, setSort] = useState('spend');
  const [metric, setMetric] = useState('spend');
  const [limit, setLimit] = useState(24);
  const [open, setOpen] = useState(null);
  useEffect(() => { setLimit(24); }, [format, show, q, product, maker, sort, period]);
  const load = useCallback((force) => {
    setError(null); setBusy(!!force);
    onairApi.media(force).then(setData).catch(e => setError(e.message)).finally(() => setBusy(false));
  }, []);
  useEffect(() => load(false), [load]);

  const all = data?.creatives || [];
  const P = data ? metaPeriod(data, period) : null;
  const isNewIn = (c) => !!(c.first_spend && data && dayDiff(c.first_spend, data.last_day) != null && dayDiff(c.first_spend, data.last_day) <= (P?.newIn ?? 6));
  const cs = useMemo(() => all.filter(c => fmtOf(c) === format), [all, format]);
  const options = useMemo(() => {
    const u = (xs) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return { products: u(cs.map(c => c.product)), makers: u(cs.map(c => c.maker)) };
  }, [cs]);
  const growth = (c) => change(curOf(c, period).spend, prevOf(c, period).spend) ?? (curOf(c, period).spend ? 1 : 0);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const f = cs.filter(c => (show === 'all' || (show === 'live' ? c.live : isNewIn(c))) && (!product || c.product === product) && (!maker || c.maker === maker)
      && (!needle || [c.label, c.maker, c.product, c.campaign].filter(Boolean).some(v => v.toLowerCase().includes(needle))));
    const by = {
      spend: (a, b) => (curOf(b, period).spend || 0) - (curOf(a, period).spend || 0),
      roas: (a, b) => (curOf(b, period).roas ?? -1) - (curOf(a, period).roas ?? -1),
      standout: (a, b) => Math.abs((overall(b) ?? 50) - 50) - Math.abs((overall(a) ?? 50) - 50) || (curOf(b, period).spend || 0) - (curOf(a, period).spend || 0),
      newest: (a, b) => String(b.first_spend || '').localeCompare(String(a.first_spend || '')),
      movers: (a, b) => Math.abs(growth(b)) * Math.log10(10 + (curOf(b, period).spend || 0)) - Math.abs(growth(a)) * Math.log10(10 + (curOf(a, period).spend || 0)),
    };
    return f.sort(by[sort]);
  }, [cs, show, q, product, maker, sort, period, data]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error && !data) return <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>;
  if (!data) return <div className="py-20 text-center text-gray-400"><Loader2 className="inline animate-spin" /></div>;
  if (!data.connected) return <Empty icon={Smartphone} title="AfterLife isn’t connected">The Meta side comes from AfterLife — it needs AFTERLIFE_URL and its export token on the server.</Empty>;
  if (data.ready === false) return <Empty icon={Smartphone} title="AfterLife needs its update">{data.error || 'AfterLife hasn’t been updated with the On Air export yet.'} It shows here as soon as AfterLife is deployed.</Empty>;

  const live = all.filter(c => c.live);
  const fresh = all.filter(isNewIn);
  const liveF = live.filter(c => fmtOf(c) === format);
  const working = liveF.filter(c => (overall(c) ?? 0) >= 62).sort((a, b) => overall(b) - overall(a) || (curOf(b, period).spend || 0) - (curOf(a, period).spend || 0)).slice(0, 10);
  const needsLook = liveF.filter(c => overall(c) != null && overall(c) <= 38 && (curOf(c, period).spend || 0) >= 100).sort((a, b) => (curOf(b, period).spend || 0) - (curOf(a, period).spend || 0)).slice(0, 10);
  const cur = P.cur || {}, prev = P.prev || {};
  const topOne = [...live].filter(c => c.vs?.judged).sort((a, b) => (overall(b) ?? 0) - (overall(a) ?? 0))[0];
  const topIns = topOne ? insightsOf(topOne).find(i => i.tone === 'good') : null;
  const story = [
    `${P.label}${P.partial ? ' so far' : ''}: ${money(cur.spend)} on Meta · ROAS ${x2(cur.roas)}${prev.roas != null && cur.roas != null ? ` (${cur.roas >= prev.roas ? 'up' : 'down'} from ${x2(prev.roas)} ${P.prevLabel})` : ''}.`,
    `${int(live.length)} ads live — ${live.filter(c => fmtOf(c) === 'video').length} video, ${live.filter(c => fmtOf(c) === 'static').length} static.${fresh.length ? ` ${int(fresh.length)} started ${P.newLabel}.` : ''}`,
    topOne && topIns ? `Standing out: “${topOne.label}”${topOne.maker ? ` by ${first(topOne.maker)}` : ''} — ${topIns.text.charAt(0).toLowerCase()}${topIns.text.slice(1)}` : null,
  ];
  const bench = data.benchmarks;
  const base = bench?.internal?.[format];
  const count = (f) => all.filter(c => fmtOf(c) === f && c.live).length;
  const mfmt = metric === 'roas' ? x2 : money;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
        <Clock size={12} /> Meta data through {fmtDay(data.last_day)} · from AfterLife{data.fetched_at ? ` · ${fmtTime(data.fetched_at)}` : ''}
        <button type="button" onClick={() => load(true)} disabled={busy} className="ml-auto flex items-center gap-1 font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-gray-300 text-gray-700 disabled:opacity-50"><RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> Refresh</button>
        {data.afterlife_url && <a href={data.afterlife_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-gray-300 text-gray-700">Open AfterLife <ArrowUpRight size={12} /></a>}
      </div>

      <Story icon={Smartphone} lines={story} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Tile label={`Spend · ${P.label}`} value={money(cur.spend)} delta={!P.partial ? <Delta v={change(cur.spend, prev.spend)} /> : null} sub={`${P.prevLabel} ${money(prev.spend)}`} />
        <Tile label="ROAS" value={x2(cur.roas)} delta={<Delta v={change(cur.roas, prev.roas)} />} sub={`${P.prevLabel} ${x2(prev.roas)}`} />
        <Tile label="Live now" value={int(live.length)} accent={RED} sub={`${live.filter(c => fmtOf(c) === 'video').length} video · ${live.filter(c => fmtOf(c) === 'static').length} static`} />
        <Tile label="Started" value={int(fresh.length)} sub={`new ads ${P.newLabel}`} />
      </div>

      <ChartCard title={`All Meta · ${period === 'day' ? 'per day' : period === 'month' ? 'per month' : 'per week'}`} metrics={[['spend', 'Spend'], ['roas', 'ROAS']]} metric={metric} onMetric={setMetric}
        points={P.points.map(pt => ({ ...pt, value: pt[metric], title: `${pt.label}${pt.partial ? ' (so far)' : ''}: ${mfmt(pt[metric])}` }))} fmt={mfmt} color={metric === 'roas' ? '#7e5bef' : BLUE}
        note={period === 'month' ? 'Striped = this month so far.' : period === 'week' ? 'Rolling weeks ending on the newest Meta day.' : null} />

      {/* Video | Static — everything below follows it */}
      <div className="sticky top-0 z-10 -mx-1 px-1 py-1.5 bg-[#f4f5fa]/90 backdrop-blur flex flex-wrap items-center gap-2">
        <Segmented value={format} onChange={setFormat} options={[['video', `Video · ${count('video')}`, Play], ['static', `Static · ${count('static')}`, Smartphone]]} label="Format" />
        {base && <span className="text-[11.5px] text-gray-500">Our usual {format === 'video' ? 'video' : 'static'} ({bench.since ? bench.since.slice(0, 4) : 'this year'}): {CARD_METRICS[format].filter(m => base[m] != null).slice(0, 4).map(m => `${MET[m].label} ${MET[m].fmt(base[m])}`).join(' · ')}</span>}
      </div>

      {working.length > 0 && <StandoutRow title="What’s working" aside={`live ${format === 'video' ? 'videos' : 'statics'} doing better than our usual`} items={working} period={period} onOpen={setOpen} tone="good" />}
      {needsLook.length > 0 && <StandoutRow title="Needs a look" aside="spending, but below our usual" items={needsLook} period={period} onOpen={setOpen} tone="bad" />}

      <section>
        <H2 aside={`${list.length} ${format === 'video' ? 'videos' : 'statics'} · click one to watch it`}>{show === 'live' ? 'Everything live' : show === 'new' ? `Started ${P.newLabel}` : 'Everything'}</H2>
        <div className="flex flex-wrap items-center gap-2 p-2 rounded-2xl bg-white border border-gray-200 mb-3">
          <div className="flex bg-gray-100 rounded-xl p-0.5">
            {[['live', 'Live', cs.filter(c => c.live).length], ['new', 'New', cs.filter(isNewIn).length], ['all', 'All', cs.length]].map(([k, l, n]) => (
              <button key={k} type="button" onClick={() => setShow(k)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${show === k ? 'bg-white shadow-sm text-[#030b2e]' : 'text-gray-500'}`}>{l} {n}</button>
            ))}
          </div>
          <label className="relative flex-1 min-w-[160px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search creatives, makers, campaigns" className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-gray-300 outline-none" />
          </label>
          <Pick value={product} onChange={setProduct} label="Product" options={options.products.map(o => [o, o])} />
          <Pick value={maker} onChange={setMaker} label="Maker" options={options.makers.map(o => [o, o])} />
          <Pick value={sort} onChange={setSort} label="Sort" options={SORTS} always />
          {(q || product || maker) && <button type="button" onClick={() => { setQ(''); setProduct(''); setMaker(''); }} className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800 px-2 py-1.5 rounded-lg hover:bg-gray-100"><X size={13} /> Clear</button>}
        </div>
        {!list.length && <Empty icon={Smartphone} title="Nothing matches">Try “All”, or clear the filters.</Empty>}
        <div className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {list.slice(0, limit).map(c => <CreativeCard key={c.key} c={c} period={period} onOpen={() => setOpen(c)} />)}
        </div>
        {list.length > limit && (
          <div className="flex justify-center mt-3">
            <button type="button" onClick={() => setLimit(limit + 24)} className="text-sm font-semibold px-4 py-2 rounded-xl bg-white border border-gray-200 hover:border-gray-300" style={{ color: NAVY }}>Show more · {list.length - limit} left</button>
          </div>
        )}
      </section>

      {bench && <TeamAverages bench={bench} />}
      {open && <CreativeViewer c={open} initialPeriod={period} bench={bench} lastDay={data.last_day} onClose={() => setOpen(null)} />}
    </div>
  );
}

function StandoutRow({ title, aside, items, period, onOpen, tone }) {
  return (
    <section>
      <H2 aside={aside}>{title}</H2>
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x" style={{ scrollbarWidth: 'thin' }}>
        {items.map(c => {
          const ins = insightsOf(c).find(i => i.tone === tone) || insightsOf(c)[0];
          const cur = curOf(c, period);
          return (
            <button key={c.key} type="button" onClick={() => onOpen(c)} className="snap-start flex-none w-[270px] text-left rounded-2xl bg-white border border-gray-200 overflow-hidden hover:shadow-md transition-shadow flex">
              <Thumb c={c} className="w-[96px] flex-none self-stretch min-h-[136px]" />
              <div className="min-w-0 p-3 flex flex-col gap-1">
                <div className="text-[12.5px] font-semibold leading-snug line-clamp-2" style={{ color: NAVY }}>{c.label}</div>
                <div className="text-[11px] text-gray-400 truncate">{c.maker || 'Unknown maker'} · {money(cur.spend)}</div>
                {ins && <div className="text-[11.5px] leading-snug line-clamp-4" style={{ color: TONE[ins.tone] }}>{ins.text}</div>}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Our averages this year: video editors · designers · externals (externals are for reference — not in the comparisons). */
function TeamAverages({ bench }) {
  const cols = [['video', 'Video team', 'in-house editors'], ['design', 'Design team', 'in-house designers'], ['external', 'Externals', 'Grapevine & outside creators']];
  const rows = [['creatives', 'Creatives that ran', (v) => int(v)], ['spend', 'Spend', (v) => money(v)], ['roas', 'ROAS'], ['ctr', 'CTR'], ['hook', 'Thumb-stop'], ['hold', 'Hold'], ['avg_watch', 'Avg watch'], ['p50', 'Watched half'], ['aov', 'AOV'], ['cpa', 'CPA'], ['cpm', 'CPM']];
  const T = bench.teams || {};
  return (
    <Fold title={`How we usually do · ${bench.since ? bench.since.slice(0, 4) : 'this year'}`} aside={`${fmtDay(bench.since, { day: 'numeric', month: 'short' })} – ${fmtDay(bench.until, { day: 'numeric', month: 'short' })} · every creative that ran on Meta, by team`}>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px] min-w-[420px]">
          <thead><tr className="text-left"><th className="py-1.5 pr-3" />{cols.map(([k, l, sub]) => <th key={k} className="py-1.5 pr-3 align-bottom"><div className="text-[12px] font-bold" style={{ color: k === 'external' ? '#8a90a6' : NAVY }}>{l}</div><div className="text-[10.5px] font-normal text-gray-400">{sub}</div></th>)}</tr></thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(([m, label, f]) => {
              const fmt = f || MET[m].fmt;
              if (!cols.some(([k]) => T[k]?.[m] != null)) return null;
              return <tr key={m}><td className="py-1.5 pr-3 text-gray-500 whitespace-nowrap" title={MET[m]?.hint}>{label}</td>{cols.map(([k]) => <td key={k} className="py-1.5 pr-3 tabular-nums font-semibold" style={{ color: k === 'external' ? '#8a90a6' : NAVY }}>{T[k]?.[m] != null ? fmt(T[k][m]) : '—'}</td>)}</tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="text-[11px] text-gray-400 mt-2">Every ad is compared with the <b>internal team</b> only (video editors + designers) — video with video, static with static. Externals are here for reference. Thumb-stop and hook rate are the same measure here: 3-second views ÷ impressions.</div>
    </Fold>
  );
}

function Pick({ value, onChange, label, options, always = false }) {
  const on = !!value && !always;
  return (
    <label className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
        className={`appearance-none text-xs font-semibold pl-3 pr-7 py-2 rounded-xl border outline-none cursor-pointer ${on ? 'bg-[#eef0ff] border-[#0808f8]/30 text-[#0808f8]' : 'bg-gray-50 border-transparent text-gray-600'}`}>
        {!always && <option value="">{label}</option>}
        {options.map(([v, l]) => <option key={v} value={v}>{always ? `Sort: ${l}` : l}</option>)}
      </select>
      <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
    </label>
  );
}

function Thumb({ c, className = '', contain = false }) {
  const src = c.thumb || c.thumb_url;
  const [bad, setBad] = useState(false);
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-[#0b1550] to-[#2a35b8] flex items-center justify-center ${className}`}>
      {src && !bad ? <img src={src} alt="" loading="lazy" onError={() => setBad(true)} className={`absolute inset-0 w-full h-full ${contain ? 'object-contain' : 'object-cover'}`} /> : (c.format === 'video' ? <Play size={20} className="text-white/50" /> : <Smartphone size={20} className="text-white/50" />)}
    </div>
  );
}

const TEAM_LABEL = { video: 'Video team', design: 'Design team', external: 'External' };
function CreativeCard({ c, period, onOpen }) {
  const cur = curOf(c, period), prev = prevOf(c, period);
  const v = verdictMeta(c);
  const ins = insightsOf(c)[0];
  const M = c.vs?.metrics || {};
  const third = c.format === 'video' ? ['hook', 'Thumb-stop'] : ['ctr', 'CTR'];
  const tx = M[third[0]];
  const tsc = scoreOf(third[0], tx);
  return (
    <button type="button" onClick={onOpen} className="group text-left rounded-2xl bg-white border border-gray-200 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all flex flex-col">
      <div className="relative">
        <Thumb c={c} className="aspect-[4/5] w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-transparent to-transparent opacity-80" />
        <div className="absolute top-2 left-2 flex flex-wrap gap-1">
          {c.live && <span className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded text-white" style={{ background: RED }}><span className="w-1 h-1 rounded-full bg-white" />Live</span>}
          {c.new && <span className="text-[9.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-white" style={{ color: RED }}>New</span>}
        </div>
        {c.format === 'video' && <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><span className="w-11 h-11 rounded-full bg-white/90 flex items-center justify-center shadow-lg"><Play size={18} className="ml-0.5" style={{ color: NAVY }} /></span></span>}
        <span className="absolute bottom-2 left-2 right-2 text-[10.5px] font-bold px-2 py-1 rounded-full text-white truncate text-center" style={{ background: v[1] }}>{v[0]}</span>
      </div>
      <div className="p-2.5 sm:p-3 flex flex-col gap-1.5 flex-1">
        <div className="text-[12.5px] sm:text-[13.5px] font-semibold leading-snug line-clamp-2" style={{ color: NAVY }} title={c.label}>{c.label}</div>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="flex-none w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: c.maker ? '#5a63a8' : '#c4c7d6' }}>{c.maker ? initials(c.maker) : '?'}</span>
          <span className="text-[11px] text-gray-500 truncate">{c.maker ? first(c.maker) : 'Unknown'}{c.team ? ` · ${TEAM_LABEL[c.team] || c.team}` : ''}</span>
        </div>
        <div className="grid grid-cols-3 gap-1 mt-0.5">
          <div className="min-w-0"><div className="text-[9.5px] font-bold uppercase tracking-wider text-gray-400">Spend</div><div className="text-[14px] font-bold tabular-nums leading-tight" style={{ color: NAVY }}>{money(cur.spend)}</div><Delta v={change(cur.spend, prev.spend)} small /></div>
          <div className="min-w-0"><div className="text-[9.5px] font-bold uppercase tracking-wider text-gray-400">ROAS</div><div className="text-[14px] font-bold tabular-nums leading-tight" style={{ color: NAVY }}>{cur.roas != null ? x2(cur.roas) : '—'}</div><Delta v={change(cur.roas, prev.roas)} small /></div>
          <div className="min-w-0"><div className="text-[9.5px] font-bold uppercase tracking-wider text-gray-400 truncate">{third[1]}</div><div className="text-[14px] font-bold tabular-nums leading-tight" style={{ color: NAVY }}>{tx ? MET[third[0]].fmt(tx.v) : MET[third[0]].fmt(cur[third[0]])}</div>
            {tx?.ratio && <span className="text-[10.5px] font-semibold tabular-nums whitespace-nowrap" style={{ color: tsc == null ? '#8a90a6' : tsc >= 75 ? GREEN : tsc <= 25 ? RED : '#8a90a6' }}>{tx.ratio >= 1 ? '+' : '−'}{Math.abs(Math.round((tx.ratio - 1) * 100))}% avg</span>}
          </div>
        </div>
        {ins && <div className="text-[11px] leading-snug line-clamp-2 mt-auto pt-1" style={{ color: TONE[ins.tone] }}>{ins.text}</div>}
      </div>
    </button>
  );
}

/** "Better than X% of our videos" — a dot on a 0–100 track (the middle tick = our median). */
function PercentileBar({ m, x, kind }) {
  const sc = scoreOf(m, x);
  const color = sc == null ? '#9aa1c7' : sc >= 75 ? GREEN : sc <= 25 ? RED : BLUE;
  return (
    <div className="py-2">
      <div className="flex items-baseline gap-2">
        <span className="text-[12px] font-semibold text-gray-600" title={MET[m].hint}>{MET[m].label}</span>
        <span className="ml-auto text-[14px] font-bold tabular-nums" style={{ color: NAVY }}>{MET[m].fmt(x.v)}</span>
        {x.avg != null && <span className="text-[11px] text-gray-400 tabular-nums">our {MET[m].fmt(x.avg)}</span>}
      </div>
      <div className="relative h-2 rounded-full mt-1.5" style={{ background: 'linear-gradient(90deg, #fde4e8, #eef0ff 50%, #dcf5e8)' }}>
        <span className="absolute top-[-2px] bottom-[-2px] left-1/2 w-px bg-gray-300" />
        {sc != null && <span className="absolute top-1/2 w-3.5 h-3.5 rounded-full border-2 border-white shadow" style={{ left: `calc(${sc}% - 7px)`, transform: 'translateY(-50%)', background: color }} />}
      </div>
      {sc != null && <div className="text-[10.5px] text-gray-400 mt-1">Better than {sc}% of our {kind}{MET[m].good === 'low' ? ' (lower is better)' : ''}</div>}
    </div>
  );
}

/** Watch the ad and read it like AfterLife shows it — or open its AfterLife page right here. */
function CreativeViewer({ c, initialPeriod, bench, lastDay, onClose }) {
  const [tab, setTab] = useState('ad');
  const [period, setPeriod] = useState(initialPeriod);
  const [videoBad, setVideoBad] = useState(false);
  const [fileBad, setFileBad] = useState(false);
  const [frame, setFrame] = useState({ url: null, error: null, loading: false });
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prevOverflow; };
  }, [onClose]);
  useEffect(() => {
    if (tab !== 'afterlife' || !c.asset_id || frame.url || frame.loading) return;
    if (!LIVE) { setFrame({ url: null, error: 'The AfterLife view opens on the live CP (the local preview has no AfterLife).', loading: false }); return; }
    setFrame({ url: null, error: null, loading: true });
    apiGet(`/growth/afterlife-pass?to=${encodeURIComponent(`/embed/asset/${c.asset_id}`)}`)
      .then(r => setFrame({ url: r.url, error: null, loading: false }))
      .catch(e => setFrame({ url: null, error: e.message, loading: false }));
  }, [tab, c.asset_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const kind = fmtOf(c) === 'video' ? 'videos' : 'statics';
  const cur = curOf(c, period), prev = prevOf(c, period);
  const M = c.vs?.metrics || {};
  const metricKeys = (fmtOf(c) === 'video' ? ['hook', 'hold', 'avg_watch', 'p50', 'ctr', 'roas', 'aov', 'cpa'] : ['ctr', 'roas', 'aov', 'cpa', 'cpm']).filter(m => M[m]);
  const v = verdictMeta(c);
  const insights = insightsOf(c);
  const running = dayDiff(c.first_spend, lastDay);
  const pts = period === 'month'
    ? (c.wseries || []).map(w => ({ key: w.end, label: `Week to ${fmtDay(w.end, { day: 'numeric', month: 'short' })}`, short: fmtDay(w.end, { day: 'numeric', month: 'numeric' }), value: w.spend }))
    : (c.series || []).slice(period === 'day' ? -14 : -28).map(s => ({ key: s.d, label: fmtDay(s.d), short: fmtDay(s.d, { day: 'numeric' }), value: s.spend, title: `${fmtDay(s.d)}: ${money(s.spend)} · ROAS ${x2(s.roas)}` }));
  const stats = [
    ['Spend', money(cur.spend), change(cur.spend, prev.spend)], ['ROAS', cur.roas != null ? `${x2(cur.roas)}×` : '—', change(cur.roas, prev.roas)],
    ['Purchases', int(cur.purchases), change(cur.purchases, prev.purchases)], ['CTR', pct(cur.ctr, 2), change(cur.ctr, prev.ctr)],
    ...(fmtOf(c) === 'video' ? [['Thumb-stop', pct(cur.hook, 0), change(cur.hook, prev.hook)], ['Avg watch', cur.avg_watch != null ? `${cur.avg_watch.toFixed(1)}s` : '—', change(cur.avg_watch, prev.avg_watch)]]
      : [['AOV', money(cur.aov, { exact: true }), change(cur.aov, prev.aov)], ['CPA', money(cur.cpa, { exact: true }), change(cur.cpa, prev.cpa), true]]),
  ];
  const periodLabel = period === 'day' ? 'the last day' : period === 'month' ? 'the last 4 weeks' : 'the last 7 days';

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-stretch sm:items-center justify-center bg-[#030b2e]/60 backdrop-blur-sm sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }} role="dialog" aria-modal="true" aria-label={c.label}>
      <div className="bg-[#f6f7fb] w-full sm:max-w-[1180px] sm:max-h-[92vh] sm:rounded-3xl overflow-hidden flex flex-col shadow-2xl">
        <div className="bg-white border-b border-gray-200 px-4 sm:px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1 basis-[260px]">
            <div className="flex items-center gap-1.5 mb-0.5">
              {c.live && <span className="flex items-center gap-1 text-[9.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded text-white" style={{ background: RED }}><span className="w-1 h-1 rounded-full bg-white" />Live</span>}
              {c.new && <span className="text-[9.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border" style={{ color: RED, borderColor: `${RED}55` }}>New</span>}
              <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: v[1] }}>{v[0]}</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1 text-[16px] sm:text-[18px] font-bold leading-snug truncate" style={{ color: NAVY }} title={c.label}>{c.label}</div>
              <button type="button" onClick={onClose} className="sm:hidden -mt-1 -mr-1 p-2 rounded-xl hover:bg-gray-100 text-gray-500 flex-none" aria-label="Close"><X size={20} /></button>
            </div>
            <div className="text-[12px] text-gray-500 truncate">{[c.maker || 'Unknown maker', TEAM_LABEL[c.team], c.product, c.campaign].filter(Boolean).join(' · ')}</div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {c.asset_id && <Segmented size="sm" value={tab} onChange={setTab} options={[['ad', 'The ad', Eye], ['afterlife', 'AfterLife view', Sparkles]]} label="View" />}
            {c.afterlife && <a href={c.afterlife} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-xl bg-white border border-gray-200 hover:border-gray-300" style={{ color: NAVY }}>AfterLife <ArrowUpRight size={12} /></a>}
            {c.ads_manager && <a href={c.ads_manager} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs font-semibold px-3 py-2 rounded-xl bg-white border border-gray-200 hover:border-gray-300" style={{ color: NAVY }}>Ads Manager <ArrowUpRight size={12} /></a>}
            <button type="button" onClick={onClose} className="hidden sm:block p-2 rounded-xl hover:bg-gray-100 text-gray-500" aria-label="Close"><X size={18} /></button>
          </div>
        </div>

        {tab === 'afterlife' ? (
          <div className="flex-1 min-h-[70vh] bg-white relative">
            {frame.loading && <div className="absolute inset-0 flex items-center justify-center text-gray-400"><Loader2 className="animate-spin" /></div>}
            {frame.error && <div className="p-10 text-center text-sm text-gray-500">{frame.error}</div>}
            {frame.url && <iframe title={`${c.label} in AfterLife`} src={frame.url} className="absolute inset-0 w-full h-full border-0" allow="autoplay; fullscreen" />}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="grid gap-4 p-4 sm:p-5 md:grid-cols-[minmax(0,400px)_1fr]">
              <div className="flex flex-col gap-3">
                <div className="rounded-2xl overflow-hidden bg-black aspect-[4/5] relative">
                  {c.format === 'video' && c.video_url && !videoBad
                    ? <video key={c.video_url} src={c.video_url} poster={c.thumb || c.thumb_url || undefined} controls autoPlay muted loop playsInline onError={() => setVideoBad(true)} className="absolute inset-0 w-full h-full object-contain bg-black" />
                    : c.format !== 'video' && c.file_url && !fileBad
                      ? <img src={c.file_url} alt="" onError={() => setFileBad(true)} className="absolute inset-0 w-full h-full object-contain bg-black" />
                      : <Thumb c={c} contain className="w-full h-full" />}
                </div>
                {c.format === 'video' && (videoBad || !c.video_url) && <div className="text-[11.5px] text-gray-500">This video can’t play here — {c.asset_id ? 'try the AfterLife view.' : 'Meta didn’t hand over a playable link (open it in Ads Manager).'}</div>}
                {c.body && (
                  <div className="rounded-2xl bg-white border border-gray-200 p-3.5">
                    <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-1">The ad copy</div>
                    <p className="text-[13px] leading-relaxed text-gray-700 whitespace-pre-line">{c.body}</p>
                  </div>
                )}
                <div className="rounded-2xl bg-white border border-gray-200 p-3.5 text-[12px] text-gray-600 grid grid-cols-2 gap-y-1.5">
                  <span className="text-gray-400">Started</span><span className="font-semibold text-right" style={{ color: NAVY }}>{fmtDay(c.first_spend)}{running != null ? ` · day ${running + 1}` : ''}</span>
                  <span className="text-gray-400">Lifetime</span><span className="font-semibold text-right" style={{ color: NAVY }}>{money(c.lifetime?.spend)}{c.lifetime?.roas != null ? ` · ${x2(c.lifetime.roas)}×` : ''}</span>
                  <span className="text-gray-400">Running in</span><span className="font-semibold text-right" style={{ color: NAVY }}>{c.ads} ad{c.ads === 1 ? '' : 's'}</span>
                </div>
              </div>

              <div className="flex flex-col gap-4 min-w-0">
                <div className="rounded-2xl bg-white border border-gray-200 p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400">How it’s doing · {periodLabel}</div>
                    <span className="ml-auto"><Segmented size="sm" value={period} onChange={setPeriod} options={PERIODS} label="Period" /></span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {stats.map(([k, val, d, inv]) => (
                      <div key={k}><div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{k}</div><div className="text-[22px] font-black tabular-nums leading-tight" style={{ ...DISPLAY, color: NAVY }}>{val}</div><Delta v={d} small invert={!!inv} /></div>
                    ))}
                  </div>
                  <div className="mt-3"><TrendChart points={pts} fmt={money} height={84} /></div>
                  <div className="flex items-center gap-4 text-[12px] text-gray-500 mt-2">
                    <span className="inline-flex items-center gap-1" title="Comments"><MessageCircle size={13} />{int(cur.comments)}</span>
                    <span className="inline-flex items-center gap-1" title="Reactions"><Heart size={13} />{int(cur.reactions)}</span>
                    <span className="inline-flex items-center gap-1" title="Shares"><Share2 size={13} />{int(cur.shares)}</span>
                    <span className="inline-flex items-center gap-1" title="Saves"><Bookmark size={13} />{int(cur.saves)}</span>
                    <span className="ml-auto text-[10.5px] text-gray-400">vs {period === 'day' ? 'the day before' : period === 'month' ? 'the 4 weeks before' : 'the 7 days before'}</span>
                  </div>
                </div>

                {insights.length > 0 && (
                  <div className="rounded-2xl bg-white border border-gray-200 p-4">
                    <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-2">What makes it different</div>
                    <ul className="flex flex-col gap-2">
                      {insights.map((ins, i) => (
                        <li key={i} className="flex gap-2 text-[13px] leading-snug" style={{ color: TONE[ins.tone] }}>
                          {ins.tone === 'good' ? <ThumbsUp size={14} className="flex-none mt-0.5" /> : <Sparkles size={14} className="flex-none mt-0.5" />}{ins.text}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {metricKeys.length > 0 && (
                  <div className="rounded-2xl bg-white border border-gray-200 p-4">
                    <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400">Against our {kind} this year{c.vs?.basis === 'year' ? ' · since it started' : ''}</div>
                    <div className="grid sm:grid-cols-2 gap-x-6 divide-y sm:divide-y-0 divide-gray-50">
                      {metricKeys.map(m => <PercentileBar key={m} m={m} x={M[m]} kind={kind} />)}
                    </div>
                    {bench && <div className="text-[10.5px] text-gray-400 mt-1">Compared with our internal team’s {kind} with $300+ spend, {bench.since ? bench.since.slice(0, 4) : 'this year'}.</div>}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

// The Creative team sees what runs when — no money (25 Nov 2026; the server strips it too)
const CreativeOnAir = lazy(() => import('../../components/onair/CreativeOnAir'));
export default function OnAirPage() {
  const { isCreative } = useAuth();
  return isCreative ? <Suspense fallback={null}><CreativeOnAir /></Suspense> : <OnAirFull />;
}

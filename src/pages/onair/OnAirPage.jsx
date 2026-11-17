// On Air (17 Nov 2026): what's running right now — on TV from the media agency's daily reports (read from Gmail at
// 17:00, synced with the TV Library by creative code) and on Meta from AfterLife (live creatives, who made them, when they
// started, spend, ROAS, CTR, AOV, thumb-stop, watch time, comments). Growth and the general CP see the same page.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Tv, Smartphone, RefreshCw, Loader2, AlertTriangle, Mail, ExternalLink, Play, ArrowUpRight, ArrowDownRight, Sparkles,
  MessageCircle, Heart, Share2, Bookmark, Search, X, ChevronDown, Send, CheckCircle2, Radio, Film, Clock, Plug,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import { onairApi, LIVE } from '../../lib/onairService';
import { meApi } from '../../lib/meService';

const NAVY = '#030b2e';
const BLUE = '#0808f8';
const RED = '#e2445c';
const GREEN = '#00a35c';
const AMBER = '#c27c0e';
const DISPLAY = { fontFamily: '"Sofia Sans Extra Condensed", sans-serif' };

// ── formatting
const money = (v, { exact = false } = {}) => {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v), a = Math.abs(n), s = n < 0 ? '−' : '';
  if (!exact && a >= 1e6) return `${s}$${(a / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (!exact && a >= 1e4) return `${s}$${Math.round(a / 1e3)}k`;
  if (!exact && a >= 1e3) return `${s}$${(a / 1e3).toFixed(1)}k`;
  return `${s}$${Math.round(a).toLocaleString('en-US')}`;
};
const signedMoney = (v) => (v == null ? null : `${v >= 0 ? '+' : '−'}${money(Math.abs(v))}`);
const pct = (v, d = 1) => (v == null ? '—' : `${(v * 100).toFixed(d)}%`);
const x2 = (v) => (v == null ? '—' : `${Number(v).toFixed(2)}`);
const int = (v) => (v == null ? '—' : Math.round(v).toLocaleString('en-US'));
const DATE = /^\d{4}-\d{2}-\d{2}/;
const fmtDay = (d, o = { weekday: 'short', day: 'numeric', month: 'short' }) => (d && DATE.test(d) ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-GB', { ...o, timeZone: 'UTC' }) : '—');
const fmtTime = (iso) => (iso ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' }) : '—');
const todayIL = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const daysSince = (d) => (d && DATE.test(d) ? Math.round((Date.parse(`${todayIL()}T12:00:00Z`) - Date.parse(`${d.slice(0, 10)}T12:00:00Z`)) / 86400000) : null);
const first = (n) => String(n || '').trim().split(/\s+/)[0];
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

/** MER / ROAS colour against a reference (the product's or the account's own average) */
const vsRef = (v, ref) => (v == null || ref == null ? NAVY : v >= ref * 1.1 ? GREEN : v <= ref * 0.85 ? RED : AMBER);

function Delta({ v, fmt = (n) => n, suffix = '', invert = false, small = false }) {
  if (v == null || !Number.isFinite(v) || v === 0) return null;
  const up = v > 0;
  const good = invert ? !up : up;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return <span className={`inline-flex items-center gap-0.5 font-semibold ${small ? 'text-[10.5px]' : 'text-[11.5px]'}`} style={{ color: good ? GREEN : RED }}><Icon size={small ? 11 : 13} />{fmt(Math.abs(v))}{suffix}</span>;
}

// ── tiny charts (one measure each — never two scales on one chart)
function Bars({ values, labels = [], height = 56, color = BLUE, fmt = money, highlightLast = true }) {
  const max = Math.max(1, ...values.map(v => v || 0));
  const w = 100 / Math.max(1, values.length);
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img">
      {values.map((v, i) => {
        const h = v ? Math.max(1.5, (v / max) * (height - 2)) : 0;
        const last = highlightLast && i === values.length - 1;
        return (
          <g key={i}>
            <rect x={i * w + w * 0.14} y={0} width={w * 0.72} height={height} fill="transparent"><title>{`${labels[i] || ''} ${fmt(v)}`.trim()}</title></rect>
            {h > 0 && <rect x={i * w + w * 0.14} y={height - h} width={w * 0.72} height={h} rx="1.2" fill={color} opacity={last ? 1 : 0.45} style={{ pointerEvents: 'none' }} />}
          </g>
        );
      })}
    </svg>
  );
}
function Line({ values, labels = [], height = 56, color = '#7e5bef', fmt = x2 }) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (pts.length < 2) return <div className="text-[11px] text-gray-400 flex items-center" style={{ height }}>Not enough days yet</div>;
  const min = Math.min(...pts.map(p => p[1])), max = Math.max(...pts.map(p => p[1]));
  const span = max - min || 1;
  const X = (i) => (values.length === 1 ? 50 : (i / (values.length - 1)) * 96 + 2);
  const Y = (v) => height - 4 - ((v - min) / span) * (height - 10);
  const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${X(i).toFixed(2)},${Y(v).toFixed(2)}`).join(' ');
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }} role="img">
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      {pts.map(([i, v]) => (
        <g key={i}>
          <circle cx={X(i)} cy={Y(v)} r="5" fill="transparent"><title>{`${labels[i] || ''} ${fmt(v)}`.trim()}</title></circle>
        </g>
      ))}
    </svg>
  );
}

function Tile({ label, value, sub, accent = NAVY, delta, className = '' }) {
  return (
    <div className={`rounded-2xl bg-white border border-gray-200 px-4 py-3 min-w-0 ${className}`}>
      <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400">{label}</div>
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

const H2 = ({ children, aside }) => (
  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2">
    <h2 className="font-black uppercase text-[22px] sm:text-[24px] leading-none" style={{ ...DISPLAY, color: NAVY }}>{children}</h2>
    {aside}
  </div>
);

export default function OnAirPage() {
  const { isGrowth } = useAuth();
  const { brandId } = useBrand();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'meta' ? 'meta' : 'tv';
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
          <p className="text-sm text-gray-500 mt-1.5 max-w-[760px]">What’s running right now — on TV from the media agency’s daily report, on Meta from AfterLife. {isGrowth ? '' : 'The TV Library’s on-air dots follow the TV report.'}</p>
        </div>
        <nav className="grid grid-cols-2 sm:flex gap-1 p-1 rounded-2xl bg-white border border-gray-200 w-full sm:w-auto" role="tablist" aria-label="On Air">
          {[['tv', 'TV', Tv], ['meta', 'Meta ads', Smartphone]].map(([k, label, Icon]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setParams(k === 'tv' ? {} : { tab: k })}
              className={`flex items-center justify-center gap-1.5 text-sm font-semibold px-4 py-2 rounded-xl whitespace-nowrap transition-colors ${tab === k ? 'text-white' : 'text-gray-600 hover:bg-gray-100'}`}
              style={tab === k ? { background: NAVY } : undefined}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </nav>
      </div>
      {!LIVE && <div className="mb-3 text-[11px] font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">Local preview — made-up data (the live page reads the agency’s emails and AfterLife).</div>}
      {tab === 'tv' ? <TvTab /> : <MetaTab />}
    </div>
  );
}

// ═══════════════════════════════════════ TV ═══════════════════════════════════════

function TvTab() {
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
  const products = data.products || [];
  const shown = product ? products.filter(p => p.product === product) : products;
  const needsReconnect = !data.google?.connected || data.google?.can_read === false || data.sync?.needs_reconnect;

  return (
    <div className="flex flex-col gap-5">
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
              {p.product} <span className="opacity-60 tabular-nums">{money(p.week.spent)}</span>
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-[11px] text-gray-500">
          <Clock size={12} /> Read every day at 17:00{data.sync?.at ? ` · last read ${fmtTime(data.sync.at)}` : ''}
          {isEditor && canRead && <button type="button" onClick={refresh} disabled={busy} className="flex items-center gap-1 font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-gray-300 text-gray-700 disabled:opacity-50"><RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> {busy ? 'Reading…' : 'Read now'}</button>}
        </div>
      </div>
      {error && <div className="px-4 py-2 rounded-xl bg-red-50 text-red-700 text-xs">{error}</div>}

      {!products.length && canRead && <Empty icon={Tv} title="No agency reports yet">The next read is at 17:00{isEditor ? ' — or press “Read now”' : ''}. Reports are the daily “Particle … Campaign” emails from the agency.</Empty>}

      {shown.map(p => <ProductBlock key={p.product} p={p} />)}

      {(data.pipeline || []).length > 0 && <Pipeline items={data.pipeline} />}
      {(data.notes || []).length > 0 && <Notes notes={data.notes} />}
    </div>
  );
}

function ProductBlock({ p }) {
  const { isGrowth } = useAuth();
  const nav = useNavigate();
  const [more, setMore] = useState(false);
  const [all, setAll] = useState(false);
  const w = p.week || {};
  const ld = p.last_day;
  const fresh = p.spots.filter(s => s.is_new).length;
  const libPath = isGrowth ? '/tv-library' : '/library';
  const spots = all ? p.spots : p.spots.slice(0, 9);
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <h2 className="font-black uppercase text-[30px] sm:text-[36px] leading-none" style={{ ...DISPLAY, color: NAVY }}>{p.product}</h2>
        <span className="text-xs text-gray-500 pb-1">Week of {fmtDay(p.week_of, { day: 'numeric', month: 'short' })} · report of {fmtDay(p.report_date)}{p.received_at ? ` (in ${fmtTime(p.received_at).split(', ').pop()})` : ''}</span>
        {fresh > 0 && <span className="mb-1 inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: RED }}><Sparkles size={11} /> {fresh} new on air</span>}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 sm:gap-3">
        <Tile label="Spent this week" value={money(w.spent)} sub={ld ? <>Yesterday {money(ld.spend)} <Delta v={ld.vs?.spend} fmt={money} small /></> : null} />
        <Tile label="Orders" value={int(w.orders)} sub={ld ? <>Yesterday {int(ld.orders)} <Delta v={ld.vs?.orders} small /></> : null} />
        <Tile label="MER" value={x2(w.mer)} accent={vsRef(w.mer, p.lifetime?.mer)} sub={ld ? <>Yesterday {x2(ld.mer)} <Delta v={ld.vs?.mer} fmt={x2} small /></> : 'revenue ÷ spend'} />
        <Tile label="AOV" value={money(w.aov, { exact: true })} sub="per order" />
        <Tile label="CPO" value={money(w.cpo, { exact: true })} sub="spend per order" className="col-span-2 md:col-span-1" />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.1fr]">
        <div className="rounded-2xl bg-white border border-gray-200 p-4">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-2">Spend per day · this week</div>
          <Bars values={p.daily.map(d => d.spend)} labels={p.daily.map(d => fmtDay(d.date))} />
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">{p.daily.map(d => <span key={d.date}>{fmtDay(d.date, { weekday: 'narrow' })}</span>)}</div>
        </div>
        <div className="rounded-2xl bg-white border border-gray-200 p-4">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-2">MER per day · this week</div>
          <Line values={p.daily.map(d => d.mer)} labels={p.daily.map(d => fmtDay(d.date))} />
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">{p.daily.map(d => <span key={d.date}>{x2(d.mer)}</span>)}</div>
        </div>
        <div className="rounded-2xl bg-white border border-gray-200 p-4">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-2">Spend per week · last {p.weekly.length}</div>
          <Bars values={p.weekly.map(d => d.spend)} labels={p.weekly.map(d => `Week of ${fmtDay(d.date, { day: 'numeric', month: 'short' })} · MER ${x2(d.mer)}`)} color="#3d47ff" />
          <div className="flex justify-between text-[10px] text-gray-400 mt-1">{p.weekly.map(d => <span key={d.date} title={`MER ${x2(d.mer)}`}>{x2(d.mer)}</span>)}</div>
        </div>
      </div>

      {p.note?.text && (
        <div className="rounded-2xl border border-gray-200 bg-[#f7f8ff] p-4 flex gap-3">
          <span className="flex-none w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white" style={{ background: '#5a63a8' }}>AG</span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] text-gray-500 flex flex-wrap items-center gap-x-2">The agency · {fmtTime(p.note.at)}{p.note.link && <a href={p.note.link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-[#0808f8] hover:underline">Open the email <ExternalLink size={11} /></a>}</div>
            <p className="text-[13.5px] leading-relaxed mt-1 whitespace-pre-line" style={{ color: NAVY }}>{p.note.text}</p>
          </div>
        </div>
      )}

      <div>
        <H2 aside={<span className="text-xs text-gray-400">{p.spots.length} spot{p.spots.length === 1 ? '' : 's'} this week · biggest spend first{p.previous_report ? ` · movement since the ${fmtDay(p.previous_report, { day: 'numeric', month: 'short' })} report` : ''}</span>}>On air now</H2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {spots.map(s => <SpotCard key={s.code} s={s} weekMer={w.mer} onLibrary={() => nav(libPath)} />)}
        </div>
        {p.spots.length > 9 && <button type="button" onClick={() => setAll(!all)} className="mt-2 text-xs font-semibold text-[#0808f8] hover:underline">{all ? 'Show fewer' : `Show all ${p.spots.length}`}</button>}
      </div>

      {(p.placements.length > 0 || p.dayparts.length > 0) && (
        <div className="rounded-2xl bg-white border border-gray-200">
          <button type="button" onClick={() => setMore(!more)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
            <span className="text-[13px] font-bold" style={{ color: NAVY }}>Big placements{p.dayparts.length ? ' & dayparts' : ''}</span>
            <span className="text-xs text-gray-400">{p.placements.length + p.dayparts.length} rows</span>
            <ChevronDown size={15} className={`ml-auto text-gray-400 transition-transform ${more ? 'rotate-180' : ''}`} />
          </button>
          {more && (
            <div className="px-4 pb-4 overflow-x-auto">
              <table className="w-full text-[12.5px] min-w-[560px]">
                <thead><tr className="text-left text-[10.5px] font-bold uppercase tracking-wider text-gray-400">
                  {['Where', 'When', 'Creative', 'Cost', 'Orders', 'MER', 'CPO / CPV'].map(h => <th key={h} className="py-1.5 pr-3 font-bold">{h}</th>)}
                </tr></thead>
                <tbody className="divide-y divide-gray-50">
                  {p.placements.map((r, i) => (
                    <tr key={`p${i}`}><td className="py-1.5 pr-3 font-semibold" style={{ color: NAVY }}>{r.network}{r.date ? <span className="text-gray-400 font-normal"> · {fmtDay(r.date, { day: 'numeric', month: 'short' })}</span> : ''}</td>
                      <td className="py-1.5 pr-3 text-gray-500">{r.period || '—'}</td><td className="py-1.5 pr-3">{r.creative || '—'}</td><td className="py-1.5 pr-3 tabular-nums">{money(r.cost)}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{int(r.orders)}</td><td className="py-1.5 pr-3 tabular-nums font-semibold" style={{ color: vsRef(r.mer, w.mer) }}>{x2(r.mer)}</td><td className="py-1.5 pr-3 tabular-nums text-gray-500">{r.cpv != null ? `CPV ${money(r.cpv, { exact: true })}` : '—'}</td></tr>
                  ))}
                  {p.dayparts.map((r, i) => (
                    <tr key={`d${i}`}><td className="py-1.5 pr-3 font-semibold" style={{ color: NAVY }}>Fox News</td><td className="py-1.5 pr-3 text-gray-500">{r.daypart}</td><td className="py-1.5 pr-3">{r.creative}</td>
                      <td className="py-1.5 pr-3 tabular-nums">{money(r.cost)}</td><td className="py-1.5 pr-3 tabular-nums">{int(r.orders)}</td><td className="py-1.5 pr-3 tabular-nums font-semibold" style={{ color: vsRef(r.mer, w.mer) }}>{x2(r.mer)}</td>
                      <td className="py-1.5 pr-3 tabular-nums text-gray-500">{r.cpo != null ? `CPO ${money(r.cpo, { exact: true })}` : '—'}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function SpotCard({ s, weekMer, onLibrary }) {
  const lib = s.library;
  const title = lib?.title || s.name;
  const m = s.moved;
  return (
    <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden flex flex-col">
      <div className="flex gap-3 p-3">
        <div className="relative flex-none w-[104px] aspect-video rounded-xl overflow-hidden bg-gradient-to-br from-[#0b1550] to-[#2a35b8] flex items-center justify-center">
          {lib?.thumb_url ? <img src={lib.thumb_url} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" /> : <Film size={20} className="text-white/50" />}
          {lib?.url && <a href={lib.url} target="_blank" rel="noreferrer" className="absolute inset-0 flex items-center justify-center bg-black/0 hover:bg-black/30 transition-colors group" aria-label={`Watch ${title}`}><span className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center opacity-90 group-hover:scale-105 transition-transform"><Play size={14} className="ml-0.5" style={{ color: NAVY }} /></span></a>}
          {s.is_new && <span className="absolute top-1 left-1 text-[9.5px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded text-white" style={{ background: RED }}>New</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold leading-snug line-clamp-2" style={{ color: NAVY }} title={title}>{title}</div>
          <div className="text-[11px] text-gray-400 truncate">{[s.code, s.length ? `:${s.length}` : null, lib?.production_name].filter(Boolean).join(' · ')}</div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-black tabular-nums text-[24px] leading-none" style={{ ...DISPLAY, color: NAVY }}>{money(s.spent)}</span>
            {s.share != null && <span className="text-[11px] text-gray-400">{pct(s.share, 0)} of the week</span>}
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (s.share || 0) * 100)}%`, background: BLUE }} /></div>
        </div>
      </div>
      <div className="grid grid-cols-4 border-t border-gray-100 text-center">
        {[['Orders', int(s.orders)], ['MER', x2(s.mer), vsRef(s.mer, weekMer)], ['CPO', money(s.cpo)], ['AOV', money(s.aov)]].map(([k, v, c]) => (
          <div key={k} className="py-2"><div className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{k}</div><div className="text-[13.5px] font-semibold tabular-nums" style={{ color: c || NAVY }}>{v}</div></div>
        ))}
      </div>
      <div className="px-3 py-2 border-t border-gray-100 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] mt-auto">
        {m && (m.spent || m.orders) ? (
          <span className="text-gray-600">Since last report: <b className="text-[#030b2e]">{signedMoney(m.spent)}</b>{m.orders ? <> · <b className="text-[#030b2e]">{m.orders > 0 ? '+' : ''}{m.orders}</b> orders</> : null}</span>
        ) : s.new_in_report ? <span className="font-semibold" style={{ color: RED }}>First time in the report</span> : <span className="text-gray-400">No change since the last report</span>}
        {s.is_new && s.first_seen && <span className="text-gray-500">On air since {fmtDay(s.first_seen, { day: 'numeric', month: 'short' })}</span>}
        <span className="ml-auto">{lib ? <button type="button" onClick={onLibrary} className="font-semibold text-[#0808f8] hover:underline">TV Library</button> : <span className="text-gray-400" title="No commercial in the TV Library has this code">Not in the TV Library</span>}</span>
      </div>
      {s.stations?.length > 0 && (
        <div className="px-3 pb-2.5 flex flex-wrap gap-1">
          {s.stations.map(st => <span key={st.station} className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-[#f0f1fb] text-[#3a4170]" title={`${money(st.spent)} · ${int(st.orders)} orders · MER ${x2(st.mer)}`}>{st.station.replace(/^OTT-/, 'OTT · ')}</span>)}
        </div>
      )}
    </div>
  );
}

const STEPS = [['sent', 'Sent to the agency', Send, 'Sent'], ['confirmed', 'Agency confirmed', CheckCircle2, 'Confirmed'], ['on_air', 'On air', Radio, 'On air']];
function Pipeline({ items }) {
  return (
    <section>
      <H2 aside={<span className="text-xs text-gray-400">new creatives the team emailed the agency, last 60 days</span>}>From us to the networks</H2>
      <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100">
        {items.map((it, i) => {
          const at = STEPS.findIndex(([k]) => k === it.status);
          return (
            <div key={i} className="px-4 py-3 grid gap-3 lg:grid-cols-[1.3fr_1.4fr_1fr] items-center">
              <div className="min-w-0">
                <div className="text-[14px] font-semibold truncate" style={{ color: NAVY }}>{it.title}</div>
                <div className="text-[11px] text-gray-400 truncate">{[it.product, `sent by ${first(it.sent_by)} · ${fmtTime(it.sent_at)}`, it.library?.code].filter(Boolean).join(' · ')}</div>
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
    </section>
  );
}

function Notes({ notes }) {
  const [all, setAll] = useState(false);
  const list = all ? notes : notes.slice(0, 4);
  return (
    <section>
      <H2 aside={<span className="text-xs text-gray-400">the agency’s notes and replies, newest first</span>}>What the agency says</H2>
      <div className="grid gap-2 md:grid-cols-2">
        {list.map((n, i) => (
          <div key={i} className="rounded-2xl bg-white border border-gray-200 p-3.5">
            <div className="flex items-center gap-2 text-[11px] text-gray-500">
              <span className={`font-bold px-1.5 py-0.5 rounded ${n.kind === 'report' ? 'bg-[#eef0ff] text-[#0808f8]' : 'bg-gray-100 text-gray-600'}`}>{n.kind === 'report' ? 'Daily report' : 'Reply'}</span>
              <span className="truncate">{n.product ? `${n.product} · ` : ''}{fmtTime(n.at)}</span>
              {n.link && <a href={n.link} target="_blank" rel="noreferrer" className="ml-auto text-gray-400 hover:text-[#0808f8]" aria-label="Open the email"><ExternalLink size={12} /></a>}
            </div>
            {n.kind !== 'report' && <div className="text-[12px] font-semibold mt-1 truncate" style={{ color: NAVY }}>{n.subject}</div>}
            <p className="text-[13px] leading-relaxed text-gray-700 mt-1 line-clamp-5 whitespace-pre-line">{n.text}</p>
            {n.networks?.length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{n.networks.map(x => <span key={x} className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-[#f0f1fb] text-[#3a4170]">{x}</span>)}</div>}
          </div>
        ))}
      </div>
      {notes.length > 4 && <button type="button" onClick={() => setAll(!all)} className="mt-2 text-xs font-semibold text-[#0808f8] hover:underline">{all ? 'Show fewer' : `Show all ${notes.length}`}</button>}
    </section>
  );
}

// ═══════════════════════════════════════ META ═══════════════════════════════════════

const SORTS = [['spend', '7-day spend'], ['roas', 'ROAS'], ['newest', 'Newest'], ['movers', 'Biggest movers']];
function MetaTab() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [show, setShow] = useState('live');
  const [q, setQ] = useState('');
  const [format, setFormat] = useState('');
  const [product, setProduct] = useState('');
  const [maker, setMaker] = useState('');
  const [lane, setLane] = useState('');
  const [sort, setSort] = useState('spend');
  const load = useCallback((force) => {
    setError(null); setBusy(!!force);
    onairApi.media(force).then(setData).catch(e => setError(e.message)).finally(() => setBusy(false));
  }, []);
  useEffect(() => load(false), [load]);

  const cs = data?.creatives || [];
  const options = useMemo(() => {
    const u = (xs) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return { products: u(cs.map(c => c.product)), makers: u(cs.map(c => c.maker)), lanes: u(cs.map(c => c.lane)) };
  }, [cs]);
  const growth = (c) => (c.prev7?.spend ? (c.d7.spend - c.prev7.spend) / c.prev7.spend : c.d7.spend ? 1 : 0);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const f = cs.filter(c => (show === 'all' || (show === 'live' ? c.live : c.new)) && (!format || c.format === format) && (!product || c.product === product)
      && (!maker || c.maker === maker) && (!lane || c.lane === lane)
      && (!needle || [c.label, c.maker, c.product, c.campaign].filter(Boolean).some(v => v.toLowerCase().includes(needle))));
    const by = {
      spend: (a, b) => b.d7.spend - a.d7.spend,
      roas: (a, b) => (b.d7.roas ?? -1) - (a.d7.roas ?? -1),
      newest: (a, b) => String(b.first_spend || '').localeCompare(String(a.first_spend || '')),
      movers: (a, b) => Math.abs(growth(b)) * Math.log10(10 + b.d7.spend) - Math.abs(growth(a)) * Math.log10(10 + a.d7.spend),
    };
    return f.sort(by[sort]);
  }, [cs, show, q, format, product, maker, lane, sort]);

  if (error && !data) return <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>;
  if (!data) return <div className="py-20 text-center text-gray-400"><Loader2 className="inline animate-spin" /></div>;
  if (!data.connected) return <Empty icon={Smartphone} title="AfterLife isn’t connected">The Meta side comes from AfterLife — it needs AFTERLIFE_URL and its export token on the server.</Empty>;
  if (data.ready === false) return <Empty icon={Smartphone} title="AfterLife needs its update">{data.error || 'AfterLife hasn’t been updated with the On Air export yet.'} It shows here as soon as AfterLife is deployed.</Empty>;

  const tot = data.totals?.series || [];
  const lastT = tot[tot.length - 1], prevT = tot[tot.length - 2];
  const live = cs.filter(c => c.live);
  const newWeek = cs.filter(c => c.first_spend && daysSince(c.first_spend) != null && daysSince(c.first_spend) <= 7);
  const s7 = tot.slice(-7).reduce((a, t) => a + t.spend, 0), r7 = tot.slice(-7).reduce((a, t) => a + (t.roas || 0) * t.spend, 0);
  const sp = tot.slice(-14, -7).reduce((a, t) => a + t.spend, 0), rp = tot.slice(-14, -7).reduce((a, t) => a + (t.roas || 0) * t.spend, 0);
  const roas7 = s7 ? r7 / s7 : null, roasP = sp ? rp / sp : null;
  const starts = [...newWeek].sort((a, b) => String(b.first_spend).localeCompare(String(a.first_spend))).slice(0, 12);
  const filtered = !!(q || format || product || maker || lane);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-gray-500">
        <Clock size={12} /> Meta data through {fmtDay(data.last_day)} · from AfterLife{data.fetched_at ? ` · ${fmtTime(data.fetched_at)}` : ''}
        <button type="button" onClick={() => load(true)} disabled={busy} className="ml-auto flex items-center gap-1 font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-gray-300 text-gray-700 disabled:opacity-50"><RefreshCw size={12} className={busy ? 'animate-spin' : ''} /> Refresh</button>
        {data.afterlife_url && <a href={data.afterlife_url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-semibold px-2.5 py-1.5 rounded-lg bg-white border border-gray-200 hover:border-gray-300 text-gray-700">Open AfterLife <ArrowUpRight size={12} /></a>}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        <Tile label="Live now" value={int(live.length)} accent={RED} sub="creatives that spent on the last day" />
        <Tile label="New this week" value={int(newWeek.length)} sub="started spending in the last 7 days" />
        <Tile label={`Spend · ${fmtDay(lastT?.d, { weekday: 'short', day: 'numeric' })}`} value={money(lastT?.spend)} delta={<Delta v={lastT && prevT ? lastT.spend - prevT.spend : null} fmt={money} />} sub="all Meta, vs the day before" />
        <Tile label="ROAS · 7 days" value={x2(roas7)} delta={<Delta v={roas7 != null && roasP != null ? roas7 - roasP : null} fmt={x2} />} sub={`vs ${x2(roasP)} the 7 days before`} />
      </div>

      <div className="rounded-2xl bg-white border border-gray-200 p-4">
        <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-2">All Meta spend per day · {tot.length} days</div>
        <Bars values={tot.map(t => t.spend)} labels={tot.map(t => `${fmtDay(t.d)} · ROAS ${x2(t.roas)}`)} height={64} />
        <div className="flex justify-between text-[10px] text-gray-400 mt-1"><span>{fmtDay(tot[0]?.d, { day: 'numeric', month: 'short' })}</span><span>{fmtDay(lastT?.d, { day: 'numeric', month: 'short' })}</span></div>
      </div>

      {starts.length > 0 && (
        <section>
          <H2 aside={<span className="text-xs text-gray-400">first spend in the last 7 days, newest first</span>}>Just started</H2>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x" style={{ scrollbarWidth: 'thin' }}>
            {starts.map(c => {
              const day = daysSince(c.first_spend);
              return (
                <div key={c.key} className="snap-start flex-none w-[230px] rounded-2xl bg-white border border-gray-200 p-2.5 flex gap-2.5">
                  <Thumb c={c} className="w-14 h-[70px] rounded-lg flex-none" />
                  <div className="min-w-0">
                    <div className="text-[10.5px] font-bold" style={{ color: RED }}>{day === 0 ? 'Started today' : `Day ${day + 1}`} · {fmtDay(c.first_spend, { day: 'numeric', month: 'short' })}</div>
                    <div className="text-[12.5px] font-semibold leading-snug line-clamp-2" style={{ color: NAVY }}>{c.label}</div>
                    <div className="text-[11px] text-gray-400 truncate">{c.maker ? first(c.maker) : 'Unknown maker'} · {money(c.d7.spend)}{c.d7.roas != null ? ` · ${x2(c.d7.roas)}×` : ''}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-2 p-2 rounded-2xl bg-white border border-gray-200">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex bg-gray-100 rounded-xl p-0.5">
            {[['live', `Live ${live.length}`], ['new', `New ${cs.filter(c => c.new).length}`], ['all', `All ${cs.length}`]].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setShow(k)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${show === k ? 'bg-white shadow-sm text-[#030b2e]' : 'text-gray-500'}`}>{l}</button>
            ))}
          </div>
          <label className="relative flex-1 min-w-[160px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search creatives, makers, campaigns" className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-gray-300 outline-none" />
          </label>
          <Pick value={format} onChange={setFormat} label="Format" options={[['video', 'Video'], ['static', 'Static']]} />
          <Pick value={product} onChange={setProduct} label="Product" options={options.products.map(o => [o, o])} />
          <Pick value={maker} onChange={setMaker} label="Maker" options={options.makers.map(o => [o, o])} />
          {options.lanes.length > 1 && <Pick value={lane} onChange={setLane} label="Brand" options={options.lanes.map(o => [o, o])} />}
          <Pick value={sort} onChange={setSort} label="Sort" options={SORTS} always />
          {filtered && <button type="button" onClick={() => { setQ(''); setFormat(''); setProduct(''); setMaker(''); setLane(''); }} className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800 px-2 py-1.5 rounded-lg hover:bg-gray-100"><X size={13} /> Clear</button>}
        </div>
      </div>

      {!list.length && <Empty icon={Smartphone} title="Nothing matches">Try “All”, or clear the filters.</Empty>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {list.map(c => <CreativeCard key={c.key} c={c} />)}
      </div>
    </div>
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

function Thumb({ c, className = '' }) {
  const src = c.thumb || c.thumb_url;
  const [bad, setBad] = useState(false);
  return (
    <div className={`relative overflow-hidden bg-gradient-to-br from-[#0b1550] to-[#2a35b8] flex items-center justify-center ${className}`}>
      {src && !bad ? <img src={src} alt="" loading="lazy" onError={() => setBad(true)} className="absolute inset-0 w-full h-full object-cover" /> : (c.format === 'video' ? <Play size={18} className="text-white/50" /> : <Smartphone size={18} className="text-white/50" />)}
    </div>
  );
}

function CreativeCard({ c }) {
  const d7 = c.d7, p7 = c.prev7 || {};
  const running = daysSince(c.first_spend);
  const spendChange = p7.spend ? (d7.spend - p7.spend) / p7.spend : null;
  const metrics = [
    ['ROAS', d7.roas != null ? `${x2(d7.roas)}×` : '—', d7.roas != null && p7.roas != null ? d7.roas - p7.roas : null, x2],
    ['CTR', pct(d7.ctr, 2), d7.ctr != null && p7.ctr != null ? (d7.ctr - p7.ctr) * 100 : null, (v) => `${v.toFixed(2)}pt`],
    ['AOV', d7.aov != null ? money(d7.aov, { exact: true }) : '—'],
    ...(c.format === 'video' ? [
      ['Thumb-stop', pct(d7.hook ?? c.d28?.hook, 0)],
      ['Avg watch', c.d28?.avg_watch != null ? `${c.d28.avg_watch.toFixed(1)}s` : '—'],
      ['Hold', pct(c.d28?.hold, 0)],
    ] : [
      ['Purchases', int(d7.purchases)],
      ['CPA', money(c.d28?.cpa, { exact: true })],
      ['28-day ROAS', c.d28?.roas != null ? `${x2(c.d28.roas)}×` : '—'],
    ]),
  ];
  return (
    <div className="rounded-2xl bg-white border border-gray-200 overflow-hidden flex flex-col">
      <div className="flex gap-3 p-3">
        <div className="relative flex-none">
          <Thumb c={c} className="w-[88px] h-[110px] rounded-xl" />
          <div className="absolute top-1 left-1 flex flex-col gap-0.5">
            {c.live && <span className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded text-white" style={{ background: RED }}><span className="w-1 h-1 rounded-full bg-white" />Live</span>}
            {c.new && <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-white" style={{ color: RED }}>New</span>}
          </div>
        </div>
        <div className="min-w-0 flex-1 flex flex-col">
          <div className="text-[13.5px] font-semibold leading-snug line-clamp-2" style={{ color: NAVY }} title={c.label}>{c.label}</div>
          <div className="flex items-center gap-1.5 mt-1 min-w-0">
            <span className="flex-none w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{ background: c.maker ? '#5a63a8' : '#c4c7d6' }}>{c.maker ? initials(c.maker) : '?'}</span>
            <span className="text-[11.5px] text-gray-600 truncate">{c.maker || 'Unknown maker'}</span>
          </div>
          <div className="text-[11px] text-gray-400 truncate mt-0.5">{[c.product, c.campaign, c.format === 'video' ? 'Video' : 'Static'].filter(Boolean).join(' · ')}</div>
          <div className="text-[11px] text-gray-500 mt-0.5">{c.first_spend ? <>Since {fmtDay(c.first_spend, { day: 'numeric', month: 'short' })}{running != null ? ` · day ${running + 1}` : ''}</> : '—'}{c.ads > 1 ? ` · ${c.ads} ads` : ''}</div>
          <div className="mt-auto pt-1 flex items-baseline gap-2">
            <span className="font-black tabular-nums text-[24px] leading-none" style={{ ...DISPLAY, color: NAVY }}>{money(d7.spend)}</span>
            <span className="text-[10.5px] text-gray-400">7 days</span>
            <Delta v={spendChange != null ? spendChange * 100 : null} fmt={(v) => `${Math.round(v)}`} suffix="%" small />
          </div>
        </div>
      </div>
      <div className="px-3 -mt-1">
        <Bars values={(c.series || []).map(s => s.spend)} labels={(c.series || []).map(s => `${fmtDay(s.d)} · ROAS ${x2(s.roas)}`)} height={30} color={c.live ? BLUE : '#9aa1c7'} />
      </div>
      <div className="grid grid-cols-3 border-t border-gray-100 mt-2">
        {metrics.map(([k, v, delta, dfmt]) => (
          <div key={k} className="px-2 py-1.5 text-center border-b border-gray-50 [&:nth-child(3n+2)]:border-x [&:nth-child(3n+2)]:border-gray-50">
            <div className="text-[9.5px] font-bold uppercase tracking-wider text-gray-400 truncate">{k}</div>
            <div className="text-[13px] font-semibold tabular-nums leading-tight" style={{ color: NAVY }}>{v}</div>
            {delta != null && <Delta v={delta} fmt={dfmt} small />}
          </div>
        ))}
      </div>
      <div className="px-3 py-2 flex items-center gap-3 text-[11.5px] text-gray-500 mt-auto">
        <span className="inline-flex items-center gap-1" title="Comments, 7 days"><MessageCircle size={13} />{int(d7.comments)}</span>
        <span className="inline-flex items-center gap-1" title="Reactions, 7 days"><Heart size={13} />{int(d7.reactions)}</span>
        <span className="inline-flex items-center gap-1" title="Shares, 7 days"><Share2 size={13} />{int(d7.shares)}</span>
        <span className="inline-flex items-center gap-1" title="Saves, 7 days"><Bookmark size={13} />{int(d7.saves)}</span>
        <span className="ml-auto text-[10.5px] text-gray-400" title="Lifetime spend and ROAS">{money(c.lifetime?.spend)} total{c.lifetime?.roas != null ? ` · ${x2(c.lifetime.roas)}×` : ''}</span>
      </div>
    </div>
  );
}

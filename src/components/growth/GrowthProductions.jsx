// TV Productions for the Growth team (17 Nov 2026, redesigned the same day): a list made for "what's coming" —
// a Coming up strip (shoots, deliveries, on-air dates, deadlines), filters, and every production with its stage,
// product, producer, the internal editor / designer (from its Studio tickets) and what's next.
// No money: the server sends Growth the tracker without budgets, payments, contracts, suppliers or notes
// (backend lib/growth/productions.js). Local dev uses the tracker fixture, projected the same way.
import { useEffect, useMemo, useState } from 'react';
import { Search, Loader2, AlertTriangle, ChevronDown, Clapperboard, Film, Tv, Flag, CalendarClock, ExternalLink, X } from 'lucide-react';
import { apiGet } from '../../lib/apiClient';
import { useBrand } from '../../context/BrandContext';
import { getListItemColor } from '../../lib/listService';

const NAVY = '#030b2e';
const BLUE = '#0808f8';
const STAGE_ORDER = ['Production', 'Post', 'Pre Production', 'Pending', 'Wrap-up', 'Paused', 'Completed'];
const STEPS = ['Pre', 'Shoot', 'Post', 'Delivery', 'On air'];
const STEP_OF = { Pending: 0, 'Pre Production': 0, Production: 1, Post: 2, 'Wrap-up': 3, Completed: 4 };
const KIND = {
  shoot: { label: 'Shoot', icon: Clapperboard, color: '#ff7a1a' },
  delivery: { label: 'Delivery', icon: Film, color: '#00a35c' },
  air: { label: 'On air', icon: Tv, color: '#e2445c' },
  deadline: { label: 'Deadline', icon: Flag, color: BLUE },
  milestone: { label: 'Milestone', icon: CalendarClock, color: '#7e5bef' },
};
const CREW_ROLE = /edit|design|motion|anim|colou?r|vfx|sound|post/i;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const day = (v) => (v && DATE.test(String(v).slice(0, 10)) ? String(v).slice(0, 10) : null);
const utc = (d) => Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10));
const todayIL = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const diff = (a, b) => Math.round((utc(b) - utc(a)) / 86400000);
const fmt = (d, opts = { day: 'numeric', month: 'short' }) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' }) : '—');
const fmtDay = (d) => fmt(d, { weekday: 'short', day: 'numeric', month: 'short' });
const rel = (d, today) => {
  const n = diff(today, d);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? (n < 14 ? `in ${n}d` : `in ${Math.round(n / 7)}w`) : `${-n}d ago`;
};
const stageColor = (s) => getListItemColor('stages', s) || '#8b93c7';
const isDone = (s) => /^completed/i.test(s || '');
const first = (n) => String(n || '').trim().split(/\s+/)[0];
const initials = (n) => String(n || '?').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

/** Editors / designers: the people on its Studio tickets (Video board → editor, Design board → designer) + crew the tracker names. */
function crewOf(p, people) {
  const by = new Map();
  const add = (name, role, photo, open) => {
    if (!name) return;
    const k = name.toLowerCase();
    const cur = by.get(k) || { name, role, photo: photo || null, open: 0, tickets: 0 };
    cur.tickets += 1; cur.open += open ? 1 : 0;
    if (!cur.photo && photo) cur.photo = photo;
    if (cur.role !== role && role === 'Editor') cur.role = 'Editor';
    by.set(k, cur);
  };
  for (const t of p.tickets || []) for (const id of t.people || []) {
    const u = people?.[id];
    if (u) add(u.name, t.board === 'design' ? 'Designer' : 'Editor', u.photo, t.open);
  }
  for (const m of p.team || []) if (m.source === 'tracker' && CREW_ROLE.test(m.role || '')) add(m.name, m.role, m.photo, false);
  return [...by.values()].sort((a, b) => (a.role === 'Editor' ? 0 : 1) - (b.role === 'Editor' ? 0 : 1) || b.open - a.open || b.tickets - a.tickets);
}

/** Every dated thing about a production, soonest first. */
function eventsOf(p) {
  const out = [];
  for (const d of p.shoot?.days || []) if (day(d)) out.push({ date: day(d), kind: 'shoot' });
  if (day(p.dates?.delivery)) out.push({ date: day(p.dates.delivery), kind: 'delivery' });
  if (day(p.dates?.air)) out.push({ date: day(p.dates.air), kind: 'air' });
  if (day(p.deadline?.date)) out.push({ date: day(p.deadline.date), kind: 'deadline', text: p.deadline.label });
  if (p.milestone?.current?.end) out.push({ date: day(p.milestone.current.end), kind: 'milestone', text: `${p.milestone.current.title} ends` });
  if (p.milestone?.next?.start) out.push({ date: day(p.milestone.next.start), kind: 'milestone', text: p.milestone.next.title });
  return out.filter(e => e.date).sort((a, b) => a.date.localeCompare(b.date));
}

/** Local dev: the tracker fixture, projected like the server does (no money). */
function devProject(t) {
  return {
    today: t.today,
    people: t.people || {},
    productions: (t.productions || []).map(p => ({
      id: p.id, name: p.name, stage: p.stage, stage_since: p.stage_since, stage_days: p.stage_days,
      production_type: p.production_type || '', category: p.category || '', product_type: p.product_type || [], producer: p.producer || null,
      dates: p.dates || {}, shoot: p.shoot || { days: [], next: null },
      deadline: p.tracker?.deadline ? { date: p.tracker.deadline, label: p.tracker.deadline_label || '' } : null,
      health: p.tracker?.health || null, milestone: p.milestone || {},
      team: (p.team?.internal || []).map(m => ({ name: m.name, role: m.role, photo: m.photo || null, source: m.source })),
      tickets: p.tickets || [], signals: (p.signals || []).filter(s => ['overdue', 'blocked', 'due_soon', 'stuck_ticket'].includes(s.kind)),
    })),
  };
}

function Avatar({ name, photo, size = 26, ring = true }) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.38) };
  return photo
    ? <img src={photo} alt="" title={name} className={`rounded-full object-cover flex-none ${ring ? 'ring-2 ring-white' : ''}`} style={style} />
    : <span title={name} className={`rounded-full flex-none flex items-center justify-center font-bold text-white ${ring ? 'ring-2 ring-white' : ''}`} style={{ ...style, background: '#5a63a8' }}>{initials(name)}</span>;
}

function StagePill({ stage }) {
  const c = stageColor(stage);
  return <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap px-2 py-0.5 rounded-full" style={{ color: c, background: `${c}1a` }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{stage}</span>;
}

function Stepper({ stage }) {
  const at = STEP_OF[stage];
  if (at == null) return <span className="text-[11px] text-gray-400">{stage}</span>;
  return (
    <div className="flex items-center gap-1" aria-label={`Step: ${STEPS[at]}`}>
      {STEPS.map((s, i) => (
        <span key={s} title={s} className="h-1.5 rounded-full" style={{ width: i === at ? 22 : 10, background: i < at ? `${BLUE}66` : i === at ? BLUE : '#e5e7ef' }} />
      ))}
      <span className="text-[11px] font-semibold ml-1 text-gray-500 whitespace-nowrap">{STEPS[at]}</span>
    </div>
  );
}

function NextUp({ e, today }) {
  if (!e) return <span className="text-[12px] text-gray-400">Nothing dated</span>;
  const k = KIND[e.kind];
  const Icon = k.icon;
  const soon = diff(today, e.date) <= 7;
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <span className="flex-none w-6 h-6 rounded-lg flex items-center justify-center" style={{ background: `${k.color}17`, color: k.color }}><Icon size={13} /></span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[12.5px] font-semibold truncate" style={{ color: NAVY }}>{e.text || k.label}</span>
        <span className={`block text-[11px] ${soon ? 'font-semibold' : ''}`} style={{ color: soon ? k.color : '#8a90a6' }}>{fmtDay(e.date)} · {rel(e.date, today)}</span>
      </span>
    </span>
  );
}

function Select({ value, onChange, label, options }) {
  return (
    <label className="relative">
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}
        className={`appearance-none text-xs font-semibold pl-3 pr-7 py-2 rounded-xl border outline-none cursor-pointer ${value ? 'bg-[#eef0ff] border-[#0808f8]/30 text-[#0808f8]' : 'bg-gray-50 border-transparent text-gray-600'}`}>
        <option value="">{label}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
    </label>
  );
}

export default function GrowthProductions() {
  const { brandId } = useBrand();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [product, setProduct] = useState('');
  const [producer, setProducer] = useState('');
  const [editor, setEditor] = useState('');
  const [when, setWhen] = useState('');        // '' | shoot | delivery | air  (in the next 30 days)
  const [showDone, setShowDone] = useState(false);
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let on = true;
    setData(null); setError(null);
    const load = import.meta.env.DEV
      ? import('../tracker/dev/fixture').then(m => devProject(m.fixtureGet()))
      : apiGet(`/growth/productions?brand_id=${encodeURIComponent(brandId)}`);
    load.then(d => on && setData(d)).catch(e => on && setError(e.message));
    return () => { on = false; };
  }, [brandId]);

  const today = data?.today || todayIL();
  const rows = useMemo(() => (data?.productions || []).map(p => {
    const events = eventsOf(p);
    return { ...p, crew: crewOf(p, data.people), events, next: events.find(e => e.date >= today) || null };
  }), [data, today]);

  const options = useMemo(() => {
    const uniq = (xs) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
    return {
      products: uniq(rows.flatMap(p => p.product_type)),
      producers: uniq(rows.map(p => p.producer)),
      editors: uniq(rows.flatMap(p => p.crew.map(c => c.name))),
    };
  }, [rows]);

  const within = (p, kind) => p.events.some(e => e.kind === kind && e.date >= today && diff(today, e.date) <= 30);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(p =>
      (showDone || stage === 'Completed' || !isDone(p.stage)) &&
      (!stage || p.stage === stage) &&
      (!product || p.product_type.includes(product)) &&
      (!producer || p.producer === producer) &&
      (!editor || p.crew.some(c => c.name === editor)) &&
      (!when || within(p, when)) &&
      (!needle || [p.id, p.name, p.producer, p.production_type, ...p.product_type, ...p.crew.map(c => c.name)].filter(Boolean).some(v => String(v).toLowerCase().includes(needle))));
  }, [rows, q, stage, product, producer, editor, when, showDone, today]); // eslint-disable-line react-hooks/exhaustive-deps

  const groups = useMemo(() => {
    const by = {};
    for (const p of list) (by[p.stage || 'Pending'] = by[p.stage || 'Pending'] || []).push(p);
    const order = [...STAGE_ORDER, ...Object.keys(by).filter(s => !STAGE_ORDER.includes(s))];
    return order.filter(s => by[s]?.length).map(s => [s, by[s].sort((a, b) => (a.next?.date || '9999').localeCompare(b.next?.date || '9999') || a.name.localeCompare(b.name))]);
  }, [list]);

  const counts = useMemo(() => {
    const m = {};
    for (const p of rows) if (showDone || !isDone(p.stage)) m[p.stage || 'Pending'] = (m[p.stage || 'Pending'] || 0) + 1;
    return [...STAGE_ORDER, ...Object.keys(m).filter(s => !STAGE_ORDER.includes(s))].filter(s => m[s]).map(s => [s, m[s]]);
  }, [rows, showDone]);

  const coming = useMemo(() => rows.filter(p => !isDone(p.stage) || p.events.some(e => e.kind === 'air' && e.date >= today))
    .flatMap(p => p.events.filter(e => e.date >= today && diff(today, e.date) <= 45).map(e => ({ ...e, p })))
    .sort((a, b) => a.date.localeCompare(b.date)).slice(0, 14), [rows, today]);

  const kpis = [
    ['', 'In the works', rows.filter(p => ['Pre Production', 'Production', 'Post'].includes(p.stage)).length, 'pre-production, shooting or in post'],
    ['shoot', 'Shooting soon', rows.filter(p => within(p, 'shoot')).length, 'a shoot day in the next 30 days'],
    ['delivery', 'Delivering', rows.filter(p => within(p, 'delivery')).length, 'delivery in the next 30 days'],
    ['air', 'Going on air', rows.filter(p => within(p, 'air')).length, 'on-air date in the next 30 days'],
  ];
  const filtered = !!(q || stage || product || producer || editor || when);
  const clear = () => { setQ(''); setStage(''); setProduct(''); setProducer(''); setEditor(''); setWhen(''); };

  if (error) return <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>;
  if (!data) return <div className="py-20 text-center text-gray-400"><Loader2 className="inline animate-spin" /></div>;

  return (
    <div className="flex flex-col gap-4">
      {/* The pipeline at a glance — each tile is also a filter */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
        {kpis.map(([k, label, n, sub]) => {
          const on = !!k && when === k;
          return (
            <button key={label} type="button" disabled={!k} onClick={() => k && setWhen(when === k ? '' : k)}
              className={`text-left rounded-2xl border px-4 py-3 transition-all ${on ? 'border-[#0808f8] bg-[#f3f4ff] shadow-sm' : 'border-gray-200 bg-white'} ${k ? 'hover:border-[#0808f8]/50 cursor-pointer' : 'cursor-default'}`}>
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider" style={{ color: k ? KIND[k].color : NAVY }}>
                {k && (() => { const I = KIND[k].icon; return <I size={13} />; })()}{label}
              </div>
              <div className="font-black leading-none mt-1 tabular-nums text-[38px] sm:text-[44px]" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: NAVY }}>{n}</div>
              <div className="text-[11px] text-gray-500 mt-0.5 leading-snug">{sub}</div>
            </button>
          );
        })}
      </div>

      {/* Coming up: the next dated things, in order */}
      {coming.length > 0 && (
        <section>
          <div className="flex items-baseline gap-2 mb-2">
            <h2 className="font-black uppercase text-[22px] leading-none" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: NAVY }}>Coming up</h2>
            <span className="text-xs text-gray-400">next 45 days</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x" style={{ scrollbarWidth: 'thin' }}>
            {coming.map((e, i) => {
              const k = KIND[e.kind];
              const Icon = k.icon;
              const n = diff(today, e.date);
              return (
                <button key={`${e.p.id}-${e.kind}-${e.date}-${i}`} type="button" onClick={() => { setOpen(e.p.id); document.getElementById(`gp-${e.p.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
                  className="snap-start flex-none w-[200px] text-left rounded-2xl bg-white border border-gray-200 hover:border-[#0808f8]/40 hover:shadow-sm transition-all p-3 flex gap-3">
                  <div className="flex-none w-11 text-center rounded-xl py-1" style={{ background: n <= 7 ? `${k.color}14` : '#f4f5f9' }}>
                    <div className="text-[10px] font-bold uppercase" style={{ color: n <= 7 ? k.color : '#8a90a6' }}>{fmt(e.date, { weekday: 'short' })}</div>
                    <div className="text-[20px] font-black leading-none tabular-nums" style={{ color: NAVY }}>{fmt(e.date, { day: 'numeric' })}</div>
                    <div className="text-[10px] font-semibold text-gray-500">{fmt(e.date, { month: 'short' })}</div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-[11px] font-bold" style={{ color: k.color }}><Icon size={12} />{k.label}</div>
                    <div className="text-[13px] font-semibold leading-snug line-clamp-2" style={{ color: NAVY }}>{e.p.name}</div>
                    <div className="text-[11px] text-gray-400 truncate">{e.text && e.kind !== 'shoot' ? `${e.text} · ` : ''}{rel(e.date, today)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-2 p-2 rounded-2xl bg-white border border-gray-200 lg:sticky lg:top-0 z-10">
        <div className="flex flex-wrap items-center gap-2">
          <label className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search productions, products, people"
              className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-gray-300 outline-none" />
          </label>
          <Select value={product} onChange={setProduct} label="Product" options={options.products} />
          <Select value={producer} onChange={setProducer} label="Producer" options={options.producers} />
          <Select value={editor} onChange={setEditor} label="Editor / designer" options={options.editors} />
          <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-600 cursor-pointer px-1"><input type="checkbox" checked={showDone} onChange={e => setShowDone(e.target.checked)} /> Completed</label>
          {filtered && <button type="button" onClick={clear} className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-800 px-2 py-1.5 rounded-lg hover:bg-gray-100"><X size={13} /> Clear</button>}
        </div>
        <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
          <button type="button" onClick={() => setStage('')} className={`flex-none text-xs font-semibold px-3 py-1.5 rounded-full ${!stage ? 'bg-[#030b2e] text-white' : 'bg-gray-100 text-gray-600'}`}>All <span className="opacity-70 tabular-nums">{counts.reduce((s, [, n]) => s + n, 0)}</span></button>
          {counts.map(([s, n]) => (
            <button key={s} type="button" onClick={() => setStage(stage === s ? '' : s)}
              className={`flex-none text-xs font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 ${stage === s ? 'text-white' : 'bg-gray-100 text-gray-700'}`} style={stage === s ? { background: stageColor(s) } : undefined}>
              <span className="w-2 h-2 rounded-full" style={{ background: stage === s ? '#fff' : stageColor(s) }} />{s} <span className="opacity-70 tabular-nums">{n}</span>
            </button>
          ))}
        </div>
      </div>

      {!groups.length && (
        <div className="py-14 text-center bg-white rounded-2xl border border-gray-200">
          <div className="text-sm text-gray-500">No productions match.</div>
          {filtered && <button type="button" onClick={clear} className="mt-2 text-xs font-semibold text-[#0808f8] hover:underline">Clear the filters</button>}
        </div>
      )}

      {groups.map(([s, ps]) => (
        <section key={s}>
          <div className="flex items-center gap-2 mb-1.5 px-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: stageColor(s) }} />
            <h3 className="text-[13px] font-bold uppercase tracking-wider" style={{ color: NAVY }}>{s}</h3>
            <span className="text-xs text-gray-400 tabular-nums">{ps.length}</span>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
            <div className="hidden lg:grid gap-3 px-4 py-2 text-[10.5px] font-bold uppercase tracking-wider text-gray-400" style={{ gridTemplateColumns: COLS }}>
              <span>Production</span><span>Product</span><span>Producer</span><span>Editor / designer</span><span>Next up</span><span>Where it is</span><span />
            </div>
            {ps.map(p => <Row key={p.id} p={p} today={today} people={data.people} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} />)}
          </div>
        </section>
      ))}
    </div>
  );
}

const COLS = 'minmax(0,2.2fr) minmax(0,1.1fr) minmax(0,1fr) minmax(0,1.4fr) minmax(0,1.6fr) 150px 20px';

function Crew({ crew, max = 3 }) {
  if (!crew.length) return <span className="text-[12px] text-gray-400">Not assigned yet</span>;
  const shown = crew.slice(0, max);
  return (
    <span className="flex items-center gap-2 min-w-0">
      <span className="flex -space-x-2 flex-none">{shown.map(c => <Avatar key={c.name} name={c.name} photo={c.photo} size={26} />)}</span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[12.5px] font-semibold truncate" style={{ color: NAVY }}>{shown.map(c => first(c.name)).join(', ')}{crew.length > max ? ` +${crew.length - max}` : ''}</span>
        <span className="block text-[11px] text-gray-400 truncate">{[...new Set(shown.map(c => c.role))].join(' · ')}</span>
      </span>
    </span>
  );
}

function Row({ p, today, people, open, onToggle }) {
  const signal = p.signals?.find(s => s.level === 'red') || p.signals?.[0];
  return (
    <div id={`gp-${p.id}`} className={open ? 'bg-[#fafbff]' : ''}>
      <button type="button" onClick={onToggle} aria-expanded={open} className="w-full text-left px-4 py-3 hover:bg-[#f5f6ff] transition-colors">
        {/* desktop row */}
        <div className="hidden lg:grid gap-3 items-center" style={{ gridTemplateColumns: COLS }}>
          <span className="min-w-0">
            <span className="block text-[14px] font-semibold truncate" style={{ color: NAVY }} title={p.name}>{p.name}</span>
            <span className="block text-[11px] text-gray-400 truncate">{p.id}{p.production_type ? ` · ${p.production_type}` : ''}{signal ? <> · <span style={{ color: signal.level === 'red' ? '#e2445c' : '#c27c0e' }}>{signal.text}</span></> : null}</span>
          </span>
          <span className="flex flex-wrap gap-1 min-w-0">{p.product_type.length ? p.product_type.map(x => <span key={x} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#f0f1fb] text-[#3a4170] truncate max-w-full">{x}</span>) : <span className="text-[12px] text-gray-400">—</span>}</span>
          <span className="text-[12.5px] text-gray-700 truncate">{p.producer || '—'}</span>
          <Crew crew={p.crew} />
          <NextUp e={p.next} today={today} />
          <Stepper stage={p.stage} />
          <ChevronDown size={16} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
        {/* phone / tablet card */}
        <div className="lg:hidden flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold leading-snug" style={{ color: NAVY }}>{p.name}</span>
              <span className="block text-[11px] text-gray-400">{[p.id, p.production_type, p.producer && `Producer ${first(p.producer)}`].filter(Boolean).join(' · ')}</span>
            </span>
            <StagePill stage={p.stage} />
          </div>
          {p.product_type.length > 0 && <span className="flex flex-wrap gap-1">{p.product_type.map(x => <span key={x} className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#f0f1fb] text-[#3a4170]">{x}</span>)}</span>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Crew crew={p.crew} />
            <NextUp e={p.next} today={today} />
          </div>
          {signal && <span className="text-[11px] font-semibold" style={{ color: signal.level === 'red' ? '#e2445c' : '#c27c0e' }}>{signal.text}</span>}
        </div>
      </button>
      {open && <Detail p={p} today={today} people={people} />}
    </div>
  );
}

function Detail({ p, today, people }) {
  const facts = [
    ['Planned', p.dates?.planned_start ? `${fmt(day(p.dates.planned_start))} → ${fmt(day(p.dates.planned_end))}` : '—'],
    ['Shoot', (p.shoot?.days || []).length ? p.shoot.days.map(d => fmt(d)).join(', ') : '—'],
    ['Delivery', day(p.dates?.delivery) ? `${fmtDay(day(p.dates.delivery))} · ${rel(day(p.dates.delivery), today)}` : '—'],
    ['On air', day(p.dates?.air) ? `${fmtDay(day(p.dates.air))} · ${rel(day(p.dates.air), today)}` : '—'],
    ['Deadline', p.deadline?.date ? `${p.deadline.label ? `${p.deadline.label} — ` : ''}${fmtDay(p.deadline.date)}` : '—'],
    ['In stage', p.stage_days != null ? `${p.stage} for ${p.stage_days}d` : p.stage],
  ];
  const upcoming = p.events.filter(e => e.date >= today);
  const tickets = [...(p.tickets || [])].sort((a, b) => (b.open - a.open));
  return (
    <div className="px-4 pb-4 pt-1 grid gap-4 lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 rounded-xl bg-white border border-gray-100 p-3">
          {facts.map(([k, v]) => <div key={k} className="min-w-0"><div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400">{k}</div><div className="text-[12.5px] text-gray-700 leading-snug">{v}</div></div>)}
        </div>
        {(p.milestone?.current || p.milestone?.next) && (
          <div className="rounded-xl bg-white border border-gray-100 p-3 flex flex-col gap-1.5">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400">Schedule</div>
            {p.milestone.current && <div className="text-[12.5px]"><span className="font-semibold" style={{ color: '#7e5bef' }}>Now</span> · {p.milestone.current.title} <span className="text-gray-400">until {fmt(day(p.milestone.current.end))}</span></div>}
            {p.milestone.next && <div className="text-[12.5px]"><span className="font-semibold text-gray-500">Next</span> · {p.milestone.next.title} <span className="text-gray-400">from {fmt(day(p.milestone.next.start))}</span></div>}
          </div>
        )}
        {upcoming.length > 1 && (
          <div className="flex flex-wrap gap-1.5">
            {upcoming.slice(0, 6).map((e, i) => { const k = KIND[e.kind]; return <span key={i} className="text-[11px] font-semibold px-2 py-1 rounded-lg" style={{ color: k.color, background: `${k.color}12` }}>{e.text || k.label} · {fmt(e.date)}</span>; })}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <div className="rounded-xl bg-white border border-gray-100 p-3">
          <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-2">Team</div>
          <div className="flex flex-col gap-2">
            {p.producer && <div className="flex items-center gap-2"><Avatar name={p.producer} size={28} ring={false} /><div className="leading-tight"><div className="text-[13px] font-semibold" style={{ color: NAVY }}>{p.producer}</div><div className="text-[11px] text-gray-400">Producer</div></div></div>}
            {p.crew.map(c => (
              <div key={c.name} className="flex items-center gap-2"><Avatar name={c.name} photo={c.photo} size={28} ring={false} />
                <div className="leading-tight"><div className="text-[13px] font-semibold" style={{ color: NAVY }}>{c.name}</div><div className="text-[11px] text-gray-400">{c.role}{c.open ? ` · ${c.open} open ticket${c.open > 1 ? 's' : ''}` : ''}</div></div>
              </div>
            ))}
            {!p.crew.length && <div className="text-[12px] text-gray-400">No editor or designer on its Studio tickets yet.</div>}
          </div>
        </div>
        {tickets.length > 0 && (
          <div className="rounded-xl bg-white border border-gray-100 p-3">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 mb-2">Studio tickets</div>
            <div className="flex flex-col divide-y divide-gray-50">
              {tickets.slice(0, 8).map(t => (
                <div key={t.id} className="flex items-center gap-2 py-1.5">
                  <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap text-white" style={{ background: t.status?.color || '#c4c4c4' }}>{t.status?.label || '—'}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[12.5px] font-semibold truncate" style={{ color: NAVY }}>{t.subtitle || t.title || t.name}</span>
                    <span className="block text-[11px] text-gray-400 truncate">{t.board === 'design' ? 'Design' : 'Video'}{(t.people || []).length ? ` · ${(t.people || []).map(id => first(people?.[id]?.name)).filter(Boolean).join(', ')}` : ''}{t.timeline?.to ? ` · due ${fmt(day(t.timeline.to))}` : ''}</span>
                  </span>
                  {t.monday_url && <a href={t.monday_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="flex-none p-1.5 rounded-lg text-gray-400 hover:text-[#0808f8] hover:bg-gray-100" aria-label="Open in Monday"><ExternalLink size={13} /></a>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

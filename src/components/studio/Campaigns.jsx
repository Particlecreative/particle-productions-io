import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Search, RefreshCw, Loader2, AlertTriangle, ExternalLink, X } from 'lucide-react';
import { studioApi } from '../../lib/studioService';
import { useStudio } from './writes';
import { Avatar, StatusPill, ProductTag, Seg, StackBar, TimelinePill, Empty, DIVISION, CATEGORY, CATEGORY_ORDER, NAVY, useWidth } from './Bits';

// Campaign Tracker — every Video + Design ticket that has a Campaign, grouped by campaign (Lilian's Monday dashboard).
const PREF_KEY = 'cp_studio_campaigns_v1';
const STALE_MS = 3 * 60 * 1000;
const GROUP_COLORS = ['#0808f8', '#00c875', '#fdab3d', '#a25ddc', '#ff7a1a', '#579bfc', '#e2445c', '#037f4c', '#ff158a', '#784bd1'];
// Open tickets that need attention first, finished last
const ROW_ORDER = ['stuck', 'fixes', 'in_progress', 'review', 'queued', 'paused', 'other', 'delivered'];
// Ticket table columns once the tab is wide enough (measured, so an open sidebar counts)
const COLS = 'minmax(0,1fr) 82px 132px 84px 140px 120px 28px';
const WIDE = 900;
let cache = null; // { data, at } — switching tabs back is instant

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREF_KEY) || 'null') || {}; } catch { return {}; }
}
const colorOf = (label) => {
  let h = 0;
  for (const ch of label) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return GROUP_COLORS[h % GROUP_COLORS.length];
};
const dueOf = (it) => it.deadline || it.timeline?.to || null;
const addDays = (d, n) => { const x = new Date(`${d}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const fmt = (d) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
const ago = (iso) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)}h ago`;
};

/** One group per campaign with what the header needs: counts by status, products, people, dates. */
function groupCampaigns(items, today) {
  const map = new Map();
  for (const it of items) {
    for (const label of it.campaigns || []) {
      const key = label.trim().toLowerCase();
      if (!map.has(key)) map.set(key, { key, label: label.trim(), items: [] });
      map.get(key).items.push(it);
    }
  }
  return [...map.values()].map((g) => {
    const cats = {};
    const products = new Map();
    const people = new Set();
    let video = 0;
    let design = 0;
    for (const it of g.items) {
      cats[it.status.category] = (cats[it.status.category] || 0) + 1;
      if (it.board === 'video') video++; else design++;
      if (it.product?.label && it.product.label !== '-') {
        const p = products.get(it.product.label) || { ...it.product, n: 0 };
        p.n++;
        products.set(it.product.label, p);
      }
      for (const uid of it.people) people.add(uid);
    }
    const open = g.items.filter(i => i.open);
    const dates = g.items.flatMap(i => [i.timeline?.from, i.timeline?.to, i.deadline]).filter(Boolean).sort();
    const dues = open.map(dueOf).filter(Boolean).sort();
    const activity = g.items.map(i => i.timeline?.to || i.deadline || i.created_at?.slice(0, 10)).filter(Boolean).sort();
    return {
      ...g,
      color: colorOf(g.label),
      cats,
      open: open.length,
      done: cats.delivered || 0,
      video,
      design,
      products: [...products.values()].sort((a, b) => b.n - a.n),
      people: [...people],
      first: dates[0] || null,
      last: dates[dates.length - 1] || null,
      nextDue: dues[0] || null,
      overdue: dues.filter(d => d < today).length,
      latest: activity[activity.length - 1] || '',
    };
  });
}

const SORTS = {
  recent: (a, b) => b.latest.localeCompare(a.latest) || a.label.localeCompare(b.label),
  open: (a, b) => b.open - a.open || b.latest.localeCompare(a.latest),
  due: (a, b) => (a.nextDue || '9999').localeCompare(b.nextDue || '9999') || b.open - a.open,
  name: (a, b) => a.label.localeCompare(b.label),
};

export default function Campaigns() {
  const { writes, openTask } = useStudio();
  const [raw, setRaw] = useState(() => cache?.data || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [prefs, setPrefsState] = useState(() => ({ show: 'active', board: 'all', product: '', requester: '', sort: 'recent', ...loadPrefs() }));
  const [q, setQ] = useState('');
  const [expanded, setExpanded] = useState(null); // Set of keys; null = the default (first few open)
  const [showDone, setShowDone] = useState(() => new Set());
  const [wref, width] = useWidth(1200);

  const setPrefs = (patch) => setPrefsState((p) => {
    const next = { ...p, ...patch };
    try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const d = await studioApi.campaigns({ force });
      cache = { data: d, at: Date.now() };
      setRaw(d);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (!cache || Date.now() - cache.at > STALE_MS) load(); }, [load]);

  // Edits made in the task panel (or any other Studio tab) show here straight away
  const data = useMemo(() => (raw ? { ...raw, items: raw.items.map(it => writes.merge(it, raw.generated_at)).filter(it => !it.archived) } : null), [raw, writes.merge]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = data?.today || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

  const productOptions = useMemo(() => [...new Set((data?.items || []).map(i => i.product?.label).filter(l => l && l !== '-'))].sort(), [data]);
  const requesterOptions = useMemo(() => Object.values(data?.requesters || {}).sort((a, b) => a.name.localeCompare(b.name)), [data]);

  const groups = useMemo(() => {
    if (!data) return [];
    const items = data.items.filter(it =>
      (prefs.board === 'all' || it.board === prefs.board) &&
      (!prefs.product || it.product?.label === prefs.product) &&
      (!prefs.requester || it.requested_by.includes(prefs.requester)));
    let gs = groupCampaigns(items, today);
    const needle = q.trim().toLowerCase();
    if (needle) {
      // A matching campaign keeps all its tickets; otherwise only the tickets whose name matches
      gs = gs.flatMap((g) => {
        if (g.label.toLowerCase().includes(needle)) return [g];
        const hits = g.items.filter(it => it.name.toLowerCase().includes(needle));
        return hits.length ? groupCampaigns(hits.map(it => ({ ...it, campaigns: [g.label] })), today) : [];
      });
    }
    if (prefs.show === 'active') gs = gs.filter(g => g.open > 0);
    if (prefs.show === 'done') gs = gs.filter(g => g.open === 0);
    return gs.sort(SORTS[prefs.sort] || SORTS.recent);
  }, [data, prefs, q, today]);

  const totals = useMemo(() => {
    const open = groups.flatMap(g => g.items.filter(i => i.open));
    const uniq = new Map(open.map(i => [i.id, i]));
    const list = [...uniq.values()];
    const soon = addDays(today, 7);
    return {
      campaigns: groups.length,
      open: list.length,
      review: list.filter(i => i.status.category === 'review').length,
      due: list.filter(i => dueOf(i) && dueOf(i) >= today && dueOf(i) <= soon).length,
      overdue: list.filter(i => dueOf(i) && dueOf(i) < today).length,
      stuck: list.filter(i => i.status.category === 'stuck').length,
    };
  }, [groups, today]);

  const isOpen = (g, i) => (expanded ? expanded.has(g.key) : (q.trim() ? i < 6 : i < 2));
  const toggle = (g, i) => setExpanded((cur) => {
    const base = cur || new Set(groups.filter((x, j) => isOpen(x, j)).map(x => x.key));
    const next = new Set(base);
    if (isOpen(g, i)) next.delete(g.key); else next.add(g.key);
    return next;
  });
  const anyFilter = prefs.board !== 'all' || prefs.product || prefs.requester || q.trim();

  return (
    <div ref={wref} className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 p-2 rounded-2xl bg-white border border-gray-200">
        <label className="relative flex-1 min-w-[200px] max-w-[340px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input id="campaign-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search campaigns or tickets"
            className="w-full pl-9 pr-8 py-2 text-sm rounded-xl bg-gray-50 border border-transparent focus:bg-white focus:border-gray-300 outline-none" />
          {q && <button type="button" onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700" aria-label="Clear search"><X size={14} /></button>}
        </label>
        <Seg value={prefs.show} onChange={(v) => setPrefs({ show: v })} options={[['active', 'Active'], ['all', 'All'], ['done', 'Finished']]} />
        <Seg value={prefs.board} onChange={(v) => setPrefs({ board: v })} options={[['all', 'Video + Design'], ['video', 'Video'], ['design', 'Design']]} />
        <select id="campaign-product" value={prefs.product} onChange={(e) => setPrefs({ product: e.target.value })}
          className="text-xs font-semibold px-3 py-2 rounded-xl bg-gray-100 text-gray-700 border-0 outline-none max-w-[170px]">
          <option value="">All products</option>
          {productOptions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select id="campaign-requester" value={prefs.requester} onChange={(e) => setPrefs({ requester: e.target.value })}
          className="text-xs font-semibold px-3 py-2 rounded-xl bg-gray-100 text-gray-700 border-0 outline-none max-w-[170px]">
          <option value="">Anyone requested</option>
          {requesterOptions.map(p => <option key={p.id} value={p.id}>Requested by {p.name}</option>)}
        </select>
        <select id="campaign-sort" value={prefs.sort} onChange={(e) => setPrefs({ sort: e.target.value })}
          className="text-xs font-semibold px-3 py-2 rounded-xl bg-gray-100 text-gray-700 border-0 outline-none">
          <option value="recent">Latest first</option>
          <option value="due">Next deadline</option>
          <option value="open">Most open tickets</option>
          <option value="name">A–Z</option>
        </select>
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
          {data && <span className="hidden sm:inline">Updated {ago(data.generated_at)}</span>}
          <button type="button" onClick={() => load(true)} disabled={loading}
            className="flex items-center gap-1.5 font-semibold px-3 py-2 rounded-xl text-gray-600 hover:bg-gray-100 disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm flex items-center gap-2">
          <AlertTriangle size={16} /> {error}
          <button type="button" onClick={() => load(true)} className="ml-auto font-semibold underline">Try again</button>
        </div>
      )}
      {data?.warnings?.length > 0 && <div className="text-xs text-amber-700">{data.warnings.join(' · ')}</div>}

      {!data ? (
        !error && (
          <div className="py-24 text-center text-gray-400 flex flex-col items-center gap-3">
            <Loader2 className="animate-spin" />
            <span className="text-sm">Reading campaign tickets from Monday…</span>
          </div>
        )
      ) : (
        <div className={`flex flex-col gap-4 ${loading ? 'opacity-70 transition-opacity' : 'transition-opacity'}`}>
          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <Stat label={prefs.show === 'done' ? 'Finished campaigns' : prefs.show === 'all' ? 'Campaigns' : 'Active campaigns'} value={totals.campaigns} />
            <Stat label="Open tickets" value={totals.open} />
            <Stat label="In review" value={totals.review} color={CATEGORY.review.color} />
            <Stat label="Due in 7 days" value={totals.due} color={NAVY} />
            <Stat label="Overdue" value={totals.overdue} color={totals.overdue ? '#e2445c' : undefined} />
            <Stat label="Stuck" value={totals.stuck} color={totals.stuck ? '#e2445c' : undefined} />
          </div>

          <div className="flex items-center gap-3 text-xs text-gray-500 px-1">
            <span>{groups.length} {groups.length === 1 ? 'campaign' : 'campaigns'}{anyFilter ? ' match' : ''}</span>
            {groups.length > 1 && (
              <>
                <button type="button" className="font-semibold text-gray-600 hover:text-gray-900" onClick={() => setExpanded(new Set(groups.map(g => g.key)))}>Expand all</button>
                <button type="button" className="font-semibold text-gray-600 hover:text-gray-900" onClick={() => setExpanded(new Set())}>Collapse all</button>
              </>
            )}
          </div>

          {!groups.length && (
            <Empty>{anyFilter ? 'No campaigns match these filters.' : prefs.show === 'active' ? 'No campaign has open tickets right now.' : 'No campaign tickets on Monday yet.'}</Empty>
          )}

          {groups.map((g, i) => (
            <CampaignGroup key={g.key} g={g} today={today} data={data} width={width} open={isOpen(g, i)} onToggle={() => toggle(g, i)}
              showDone={showDone.has(g.key) || g.open === 0}
              onShowDone={() => setShowDone(s => new Set(s).add(g.key))}
              onTask={(it) => openTask(it, data)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-3xl font-black tabular-nums mt-0.5" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: color || NAVY }}>{value}</div>
    </div>
  );
}

function CampaignGroup({ g, today, data, width, open, onToggle, showDone, onShowDone, onTask }) {
  const wide = width >= WIDE;
  const parts = CATEGORY_ORDER.map(k => ({ key: k, value: g.cats[k] || 0, color: CATEGORY[k].color, label: CATEGORY[k].label }));
  const rows = [...g.items].sort((a, b) => (ROW_ORDER.indexOf(a.status.category) - ROW_ORDER.indexOf(b.status.category))
    || (a.open ? (dueOf(a) || '9999').localeCompare(dueOf(b) || '9999') : (dueOf(b) || '').localeCompare(dueOf(a) || '')));
  const visible = showDone ? rows : rows.filter(r => r.open);
  const hiddenDone = rows.length - visible.length;
  const people = g.people.map(uid => data.people[uid]).filter(Boolean);
  const overdue = g.nextDue && g.nextDue < today;

  return (
    <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-[0_1px_2px_rgba(3,11,46,.04)]">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full flex flex-wrap items-center gap-x-5 gap-y-2 px-4 py-3 text-left hover:bg-gray-50/70 transition-colors">
        <span className="flex items-center gap-2 min-w-0 flex-1 basis-[260px]">
          <span className="w-1.5 self-stretch rounded-full flex-none" style={{ background: g.color }} />
          {open ? <ChevronDown size={16} className="flex-none text-gray-400" /> : <ChevronRight size={16} className="flex-none text-gray-400" />}
          <span className="min-w-0">
            <span className="block font-bold truncate" style={{ color: NAVY }}>{g.label}</span>
            <span className="block text-xs text-gray-500 truncate">
              {g.items.length} {g.items.length === 1 ? 'ticket' : 'tickets'}
              {g.video > 0 && ` · ${g.video} video`}{g.design > 0 && ` · ${g.design} design`}
              {g.first && ` · ${fmt(g.first)}${g.last && g.last !== g.first ? ` – ${fmt(g.last)}` : ''}`}
            </span>
          </span>
        </span>
        {width >= 1150 && (
        <span className="flex items-center gap-3 flex-none max-w-[300px] overflow-hidden">
          {g.products.slice(0, 3).map(p => <ProductTag key={p.label} product={p} />)}
          {g.products.length > 3 && <span className="text-[11px] text-gray-400">+{g.products.length - 3}</span>}
        </span>
        )}
        {wide && (
        <span className="flex items-center -space-x-1.5 flex-none">
          {people.slice(0, 5).map(p => <Avatar key={p.id} person={p} size={24} ring="#fff" />)}
          {people.length > 5 && <span className="text-[11px] text-gray-400 pl-2.5">+{people.length - 5}</span>}
        </span>
        )}
        <span className="flex flex-col gap-1 w-[170px] flex-none">
          <StackBar parts={parts} height={8} />
          <span className="text-[11px] text-gray-500 tabular-nums">{g.done}/{g.items.length} done{g.open ? ` · ${g.open} open` : ''}</span>
        </span>
        <span className="w-[112px] flex-none text-right">
          {g.open > 0 && g.nextDue
            ? <span className={`inline-flex text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap ${overdue ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}>{overdue ? `Overdue · ${fmt(g.nextDue)}` : `Next due ${fmt(g.nextDue)}`}</span>
            : g.open === 0 ? <span className="inline-flex text-[11px] font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700">All done</span> : null}
        </span>
      </button>

      {open && (
        <div className="border-t border-gray-100">
          {wide && (
            <div className="grid gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-50/60" style={{ gridTemplateColumns: COLS }}>
              <span className="pl-3.5">Ticket</span><span>Board</span><span>Status</span><span>People</span><span>Requested by</span><span>Timeline</span><span />
            </div>
          )}
          {visible.map(it => <TicketRow key={it.id} it={it} data={data} today={today} color={g.color} wide={wide} onClick={() => onTask(it)} />)}
          {hiddenDone > 0 && (
            <button type="button" onClick={onShowDone} className="w-full text-left px-4 py-2.5 text-xs font-semibold text-gray-500 hover:bg-gray-50 border-t border-gray-100">
              Show {hiddenDone} done {hiddenDone === 1 ? 'ticket' : 'tickets'}
            </button>
          )}
          {!visible.length && !hiddenDone && <Empty>No tickets.</Empty>}
        </div>
      )}
    </section>
  );
}

function TicketRow({ it, data, today, color, wide, onClick }) {
  const div = DIVISION[it.division] || DIVISION[it.board];
  const people = it.people.map(uid => data.people[uid]).filter(Boolean);
  const req = it.requested_by.map(uid => data.requesters[uid]?.name).filter(Boolean);
  const due = dueOf(it);
  const late = it.open && due && due < today;
  const when = it.timeline?.from
    ? <TimelinePill timeline={it.timeline} today={today} small color={it.open ? (late ? '#e2445c' : '#579bfc') : '#00c875'} />
    : it.deadline ? <span className={`text-xs ${late ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>Due {fmt(it.deadline)}</span> : <span className="text-xs text-gray-300">—</span>;
  const boardTag = <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: div.color, background: `${div.color}14` }}>{div.label}</span>;
  const avatars = (
    <span className="flex items-center -space-x-1.5">
      {people.slice(0, 3).map(p => <Avatar key={p.id} person={p} size={22} ring="#fff" />)}
      {!people.length && <span className="text-xs text-gray-300">—</span>}
    </span>
  );
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}
      className="grid gap-x-3 gap-y-1.5 items-center px-4 py-2.5 border-t border-gray-100 cursor-pointer hover:bg-[#f5f6ff] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#4a55ff]"
      style={{ gridTemplateColumns: wide ? COLS : 'minmax(0,1fr) auto' }}>
      <span className="flex items-center gap-2.5 min-w-0">
        <span className="w-1 h-7 rounded-full flex-none opacity-60" style={{ background: color }} />
        <span className="min-w-0">
          <span className={`block text-sm truncate ${it.open ? 'text-[#030b2e] font-medium' : 'text-gray-500'}`} title={it.name}>{it.title || it.name}</span>
          <span className="flex items-center gap-2 text-[11px] text-gray-400 min-w-0">
            <ProductTag product={it.product} />
            {it.platform && <span className="truncate">{it.platform}</span>}
          </span>
        </span>
      </span>
      {wide ? (
        <>
          <span className="inline-flex">{boardTag}</span>
          <span><StatusPill status={it.status} small /></span>
          {avatars}
          <span className="text-xs text-gray-500 truncate" title={req.join(', ')}>{req.join(', ') || '—'}</span>
          <span>{when}</span>
          <span className="flex justify-end">
            {it.monday_url && (
              <a href={it.monday_url} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="Open in Monday" className="p-1 text-gray-300 hover:text-gray-700">
                <ExternalLink size={14} />
              </a>
            )}
          </span>
        </>
      ) : (
        <span className="flex flex-col items-end gap-1">
          <StatusPill status={it.status} small />
          <span className="flex items-center gap-2">{boardTag}{when}</span>
        </span>
      )}
    </div>
  );
}

// The studio at a glance (Tomer, 17 Nov 2026): how many tasks are Working / Pending / In review / Fixes / Stuck right now,
// video vs design, by campaign type (the Campaign Tracker's groups) and by product. On top of the Workload for everyone,
// and on the Growth Studio's overview.
import { useEffect, useMemo, useState } from 'react';
import { studioApi } from '../../lib/studioService';
import { CATEGORY, NAVY } from './Bits';

const TILES = [['in_progress', 'Working'], ['queued', 'Pending'], ['review', 'In review'], ['fixes', 'Fixes'], ['stuck', 'Stuck']];
let groupCache = null;   // { data, at } — campaign → group, shared across tabs for 5 minutes

export function useCampaignGroups() {
  const [g, setG] = useState(() => groupCache?.data || null);
  useEffect(() => {
    if (groupCache && Date.now() - groupCache.at < 300000) return;
    let on = true;
    studioApi.campaignGroupMap().then((d) => { groupCache = { data: d, at: Date.now() }; if (on) setG(d); }).catch(() => null);
    return () => { on = false; };
  }, []);
  return g;
}

/** items: the studio's tasks (open + done) — only open ones count. */
export default function WorkStats({ items, compact = false }) {
  const groups = useCampaignGroups();
  const s = useMemo(() => {
    const open = (items || []).filter(it => it.status?.category && it.status.category !== 'delivered' && it.board !== 'email');
    const by = (fn) => { const m = new Map(); for (const it of open) { const k = fn(it); if (!k) continue; m.set(k, (m.get(k) || 0) + 1); } return m; };
    const cat = {};
    for (const it of open) {
      const c = it.status.category;
      cat[c] = cat[c] || { n: 0, video: 0, design: 0 };
      cat[c].n++;
      if (it.board === 'video') cat[c].video++; else cat[c].design++;
    }
    const groupOf = (it) => { const label = it.campaign || it.campaigns?.[0]; return label ? (groups?.of?.[label] || 'evergreen') : null; };
    const byGroup = by(groupOf);
    const noCampaign = open.filter(it => !(it.campaign || it.campaigns?.[0])).length;
    const products = new Map();
    for (const it of open) {
      const p = it.product?.label;
      if (!p || p === '-') continue;
      const cur = products.get(p) || { label: p, color: it.product.color, n: 0 };
      cur.n++;
      products.set(p, cur);
    }
    return {
      total: open.length, cat, noCampaign, video: open.filter(it => it.board === 'video').length,
      groups: (groups?.groups || []).map(g => ({ ...g, n: byGroup.get(g.key) || 0 })).filter(g => g.n).sort((a, b) => b.n - a.n),
      products: [...products.values()].sort((a, b) => b.n - a.n).slice(0, 8),
    };
  }, [items, groups]);

  const maxG = Math.max(1, ...s.groups.map(g => g.n));
  const maxP = Math.max(1, ...s.products.map(p => p.n));
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        <Tile label="Open tasks" value={s.total} sub={`${s.video} video · ${s.total - s.video} design${s.cat.paused?.n ? ` · ${s.cat.paused.n} paused` : ''}`} />
        {TILES.map(([k, label]) => (
          <Tile key={k} label={label} value={s.cat[k]?.n || 0} color={(s.cat[k]?.n && k !== 'queued') ? CATEGORY[k].color : undefined}
            sub={s.cat[k]?.n ? `${s.cat[k].video} video · ${s.cat[k].design} design` : '—'} />
        ))}
      </div>
      {!compact && (s.groups.length > 0 || s.products.length > 0) && (
        <div className="grid md:grid-cols-2 gap-2">
          <Bars title="By campaign type" foot={s.noCampaign ? `${s.noCampaign} open task${s.noCampaign === 1 ? '' : 's'} without a campaign` : null}
            rows={s.groups.map(g => ({ key: g.key, label: <><span aria-hidden="true">{g.icon}</span> {g.name}</>, n: g.n, color: g.color }))} max={maxG} />
          <Bars title="By product" rows={s.products.map(p => ({ key: p.label, label: p.label, n: p.n, color: p.color || '#579bfc' }))} max={maxP} />
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">{label}</div>
      <div className="text-3xl font-black tabular-nums mt-0.5 leading-none" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: color || NAVY }}>{value}</div>
      {sub && <div className="text-[11px] text-gray-400 mt-1 tabular-nums">{sub}</div>}
    </div>
  );
}

function Bars({ title, rows, max, foot }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">{title}</div>
      {!rows.length && <div className="text-xs text-gray-400 py-2">Nothing open</div>}
      <div className="flex flex-col gap-1.5">
        {rows.map(r => (
          <div key={r.key} className="grid items-center gap-2 text-xs" style={{ gridTemplateColumns: 'minmax(0, 160px) 1fr 28px' }}>
            <span className="truncate text-gray-700">{r.label}</span>
            <span className="h-2 rounded-full bg-gray-100 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${Math.max(4, (r.n / max) * 100)}%`, background: r.color }} /></span>
            <span className="text-right font-semibold tabular-nums" style={{ color: NAVY }}>{r.n}</span>
          </div>
        ))}
      </div>
      {foot && <div className="text-[11px] text-gray-400 mt-2">{foot}</div>}
    </div>
  );
}

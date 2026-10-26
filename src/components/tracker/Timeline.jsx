import { useMemo } from 'react';
import { Flag, Film, Send, Tv } from 'lucide-react';
import { stageColor, addDays, daysUntil, shortDate, HealthDot } from './parts';

const BEFORE = 14;
const AFTER = 84;

/** Twelve weeks ahead (two back): planned window, shoot days, the deadline we chose, delivery and air dates. */
export default function Timeline({ productions, today, onOpen }) {
  const start = addDays(today, -BEFORE);
  const total = BEFORE + AFTER;
  const x = (d) => (daysUntil(d, start) / total) * 100;
  const inView = (d) => d && d >= start && d <= addDays(start, total);
  const weeks = useMemo(() => {
    const out = [];
    let d = start;
    while (new Date(d).getUTCDay() !== 0) d = addDays(d, 1);
    for (; d <= addDays(start, total); d = addDays(d, 7)) out.push(d);
    return out;
  }, [start, total]);

  const rows = productions.filter(p => {
    const dates = [p.dates?.planned_start, p.dates?.planned_end, p.tracker?.deadline, p.dates?.delivery, p.dates?.air, ...(p.shoot?.days || [])].filter(Boolean);
    return dates.some(inView) || (p.dates?.planned_start && p.dates.planned_start < start && p.dates?.planned_end > addDays(start, total));
  });

  const Marker = ({ d, children, title, color }) => (inView(d) ? (
    <span title={title} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex items-center justify-center" style={{ left: `${x(d)}%`, color }}>{children}</span>
  ) : null);

  return (
    <div className="trk-glass p-4 overflow-x-auto trk-scroll">
      <div className="min-w-[860px]">
        <div className="flex">
          <div className="w-[220px] flex-none" />
          <div className="relative flex-1 h-6 text-[10px] font-semibold trk-muted">
            {weeks.filter(w => x(w) > 2 && x(w) < 96).map(w => <span key={w} className="absolute -translate-x-1/2 whitespace-nowrap" style={{ left: `${x(w)}%` }}>{shortDate(w)}</span>)}
          </div>
        </div>
        <div className="relative">
          <div className="absolute inset-y-0 right-0 pointer-events-none" style={{ left: 220 }}>
            {weeks.map(w => <span key={w} className="absolute inset-y-0" style={{ left: `${x(w)}%`, borderLeft: '1px solid rgba(232,236,255,.06)' }} />)}
            <span className="absolute inset-y-0" style={{ left: `${x(today)}%`, borderLeft: '2px solid #4a55ff', boxShadow: '0 0 12px #4a55ff' }} />
          </div>
          {rows.map(p => {
            const s = p.dates?.planned_start && p.dates.planned_start < start ? start : p.dates?.planned_start;
            const e = p.dates?.planned_end && p.dates.planned_end > addDays(start, total) ? addDays(start, total) : p.dates?.planned_end;
            const color = stageColor(p.stage);
            const dl = p.tracker?.deadline;
            const dlTone = dl ? (dl < today ? '#ff5c7a' : daysUntil(dl, today) <= 7 ? '#ffb547' : '#fff') : null;
            return (
              <button key={p.id} type="button" onClick={() => onOpen(p)} className="w-full flex items-center h-11 rounded-xl hover:bg-white/[.04] text-left">
                <div className="w-[220px] flex-none pr-3 flex items-center gap-2 min-w-0">
                  <span className="w-1.5 h-6 rounded-full flex-none" style={{ background: color }} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold truncate">{p.name}</span>
                    <span className="block text-[10px] trk-muted">{p.id} · {p.stage}</span>
                  </span>
                  <span className="ml-auto"><HealthDot health={p.tracker?.health} /></span>
                </div>
                <div className="relative flex-1 h-full">
                  {s && e && e >= s && (
                    <span className="absolute top-1/2 -translate-y-1/2 h-3 rounded-full" title={`${shortDate(p.dates.planned_start)} → ${shortDate(p.dates.planned_end)}`}
                      style={{ left: `${x(s)}%`, width: `${Math.max(0.6, x(addDays(e, 1)) - x(s))}%`, background: `${color}55`, boxShadow: `inset 0 0 0 1px ${color}` }} />
                  )}
                  {(p.shoot?.days || []).map(d => <Marker key={d} d={d} title={`Shoot · ${shortDate(d)}`} color="#fff"><Film size={13} /></Marker>)}
                  <Marker d={p.dates?.delivery} title={`Delivery · ${shortDate(p.dates?.delivery)}`} color="#8c93ff"><Send size={12} /></Marker>
                  <Marker d={p.dates?.air} title={`On air · ${shortDate(p.dates?.air)}`} color="#2fd38a"><Tv size={13} /></Marker>
                  <Marker d={dl} title={`${p.tracker?.deadline_label || 'Deadline'} · ${shortDate(dl)}`} color={dlTone}><Flag size={15} fill={dlTone || 'none'} /></Marker>
                </div>
              </button>
            );
          })}
          {!rows.length && <div className="py-10 text-center text-sm trk-muted">Nothing scheduled in these twelve weeks.</div>}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-[11px] trk-muted" style={{ paddingLeft: 220 }}>
          <span className="flex items-center gap-1.5"><span className="w-5 h-2 rounded-full" style={{ background: 'rgba(139,147,199,.4)', boxShadow: 'inset 0 0 0 1px #8b93c7' }} /> Planned</span>
          <span className="flex items-center gap-1.5"><Flag size={12} /> Our deadline</span>
          <span className="flex items-center gap-1.5"><Film size={12} /> Shoot</span>
          <span className="flex items-center gap-1.5"><Send size={12} /> Delivery</span>
          <span className="flex items-center gap-1.5"><Tv size={12} /> On air</span>
        </div>
      </div>
    </div>
  );
}

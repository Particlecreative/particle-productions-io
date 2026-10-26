import { useState } from 'react';
import { Film, Sparkles, Video, CalendarClock, Clapperboard, StickyNote } from 'lucide-react';
import {
  StageDot, HealthDot, FaceStack, TicketDots, BudgetBar, Signal, countdown, TONE, shortDate, relTime, isDone,
} from './parts';

const TYPE_ICON = { Shoot: Film, 'Remote Shoot': Video, AI: Sparkles };

/** The next thing that happens on a production: Gantt phase now / next, or the next shoot day. */
export function nextMilestone(p, today) {
  const m = p.milestone || {};
  if (m.current) return { icon: Clapperboard, text: `${m.current.title} · until ${shortDate(m.current.end)}`, now: true };
  const shoot = p.shoot?.next;
  const nxt = m.next;
  if (shoot && (!nxt || shoot <= nxt.start)) return { icon: Film, text: shoot === today ? 'Shooting today' : `Shoot · ${shortDate(shoot)}`, now: shoot === today };
  if (nxt) return { icon: CalendarClock, text: `${nxt.title} · ${shortDate(nxt.start)}` };
  return null;
}

export function ProductionCard({ p, today, onOpen, draggable, onDragStart, onDragEnd, dragging }) {
  const cd = countdown(p.tracker?.deadline, today);
  const ms = nextMilestone(p, today);
  const TypeIcon = TYPE_ICON[p.production_type];
  const internal = p.team?.internal || [];
  const external = p.team?.external || [];
  const done = isDone(p.stage);
  return (
    <button type="button" onClick={() => onOpen(p)} draggable={draggable}
      onDragStart={(e) => { e.dataTransfer.setData('text/plain', p.id); e.dataTransfer.effectAllowed = 'move'; onDragStart?.(p); }}
      onDragEnd={onDragEnd}
      className={`trk-card w-full p-4 flex flex-col gap-3 ${dragging ? 'is-dragging' : ''}`} style={done ? { opacity: 0.72 } : undefined}>
      <div className="flex items-center gap-2 text-[11px]">
        <span className="font-mono trk-muted">{p.id}</span>
        {p.production_type && <span className="trk-chip gray">{TypeIcon && <TypeIcon size={11} />}{p.production_type}</span>}
        <span className="ml-auto flex items-center gap-1.5">
          <HealthDot health={p.tracker?.health} />
          {p.stage_days != null && <span className="trk-dim" title={`In ${p.stage} since ${shortDate(p.stage_since?.slice(0, 10))}`}>{p.stage_days}d</span>}
        </span>
      </div>

      <div>
        <div className="trk-title text-[26px]">{p.name}</div>
        {p.product_type?.length > 0 && <div className="mt-1 text-[11px] trk-muted truncate">{p.product_type.join(' · ')}</div>}
      </div>

      {(cd || ms) && (
        <div className="flex items-end gap-3">
          {cd && (
            <div className="flex-none">
              <div className="trk-title text-[34px]" style={{ color: TONE[cd.tone] }}>{cd.unit === 'today' ? 'TODAY' : cd.n}</div>
              {cd.unit !== 'today' && <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: TONE[cd.tone], opacity: 0.8 }}>{cd.unit}</div>}
            </div>
          )}
          <div className="min-w-0 flex-1 text-[12px] leading-snug">
            {cd && <div className="font-semibold truncate">{p.tracker.deadline_label || 'Deadline'} · {shortDate(p.tracker.deadline)}</div>}
            {ms && (
              <div className="flex items-center gap-1.5 trk-muted truncate mt-0.5">
                <ms.icon size={12} className="flex-none" style={ms.now ? { color: '#2fd38a' } : undefined} />
                <span className="truncate">{ms.text}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {p.tracker?.notes && (
        <div className="flex gap-1.5 text-[12px] trk-muted leading-snug">
          <StickyNote size={12} className="flex-none mt-0.5" />
          <span className="line-clamp-2">{p.tracker.notes}</span>
        </div>
      )}

      {(internal.length > 0 || external.length > 0 || p.tickets?.length > 0) && (
        <div className="flex items-center gap-3 flex-wrap">
          {internal.length > 0 && <FaceStack list={internal} tone="internal" max={4} />}
          {external.length > 0 && <FaceStack list={external} tone="external" max={3} />}
          {p.tickets?.length > 0 && <span className="ml-auto"><TicketDots tickets={p.tickets} max={8} /></span>}
        </div>
      )}

      {!done && <BudgetBar budget={p.budget} />}

      {p.signals?.length > 0 && !done && (
        <div className="flex flex-wrap gap-1.5">{p.signals.slice(0, 2).map(s => <Signal key={s.kind} s={s} />)}{p.signals.length > 2 && <span className="trk-chip gray">+{p.signals.length - 2}</span>}</div>
      )}

      {p.last_activity && <div className="text-[10px] trk-dim">Updated {relTime(p.last_activity)}</div>}
    </button>
  );
}

/** Stage columns. Drag a card onto another column to move it there. */
export default function Board({ stages, productions, today, onOpen, onMove, canEdit }) {
  const [drag, setDrag] = useState(null);
  const [over, setOver] = useState(null);
  return (
    <div className="grid gap-4 overflow-x-auto trk-scroll pb-3 -mx-1 px-1" style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(220px, 1fr))` }}>
      {stages.map(stage => {
        const list = productions.filter(p => p.stage === stage);
        return (
          <div key={stage}
            onDragOver={(e) => { if (drag && drag.stage !== stage) { e.preventDefault(); setOver(stage); } }}
            onDragLeave={() => setOver(o => (o === stage ? null : o))}
            onDrop={(e) => { e.preventDefault(); setOver(null); if (drag && drag.stage !== stage) onMove(drag, stage); setDrag(null); }}
            className={`trk-col min-w-0 p-2 ${over === stage ? 'is-over' : ''}`}>
            <div className="flex items-center gap-2 px-2 pb-3">
              <StageDot stage={stage} />
              <span className="text-[12px] font-bold uppercase tracking-[0.16em]">{stage}</span>
              <span className="ml-auto text-[12px] font-semibold trk-muted">{list.length}</span>
            </div>
            <div className="flex flex-col gap-3 min-h-[80px]">
              {list.map(p => (
                <ProductionCard key={p.id} p={p} today={today} onOpen={onOpen} draggable={canEdit && !p.locked}
                  dragging={drag?.id === p.id} onDragStart={setDrag} onDragEnd={() => { setDrag(null); setOver(null); }} />
              ))}
              {!list.length && <div className="text-[12px] trk-dim text-center py-6 rounded-2xl" style={{ border: '1px dashed var(--trk-line)' }}>{drag ? 'Drop here' : 'Nothing here'}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

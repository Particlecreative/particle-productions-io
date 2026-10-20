import { AlertOctagon, CalendarClock, CheckCircle2, RefreshCcw, Wrench } from 'lucide-react';
import { useDeck } from '../deck/DeckContext';
import { Reveal, CountUp, m, EASE } from '../motion/Motion';
import { Avatar, ProductChip } from '../ui/Bits';
import { dayLabel, shortDate, displayName, withAlpha, ensureContrast } from '../deck/format';
import { SlideFrame, SlideHeader } from './SlideFrame';
import { decorate } from './specs';
import { BulletList } from './StorySlides';

// ── Workload heatmap ────────────────────────────────────────────────────────
export function WorkloadSlide({ slide, active }) {
  const { vm } = slide;
  const { layout, motionLevel } = useDeck();
  const canvas = layout === 'canvas';
  const today = new Date().toISOString().slice(0, 10);
  const rowH = canvas ? Math.min(92, Math.floor(640 / Math.max(vm.rows.length, 1)) - 10) : 52;
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 36 }}>
        <div className="cr-row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <SlideHeader slide={slide} subtitle={false} />
          <Reveal i={2} className="cr-small cr-hide-sm" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span>Items scheduled per day vs capacity</span>
            {[0.15, 0.45, 0.8, 1.1].map(v => <span key={v} style={{ width: 28, height: 20, borderRadius: 6, background: cellBg(v) }} />)}
          </Reveal>
        </div>
        <div className="cr-col cr-fill" style={{ gap: 10, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: `${canvas ? 380 : 110}px repeat(${vm.days.length}, minmax(0,1fr))`, gap: 10 }}>
            <span />
            {vm.days.map(d => (
              <Reveal key={d} i={2} y={8} className="cr-small" style={{ textAlign: 'center', fontWeight: 600, color: d === today ? '#fff' : undefined }}>
                {dayLabel(d)} <span style={{ opacity: 0.6, fontWeight: 400 }}>{shortDate(d).split(' ')[1]}</span>
              </Reveal>
            ))}
          </div>
          {vm.rows.map((r, ri) => (
            <Reveal key={r.person.id} i={3 + ri} x={-16} y={0} style={{ display: 'grid', gridTemplateColumns: `${canvas ? 380 : 110}px repeat(${vm.days.length}, minmax(0,1fr))`, gap: 10, height: rowH }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 0 }}>
                <Avatar person={r.person} size={canvas ? Math.min(52, rowH - 16) : 28} />
                <span className="cr-clamp-1" style={{ fontWeight: 600, fontSize: canvas ? 'var(--t-small)' : 13 }}>{canvas ? r.person.name : r.person.name.split(' ')[0]}</span>
              </div>
              {r.cells.map((c, ci) => {
                const load = c.count / r.capacity;
                return (
                  <m.div
                    key={c.date}
                    className="cr-heat-cell"
                    initial={motionLevel === 'static' ? false : { opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.5, ease: EASE, delay: 0.4 + ci * 0.08 + ri * 0.03 }}
                    style={{ background: cellBg(load), borderColor: load > 1 ? 'rgba(226,68,92,.7)' : undefined, outline: c.date === today ? '2px solid rgba(255,255,255,.35)' : undefined }}
                  >
                    {c.count > 0 && (
                      <>
                        <span className="cr-num" style={{ fontWeight: 800, fontSize: canvas ? 'var(--t-h3)' : 16, color: '#fff', fontFamily: 'var(--cr-font-display)' }}>{c.count}</span>
                        {canvas && (
                          <span style={{ display: 'flex', gap: 4 }}>
                            {c.products.map((p, i) => <span key={i} style={{ width: 9, height: 9, borderRadius: 99, background: ensureContrast(p, '#030b2e', 2.4) }} />)}
                          </span>
                        )}
                      </>
                    )}
                  </m.div>
                );
              })}
            </Reveal>
          ))}
        </div>
      </div>
    </SlideFrame>
  );
}

function cellBg(load) {
  if (!load) return 'rgba(255,255,255,.025)';
  if (load > 1) return 'linear-gradient(160deg, rgba(226,68,92,.75), rgba(8,8,248,.55))';
  return `rgba(74, 85, 255, ${0.14 + Math.min(load, 1) * 0.66})`;
}

// ── Planned next week ───────────────────────────────────────────────────────
export function PlannedNextSlide({ slide, active }) {
  const { snapshot, overrides, layout, onTicket } = useDeck();
  const { vm } = slide;
  const canvas = layout === 'canvas';
  const groups = vm.groups.slice(0, canvas ? 8 : 12);
  const cols = groups.length <= 2 ? groups.length : groups.length <= 6 ? 3 : 4;
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 40 }}>
        <div className="cr-row" style={{ justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <SlideHeader slide={slide} subtitle={false} />
          <Reveal i={2} style={{ textAlign: 'right' }}>
            <CountUp className="cr-kpi-num" value={vm.total} style={{ fontSize: 'calc(var(--t-kpi) * .6)' }} />
            <div className="cr-small" style={{ letterSpacing: '.08em', textTransform: 'uppercase' }}>tickets scheduled</div>
          </Reveal>
        </div>
        <div className="cr-grid cr-fill" style={{ gridTemplateColumns: `repeat(${Math.max(cols, 1)}, minmax(0,1fr))`, gridAutoRows: 'minmax(0,1fr)' }}>
          {groups.map((g, i) => (
            <Reveal key={g.key} i={3 + i} className="cr-card" style={{ padding: canvas ? 26 : 16, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                {g.person ? <Avatar person={g.person} size={canvas ? 52 : 34} /> : <span className="cr-chip-dot" style={{ background: g.color || '#8c93ff', width: 18, height: 18 }} />}
                <span className="cr-clamp-1" style={{ fontWeight: 700, fontSize: 'var(--t-body)', flex: 1 }}>{g.label}</span>
                <span className="cr-num" style={{ fontFamily: 'var(--cr-font-display)', fontWeight: 800, fontSize: 'var(--t-h3)', color: 'var(--cr-electric-soft)' }}>{g.items.length}</span>
              </div>
              <div className="cr-divider" />
              <div className="cr-col" style={{ gap: 10, minHeight: 0 }}>
                {g.items.slice(0, canvas ? 5 : 4).map(id => {
                  const it = decorate(snapshot, overrides, id);
                  return (
                    <div key={id} onClick={onTicket ? () => onTicket(it) : undefined} style={{ display: 'flex', gap: 10, alignItems: 'center', cursor: onTicket ? 'pointer' : undefined, minWidth: 0 }}>
                      <span className="cr-chip-dot" style={{ background: ensureContrast(it.product?.color || '#8c93ff', '#030b2e', 2.4), width: 10, height: 10 }} />
                      <span className="cr-clamp-1" style={{ fontSize: 'var(--t-small)', flex: 1 }}>{it.title}</span>
                      {it.deadline && <span className="cr-small" style={{ fontSize: 'calc(var(--t-small) * .8)', flex: 'none' }}>{dayLabel(it.deadline)}</span>}
                    </div>
                  );
                })}
                {g.items.length > (canvas ? 5 : 4) && <span className="cr-small" style={{ fontSize: 'calc(var(--t-small) * .85)' }}>+ {g.items.length - (canvas ? 5 : 4)} more</span>}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </SlideFrame>
  );
}

// ── Risks & blockers ────────────────────────────────────────────────────────
const RISK_COLS = [
  { key: 'stuck', label: 'Stuck', icon: AlertOctagon, color: '#e2445c' },
  { key: 'overdue', label: 'Overdue', icon: CalendarClock, color: '#fdab3d' },
  { key: 'fixes', label: 'Heavy fixes', icon: Wrench, color: '#cab641' },
  { key: 'reopened', label: 'Reopened', icon: RefreshCcw, color: '#9d50dd' },
];

export function RisksSlide({ slide, active }) {
  const { snapshot, overrides, layout, onTicket, motionLevel } = useDeck();
  const { vm } = slide;
  const canvas = layout === 'canvas';
  const cols = RISK_COLS.filter(c => vm[c.key]?.length);
  if (!cols.length) {
    return (
      <SlideFrame slide={slide} active={active}>
        <div className="cr-col" style={{ height: '100%', alignItems: 'center', justifyContent: 'center', gap: 30, textAlign: 'center' }}>
          <m.div initial={motionLevel === 'static' ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.9, ease: EASE, delay: 0.2 }}
            style={{ width: canvas ? 220 : 120, height: canvas ? 220 : 120, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, rgba(0,200,117,.35), rgba(0,200,117,0) 70%)' }}>
            <CheckCircle2 size={canvas ? 140 : 72} color="#00c875" strokeWidth={1.4} />
          </m.div>
          <Reveal i={2}><div className="cr-display" style={{ fontSize: 'calc(var(--t-display) * .6)' }}>All clear</div></Reveal>
          <Reveal i={3}><div className="cr-sub">Nothing stuck, overdue or bouncing between fixes rounds this week.</div></Reveal>
        </div>
      </SlideFrame>
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 40 }}>
        <SlideHeader slide={slide} subtitle={false} />
        <div className="cr-grid cr-fill cr-one-sm" style={{ gridTemplateColumns: `repeat(${cols.length}, minmax(0,1fr))` }}>
          {cols.map((c, ci) => {
            const Icon = c.icon;
            const list = vm[c.key];
            return (
              <Reveal key={c.key} i={2 + ci} className="cr-card" style={{ padding: canvas ? 28 : 18, display: 'flex', flexDirection: 'column', gap: 16, minHeight: 0, overflow: 'hidden', borderColor: withAlpha(c.color, 0.35) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ width: 52, height: 52, borderRadius: 16, background: withAlpha(c.color, 0.18), display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={28} color={c.color} /></span>
                  <span className="cr-h3" style={{ flex: 1 }}>{c.label}</span>
                  <span className="cr-num" style={{ fontFamily: 'var(--cr-font-display)', fontWeight: 800, fontSize: 'var(--t-h2)', color: c.color }}>{list.length}</span>
                </div>
                <div className="cr-col" style={{ gap: 14, minHeight: 0 }}>
                  {list.slice(0, canvas ? 6 : 4).map(id => {
                    const it = decorate(snapshot, overrides, id);
                    const owner = snapshot.people?.[it.people?.[0]];
                    const late = c.key === 'overdue' && it.deadline ? Math.max(0, Math.round((Date.parse(today) - Date.parse(it.deadline)) / 86400000)) : null;
                    return (
                      <div key={id} onClick={onTicket ? () => onTicket(it) : undefined} style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: onTicket ? 'pointer' : undefined, minWidth: 0 }}>
                        {owner ? <Avatar person={{ ...owner, name: displayName(owner.name) }} size={canvas ? 40 : 28} /> : <span style={{ width: 40 }} />}
                        <div className="cr-col" style={{ gap: 2, flex: 1, minWidth: 0 }}>
                          <span className="cr-clamp-1" style={{ fontSize: 'var(--t-small)', fontWeight: 600 }}>{it.title}</span>
                          <span className="cr-small cr-clamp-1" style={{ fontSize: 'calc(var(--t-small) * .78)' }}>
                            {[owner ? displayName(owner.name) : null, it.product?.label !== '-' ? it.product?.label : null, late ? `${late}d late` : null, c.key === 'fixes' ? `${it.fixes_in_week} fixes rounds` : null].filter(Boolean).join(' · ')}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                  {list.length > (canvas ? 6 : 4) && <span className="cr-small">+ {list.length - (canvas ? 6 : 4)} more</span>}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </SlideFrame>
  );
}

// ── CP weekly: productions ──────────────────────────────────────────────────
const STAGE_COLOR = { pending: '#9d99b9', 'pre-production': '#fdab3d', production: '#579bfc', post: '#ff7575', 'post-production': '#ff7575', completed: '#00c875', delivered: '#00c875' };

export function CpProductionsSlide({ slide, active }) {
  const { vm } = slide;
  const { layout } = useDeck();
  const canvas = layout === 'canvas';
  const list = vm.productions.slice(0, canvas ? 6 : 12);
  const cols = list.length <= 2 ? list.length : list.length <= 4 ? 2 : 3;
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 40 }}>
        <SlideHeader slide={slide} subtitle={false} />
        <div className="cr-grid cr-fill cr-one-sm" style={{ gridTemplateColumns: `repeat(${Math.max(cols, 1)}, minmax(0,1fr))`, gridAutoRows: 'minmax(0,1fr)' }}>
          {list.map((p, i) => {
            const sc = STAGE_COLOR[String(p.stage || '').toLowerCase()] || '#8c93ff';
            return (
              <Reveal key={p.production_id} i={2 + i} className="cr-card" style={{ padding: canvas ? 30 : 18, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, overflow: 'hidden' }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                  {p.stage && <span className="cr-chip" style={{ borderColor: withAlpha(sc, 0.55), background: withAlpha(sc, 0.18) }}><span className="cr-chip-dot" style={{ background: sc }} />{p.stage}</span>}
                  {p.cross_brand && <ProductChip product={{ label: p.brand?.name, color: p.brand?.color || '#B842A9' }} small />}
                  <span className="cr-small" style={{ marginLeft: 'auto', fontSize: 'calc(var(--t-small) * .8)', fontFamily: 'ui-monospace, monospace' }}>{p.production_id}</span>
                </div>
                <div className="cr-h3 cr-clamp-2" style={{ color: '#fff' }}>{p.name}</div>
                {(p.planned_start || p.planned_end) && (
                  <span className="cr-small" style={{ fontSize: 'calc(var(--t-small) * .85)' }}>
                    {shortDate(p.planned_start)}{p.planned_end ? ` → ${shortDate(p.planned_end)}` : ''}
                  </span>
                )}
                {p.note && <div className="cr-body cr-clamp-3" style={{ fontSize: 'var(--t-small)', color: 'var(--cr-mute)' }} dir="auto">{p.note}</div>}
                {p.bullets?.length > 0 && (
                  <div className="cr-col" style={{ gap: 6, marginTop: 'auto' }}>
                    {p.bullets.slice(0, 3).map((b, bi) => (
                      <div key={bi} style={{ display: 'flex', gap: 10, fontSize: 'calc(var(--t-small) * .92)' }} dir="auto">
                        <span style={{ color: 'var(--cr-electric-soft)' }}>•</span><span className="cr-clamp-2">{b.text}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Reveal>
            );
          })}
        </div>
      </div>
    </SlideFrame>
  );
}

// ── CP weekly: general updates ──────────────────────────────────────────────
export function CpUpdatesSlide({ slide, active }) {
  const { layout } = useDeck();
  const bullets = slide.vm.updates.map(u => u.text).filter(Boolean);
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-row" style={{ gap: 96, height: '100%' }}>
        <div className="cr-col cr-fixed-sm" style={{ width: layout === 'canvas' ? 520 : 'auto', flex: 'none' }}>
          <SlideHeader slide={slide} />
        </div>
        <div className="cr-col cr-fill" style={{ justifyContent: 'center' }}>
          <BulletList slide={slide} bullets={bullets} numbered={false} size="var(--t-h3)" max={9} />
        </div>
      </div>
    </SlideFrame>
  );
}

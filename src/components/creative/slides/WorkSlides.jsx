import { Film, PenTool } from 'lucide-react';
import { useDeck } from '../deck/DeckContext';
import { Reveal, CountUp, GrowBar, m, EASE } from '../motion/Motion';
import { Avatar, EditableText, ProductButton, SourceLinks, StatusChip, TicketTile } from '../ui/Bits';
import { dayLabel, withAlpha } from '../deck/format';
import { SlideFrame, SlideHeader } from './SlideFrame';
import { decorate, fmtLoad } from './specs';
import { DIVISIONS } from './divisions';
import { galleryGrid } from './DivisionSlides';

// ── Highlights ──────────────────────────────────────────────────────────────
export function HighlightsSlide({ slide, active }) {
  const { snapshot, overrides, onTicket, layout } = useDeck();
  const items = slide.vm.items.map(id => decorate(snapshot, overrides, id));
  const lay = slide.vm.layout;
  const canvas = layout === 'canvas';
  const grid = lay === 'grid-6'
    ? { gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gridTemplateRows: 'repeat(2, minmax(0,1fr))' }
    : lay === 'single'
      ? { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' }
      : { gridTemplateColumns: '1.9fr 1fr', gridTemplateRows: 'repeat(3, minmax(0,1fr))' };
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 40 }}>
        <SlideHeader slide={slide} subtitle={false} />
        <div className="cr-grid cr-fill" style={{ ...grid, gap: 24 }}>
          {items.map((it, i) => {
            const hero = lay !== 'grid-6' && i === 0;
            return (
              <Reveal
                key={it.id}
                i={2 + i}
                y={hero ? 30 : 24}
                scale={hero ? 0.98 : 1}
                className={hero ? 'cr-ratio-wide-sm' : 'cr-ratio-sm'}
                style={{ position: 'relative', minHeight: 0, gridRow: hero && lay === 'hero+3' && canvas ? '1 / span 3' : undefined }}
              >
                <TicketTile item={it} active={active} big={hero} onClick={onTicket} style={{ position: 'absolute', inset: 0 }} titleClamp={hero ? 2 : 2} />
              </Reveal>
            );
          })}
        </div>
      </div>
    </SlideFrame>
  );
}

// ── Person ──────────────────────────────────────────────────────────────────
function MiniStat({ label, value, accent, i }) {
  return (
    <Reveal i={i} className="cr-col" style={{ gap: 4 }}>
      <span className="cr-small" style={{ fontSize: 'calc(var(--t-small) * .8)', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600 }}>{label}</span>
      <span className="cr-num" style={{ fontFamily: 'var(--cr-font-display)', fontWeight: 800, fontSize: 'var(--t-h2)', color: accent || '#fff', lineHeight: 1 }}>{value}</span>
    </Reveal>
  );
}

/** Sun–Thu strip of what's scheduled for this person this week. */
function WeekStrip({ days, capacity, accent, i }) {
  const { motionLevel } = useDeck();
  const max = Math.max(capacity, ...days.map(d => d.load), 1);
  return (
    <Reveal i={i} className="cr-col" style={{ gap: 10 }}>
      <span className="cr-small" style={{ fontSize: 'calc(var(--t-small) * .8)', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600 }}>
        This week · {new Set(days.flatMap(d => d.ids)).size} projects
      </span>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${days.length || 5}, minmax(0,1fr))`, gap: 8 }}>
        {days.map(d => {
          const n = d.load;
          const over = n > capacity;
          return (
            <div key={d.date} className="cr-col" style={{ gap: 6, alignItems: 'center' }}>
              <div style={{ height: 64, width: '100%', borderRadius: 10, background: 'rgba(255,255,255,.04)', border: '1px solid var(--cr-hair)', display: 'flex', alignItems: 'flex-end', overflow: 'hidden', position: 'relative' }}>
                <m.div initial={motionLevel === 'static' ? false : { scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.9, ease: EASE, delay: 0.55 }}
                  style={{ width: '100%', height: `${(n / max) * 100}%`, background: over ? 'linear-gradient(180deg,#e2445c,#8c2bd6)' : withAlpha(accent, 0.75), transformOrigin: 'bottom center' }} />
                <span className="cr-num" style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--cr-font-display)', fontWeight: 800, fontSize: 'calc(var(--t-h3) * .9)', color: n ? '#fff' : 'var(--cr-faint)' }}>{fmtLoad(n) || '0'}</span>
              </div>
              <span className="cr-small" style={{ fontSize: 'calc(var(--t-small) * .78)', fontWeight: 600 }}>{dayLabel(d.date)}</span>
            </div>
          );
        })}
      </div>
    </Reveal>
  );
}

export function PersonSlide({ slide, active }) {
  const { snapshot, overrides, onTicket, editText, layout } = useDeck();
  const { vm } = slide;
  const canvas = layout === 'canvas';
  const tickets = vm.tickets.map(id => decorate(snapshot, overrides, id));
  const g = galleryGrid(tickets.length);
  const set = (slot) => (editText ? (v) => editText(slide.key, slot, v) : undefined);
  const RoleIcon = vm.role === 'video' ? Film : PenTool;
  const accent = DIVISIONS[vm.role]?.accent || '#4a55ff';
  const first = vm.page === 0;
  const mixTotal = vm.products.reduce((a, b) => a + b.total, 0) || 1;

  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-row" style={{ gap: 56, height: '100%' }}>
        {/* Left: who + numbers */}
        <div className="cr-col cr-fixed-sm" style={{ width: canvas ? 500 : 'auto', flex: 'none', gap: 22, overflow: canvas ? 'hidden' : undefined, height: canvas ? '100%' : undefined }}>
          <Reveal i={0} style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
            <Avatar person={vm.person} size={canvas ? (first ? 116 : 84) : 64} ring={withAlpha(accent, 0.75)} />
            <div className="cr-col" style={{ gap: 6 }}>
              <EditableText className="cr-eyebrow" value={slide.text.eyebrow} onCommit={set('eyebrow')} />
              <span className="cr-small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><RoleIcon size={18} color={accent} /> {DIVISIONS[vm.role]?.label || 'Creative'}</span>
            </div>
          </Reveal>
          <Reveal i={1}>
            <EditableText className="cr-title" value={slide.text.title} onCommit={set('title')} style={{ fontSize: canvas ? 'calc(var(--t-title) * .84)' : undefined }} />
          </Reveal>
          {(slide.text.subtitle || editText) && (
            <Reveal i={2}>
              <EditableText className="cr-sub cr-clamp-3" value={slide.text.subtitle} onCommit={set('subtitle')} multiline placeholder="One line about their week" style={{ fontSize: 'calc(var(--t-sub) * .8)' }} />
            </Reveal>
          )}
          {first && (
            <>
              <div style={{ display: 'flex', gap: 34 }}>
                <MiniStat i={3} label="Delivered" value={<CountUp value={vm.deliveredCount} delay={0.5} />} />
                <MiniStat i={4} label="In progress" value={vm.activeCount} />
                {vm.tvCount > 0 && <MiniStat i={5} label="TV" value={vm.tvCount} accent="#ff8a3d" />}
              </div>
              {vm.products.length > 0 && (
                <Reveal i={6} className="cr-col" style={{ gap: 12 }}>
                  <span className="cr-small" style={{ fontSize: 'calc(var(--t-small) * .8)', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600 }}>By product</span>
                  <div style={{ display: 'flex', height: 12, borderRadius: 99, overflow: 'hidden', gap: 3 }}>
                    {vm.products.map((p, i) => <GrowBar key={p.label} pct={(p.total / mixTotal) * 100} color={p.color} delay={0.2 + i * 0.05} style={{ borderRadius: 99 }} />)}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {vm.products.slice(0, 6).map(p => <ProductButton key={p.label} product={p.label} color={p.color} count={p.total} filter={{ uid: vm.person.id, division: vm.role }} />)}
                  </div>
                </Reveal>
              )}
              {vm.nextWeek.length > 0 && (
                <div style={{ marginTop: 'auto' }}>
                  <WeekStrip days={vm.nextWeek} capacity={vm.capacity} accent={accent} i={7} />
                </div>
              )}
            </>
          )}
        </div>

        {/* Right: the work they chose to show */}
        <div className="cr-col cr-fill" style={{ gap: 14 }}>
          {vm.showingActive && (
            <Reveal i={3} className="cr-small" style={{ letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600 }}>
              Nothing delivered last week · currently working on
            </Reveal>
          )}
          <div className="cr-grid cr-fill" style={{ gridTemplateColumns: `repeat(${g.cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${g.rows}, minmax(0,1fr))`, gap: 18 }}>
            {tickets.map((it, i) => (
              <Reveal key={it.id} i={3 + i} y={30} className="cr-ratio-sm" style={{ position: 'relative', minHeight: 0 }}>
                <TicketTile item={it} active={active} onClick={onTicket} style={{ position: 'absolute', inset: 0 }} big={tickets.length <= 2} />
                {vm.showingActive && it.status && <span style={{ position: 'absolute', top: 12, right: 12, fontSize: '0.7em' }}><StatusChip status={it.status} /></span>}
              </Reveal>
            ))}
            {!tickets.length && (
              <div className="cr-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gridColumn: '1 / -1' }}>
                <span className="cr-sub">{vm.manual ? 'No projects picked for this slide' : 'No tickets last week'}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </SlideFrame>
  );
}

export { SourceLinks };

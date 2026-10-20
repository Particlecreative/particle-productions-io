import { Clock, Film, Layers, PenTool, Timer } from 'lucide-react';
import { useDeck } from '../deck/DeckContext';
import { Reveal, CountUp, GrowBar } from '../motion/Motion';
import { Avatar, EditableText, ProductChip, SourceLinks, StatusChip, TicketTile } from '../ui/Bits';
import { fmtDays, fmtHours } from '../deck/format';
import { SlideFrame, SlideHeader } from './SlideFrame';
import { decorate } from './specs';

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
function galleryGrid(n) {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n === 2) return { cols: 2, rows: 1 };
  if (n === 3) return { cols: 3, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  return { cols: 4, rows: 2 };
}

function Stat({ icon: Icon, label, value, children, i }) {
  return (
    <Reveal i={i} className="cr-card" style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className="cr-small" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'calc(var(--t-small) * .82)', letterSpacing: '.06em', textTransform: 'uppercase' }}>
        <Icon size={18} /> {label}
      </span>
      <span className="cr-num" style={{ fontFamily: 'var(--cr-font-display)', fontWeight: 800, fontSize: 'var(--t-h2)', color: '#fff', lineHeight: 1 }}>
        {children ?? value}
      </span>
    </Reveal>
  );
}

export function PersonSlide({ slide, active }) {
  const { snapshot, overrides, onTicket, editText, layout } = useDeck();
  const { vm } = slide;
  const canvas = layout === 'canvas';
  const s = vm.stats || {};
  const tickets = vm.tickets.map(id => decorate(snapshot, overrides, id));
  const current = vm.current.map(id => decorate(snapshot, overrides, id));
  const showCurrentAsGallery = !tickets.length && current.length;
  const gallery = showCurrentAsGallery ? current.slice(0, 8) : tickets;
  const g = galleryGrid(gallery.length);
  const set = (slot) => (editText ? (v) => editText(slide.key, slot, v) : undefined);
  const RoleIcon = vm.person.role === 'video' ? Film : PenTool;
  const mix = s.products || [];
  const mixTotal = mix.reduce((a, b) => a + b.total, 0) || 1;

  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-row" style={{ gap: 64, height: '100%' }}>
        {/* Left: who + numbers */}
        <div className="cr-col cr-fixed-sm" style={{ width: canvas ? 560 : 'auto', flex: 'none', gap: 22, overflow: canvas ? 'hidden' : undefined, height: canvas ? '100%' : undefined }}>
          <Reveal i={0} style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
            <Avatar person={vm.person} size={canvas ? 132 : 72} ring="rgba(74,85,255,.65)" />
            <div className="cr-col" style={{ gap: 8 }}>
              <EditableText className="cr-eyebrow" value={slide.text.eyebrow} onCommit={set('eyebrow')} />
              <span className="cr-small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><RoleIcon size={18} /> {vm.person.role === 'video' ? 'Video' : 'Design'} team</span>
            </div>
          </Reveal>
          <Reveal i={1}>
            <EditableText className="cr-title" value={slide.text.title} onCommit={set('title')} style={{ fontSize: canvas ? 'calc(var(--t-title) * .92)' : undefined }} />
          </Reveal>
          <Reveal i={2}>
            <EditableText className="cr-sub" value={slide.text.subtitle} onCommit={set('subtitle')} multiline placeholder="One line about their week" style={{ fontSize: 'calc(var(--t-sub) * .86)' }} />
          </Reveal>
          {vm.page === 0 && (
            <>
              <div className="cr-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Stat i={3} icon={Layers} label="Delivered"><CountUp value={s.delivered ?? 0} delay={0.5} /></Stat>
                <Stat i={4} icon={Clock} label="In progress" value={s.in_progress ?? 0} />
                <Stat i={5} icon={Timer} label="Median turnaround" value={fmtDays(s.median_turnaround_days)} />
                <Stat i={6} icon={Film} label="Hrs in Working" value={fmtHours(s.tracked_hours)} />
              </div>
              {mix.length > 0 && (
                <Reveal i={7} className="cr-col" style={{ gap: 12 }}>
                  <div style={{ display: 'flex', height: 14, borderRadius: 99, overflow: 'hidden', gap: 3 }}>
                    {mix.map((p, i) => <GrowBar key={p.label} pct={(p.total / mixTotal) * 100} color={p.color || '#4a55ff'} delay={0.2 + i * 0.05} style={{ borderRadius: 99 }} />)}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                    {mix.slice(0, 4).map(p => <ProductChip key={p.label} product={{ label: `${p.label} · ${p.total}`, color: p.color }} small />)}
                  </div>
                </Reveal>
              )}
            </>
          )}
          {current.length > 0 && !showCurrentAsGallery && canvas && (
            <Reveal i={8} className="cr-hide-sm cr-clamp-2" style={{ marginTop: 'auto', flex: 'none', fontSize: 'var(--t-small)', color: 'var(--cr-mute)' }}>
              <span style={{ letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600, color: 'var(--cr-faint)', marginRight: 10 }}>Currently on</span>
              {current.slice(0, 2).map(it => it.title).join(' · ')}{current.length > 2 ? ` +${current.length - 2}` : ''}
            </Reveal>
          )}
        </div>

        {/* Right: the work */}
        <div className="cr-col cr-fill" style={{ gap: 18 }}>
          {showCurrentAsGallery ? (
            <Reveal i={3} className="cr-small" style={{ letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 600 }}>
              Nothing delivered yet this week · currently working on
            </Reveal>
          ) : vm.totalDelivered > tickets.length && vm.pages === 1 ? (
            <span className="cr-small">Showing {tickets.length} of {vm.totalDelivered}</span>
          ) : null}
          <div className="cr-grid cr-fill" style={{ gridTemplateColumns: `repeat(${g.cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${g.rows}, minmax(0,1fr))`, gap: 18 }}>
            {gallery.map((it, i) => (
              <Reveal key={it.id} i={3 + i} y={30} className="cr-ratio-sm" style={{ position: 'relative', minHeight: 0 }}>
                <TicketTile item={it} active={active} onClick={onTicket} style={{ position: 'absolute', inset: 0 }} big={gallery.length <= 2} />
                {showCurrentAsGallery && it.status && <span style={{ position: 'absolute', top: 14, left: 14 }}><StatusChip status={it.status} /></span>}
              </Reveal>
            ))}
            {!gallery.length && (
              <div className="cr-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gridColumn: '1 / -1' }}>
                <span className="cr-sub">No tickets this week</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </SlideFrame>
  );
}

export { SourceLinks };

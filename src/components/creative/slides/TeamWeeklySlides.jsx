import { Flame, Plane, Play, Image as ImageIcon, CheckCircle2, AlertTriangle, Clock3, BadgeCheck } from 'lucide-react';
import { useDeck } from '../deck/DeckContext';
import { Reveal, CountUp, GrowBar, m, EASE } from '../motion/Motion';
import { Avatar, ProductChip, StatusChip } from '../ui/Bits';
import { MediaImage, FallbackTile } from '../ui/Media';
import { dayLabel, shortDate, fmtDays, fmtHours, withAlpha, firstName } from '../deck/format';
import { SlideFrame, SlideHeader } from './SlideFrame';
import { BulletList } from './StorySlides';

// Creative Team Weekly. Team numbers lead; people are always in the same order; nothing is ranked.
const CAP = { fontSize: 'calc(var(--t-small) * .74)', letterSpacing: '.09em', textTransform: 'uppercase', fontWeight: 700 };
const DISPLAY = { fontFamily: 'var(--cr-font-display)', fontWeight: 800, lineHeight: 1 };

const money = (v) => (v == null ? '–' : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1000 ? `$${Math.round(v / 1000)}k` : `$${Math.round(v)}`);
const fmtMetric = (v, f) => (v == null ? '–' : f === 'money' ? money(v) : f === 'x' ? `${v.toFixed(2)}×` : f === 'pct' ? `${(v * 100).toFixed(v < 0.1 ? 1 : 0)}%` : String(v));
const hoursOrDays = (h) => (h == null ? '–' : h >= 24 ? fmtDays(h / 24) : fmtHours(h));

/** ↑ 12% vs last week — calm colours: up is green, down is amber, spend is neutral. */
function Delta({ value, neutral }) {
  if (value == null || !Number.isFinite(value)) return null;
  const up = value >= 0;
  const color = neutral ? 'var(--cr-faint)' : up ? '#3ddc97' : '#ffb547';
  return <span className="cr-small cr-num" style={{ color, fontWeight: 700 }}>{up ? '↑' : '↓'} {Math.abs(Math.round(value * 100))}% <span style={{ color: 'var(--cr-faint)', fontWeight: 500 }}>vs week before</span></span>;
}

function Thumb({ src, color = '#4a55ff', board = 'design', ratio = '4 / 5', radius = 18, label }) {
  return (
    <div style={{ position: 'relative', aspectRatio: ratio, borderRadius: radius, overflow: 'hidden', background: withAlpha(color, 0.25), flex: 'none' }}>
      {src ? <MediaImage src={src} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} fallback={<FallbackTile color={color} board={board} label={label} />} />
        : <FallbackTile color={color} board={board} label={label} />}
    </div>
  );
}

// ── Last week, together ──────────────────────────────────────────────────────
export function TeamWeekSlide({ slide, active }) {
  const { vm } = slide;
  const { layout } = useDeck();
  const canvas = layout === 'canvas';
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 40 }}>
        <SlideHeader slide={slide} subtitle={false} />
        <div className="cr-grid cr-fill cr-one-sm" style={{ gridTemplateColumns: canvas && vm.pulse ? 'minmax(0,1.1fr) minmax(0,1fr)' : '1fr', gap: 40, minHeight: 0 }}>
          <div className="cr-col" style={{ gap: canvas ? 34 : 18, minHeight: 0 }}>
            <Reveal i={2} className="cr-row" style={{ alignItems: 'baseline', gap: 22 }}>
              <span className="cr-num" style={{ ...DISPLAY, fontSize: canvas ? 200 : 88, color: '#fff' }}><CountUp value={vm.total} delay={0.3} /></span>
              <span style={{ fontSize: 'var(--t-h3)', fontWeight: 600, color: 'var(--cr-ice)' }}>deliveries,<br />together</span>
            </Reveal>
            <div className="cr-grid" style={{ gridTemplateColumns: `repeat(${vm.divisions.length + (vm.hours ? 1 : 0)}, minmax(0,1fr))`, gap: canvas ? 18 : 10 }}>
              {vm.divisions.map((d, i) => (
                <Reveal key={d.key} i={3 + i} className="cr-card" style={{ padding: canvas ? '20px 24px' : 12, borderColor: withAlpha(d.color, 0.45) }}>
                  <div className="cr-small" style={{ ...CAP, color: d.color }}>{d.label}</div>
                  <div className="cr-num" style={{ ...DISPLAY, fontSize: 'var(--t-h2)', color: '#fff', marginTop: 6 }}><CountUp value={d.count} delay={0.35 + i * 0.05} /></div>
                </Reveal>
              ))}
              {vm.hours ? (
                <Reveal i={6} className="cr-card" style={{ padding: canvas ? '20px 24px' : 12 }}>
                  <div className="cr-small" style={CAP}>Hands-on hours</div>
                  <div className="cr-num" style={{ ...DISPLAY, fontSize: 'var(--t-h2)', color: '#fff', marginTop: 6 }}><CountUp value={Math.round(vm.hours)} delay={0.5} format={(n) => `${Math.round(n)}h`} /></div>
                </Reveal>
              ) : null}
            </div>
            {vm.crew.length > 0 && (
              <Reveal i={7} className="cr-col" style={{ gap: 14, marginTop: 'auto' }}>
                <span className="cr-small" style={CAP}>Everyone who shipped</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: canvas ? 18 : 10 }}>
                  {vm.crew.map(p => (
                    <span key={p.id} className="cr-col" style={{ alignItems: 'center', gap: 8, width: canvas ? 92 : 56 }}>
                      <Avatar person={p} size={canvas ? 64 : 40} />
                      <span className="cr-small cr-clamp-1" style={{ fontSize: 'calc(var(--t-small) * .8)', textAlign: 'center', width: '100%' }}>{firstName(p.name)}</span>
                    </span>
                  ))}
                </div>
              </Reveal>
            )}
          </div>
          {vm.pulse && (
            <Reveal i={4} y={30} className="cr-card" style={{ padding: canvas ? '28px 32px' : 16, display: 'flex', flexDirection: 'column', gap: canvas ? 26 : 14 }}>
              <div className="cr-row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span className="cr-small" style={CAP}>Our week on Meta</span>
                {vm.inhouseShare != null && <span className="cr-small">{Math.round(vm.inhouseShare * 100)}% of spend on in-house creative</span>}
              </div>
              <div className="cr-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: canvas ? 26 : 14 }}>
                {vm.pulse.map((t, i) => (
                  <Reveal key={t.key} i={5 + i} className="cr-col" style={{ gap: 6 }}>
                    <span className="cr-small" style={CAP}>{t.label}</span>
                    <span className="cr-num" style={{ ...DISPLAY, fontSize: canvas ? 96 : 44, color: '#fff' }}>{fmtMetric(t.value, t.fmt)}</span>
                    <Delta value={t.delta} neutral={t.key === 'spend'} />
                    {t.note && canvas && <span className="cr-small" style={{ fontSize: 'calc(var(--t-small) * .66)' }}>{t.note}</span>}
                  </Reveal>
                ))}
              </div>
            </Reveal>
          )}
        </div>
      </div>
    </SlideFrame>
  );
}

// ── What the market told us ──────────────────────────────────────────────────
function Makers({ people, size, canvas }) {
  if (!people?.length) return null;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <span style={{ display: 'flex' }}>{people.slice(0, 3).map((p, i) => <span key={p.id} style={{ marginLeft: i ? -10 : 0 }}><Avatar person={p} size={size} ring="#030b2e" /></span>)}</span>
      <span className="cr-clamp-1" style={{ fontWeight: 600, fontSize: canvas ? 'var(--t-small)' : 13 }}>{people.map(p => firstName(p.name)).join(' & ')}</span>
    </span>
  );
}

function Metrics({ c, canvas }) {
  const parts = [['Spend', money(c.spend)], ['ROAS', fmtMetric(c.roas, 'x')], ['CTR', fmtMetric(c.ctr, 'pct')], ...(c.format === 'video' ? [['Thumbstop', fmtMetric(c.hook, 'pct')]] : [])];
  return (
    <div className="cr-grid" style={{ gridTemplateColumns: `repeat(${parts.length}, minmax(0,1fr))`, gap: 8 }}>
      {parts.map(([l, v]) => (
        <span key={l} className="cr-col" style={{ gap: 2, minWidth: 0 }}>
          <span className="cr-small" style={{ ...CAP, fontSize: 'calc(var(--t-small) * .58)' }}>{l}</span>
          <span className="cr-num" style={{ ...DISPLAY, fontSize: canvas ? 34 : 18, color: '#fff' }}>{v}</span>
        </span>
      ))}
    </div>
  );
}

export function MarketWinsSlide({ slide, active }) {
  const { vm } = slide;
  const { layout, media } = useDeck();
  const canvas = layout === 'canvas';
  const cols = Math.max(1, Math.min(vm.wins.length, 4));
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 34 }}>
        <SlideHeader slide={slide} subtitle={false} />
        <div className="cr-grid cr-fill cr-one-sm" style={{ gridTemplateColumns: canvas && vm.learnings.length ? 'minmax(0,2.2fr) minmax(0,1fr)' : '1fr', gap: 36, minHeight: 0 }}>
          <div className="cr-grid" style={{ gridTemplateColumns: canvas ? `repeat(${cols}, minmax(0,1fr))` : 'repeat(2, minmax(0,1fr))', gap: canvas ? 22 : 12, minHeight: 0, alignContent: 'start' }}>
            {vm.wins.map((c, i) => (
              <Reveal key={c.key} i={2 + i} y={30} className="cr-card" style={{ padding: canvas ? 16 : 10, display: 'flex', flexDirection: 'column', gap: canvas ? 14 : 8, minWidth: 0 }}>
                <div style={{ position: 'relative' }}>
                  <Thumb src={c.ref ? media.ref(c.ref, c.key, 'thumb') : null} color={c.product?.color || '#4a55ff'} board={c.format === 'video' ? 'video' : 'design'} label={c.label} />
                  <span className="cr-chip" style={{ position: 'absolute', top: 10, left: 10, background: 'rgba(3,11,46,.7)', borderColor: 'transparent' }}>
                    {c.format === 'video' ? <Play size={12} fill="currentColor" /> : <ImageIcon size={12} />} {c.format === 'video' ? 'Video' : 'Image'}
                  </span>
                </div>
                <span className="cr-clamp-2" style={{ fontWeight: 700, fontSize: canvas ? 'var(--t-small)' : 13, lineHeight: 1.2 }} title={c.label}>{c.title || c.label}</span>
                <Makers people={c.people} size={canvas ? 34 : 22} canvas={canvas} />
                <Metrics c={c} canvas={canvas} />
              </Reveal>
            ))}
          </div>
          {vm.learnings.length > 0 && (
            <div className="cr-col" style={{ gap: 18 }}>
              <span className="cr-small" style={CAP}>What we learned</span>
              <BulletList slide={slide} bullets={vm.learnings} numbered={false} size="var(--t-body)" startI={6} max={4} />
            </div>
          )}
        </div>
      </div>
    </SlideFrame>
  );
}

// ── Our work in market (one slide per team) ──────────────────────────────────
export function MarketPeopleSlide({ slide, active }) {
  const { vm } = slide;
  const { layout, media } = useDeck();
  const canvas = layout === 'canvas';
  const n = vm.cards.length;
  const cols = canvas ? Math.min(4, Math.max(2, Math.ceil(n / 2))) : 2;
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 30 }}>
        <SlideHeader slide={slide} subtitle={false} />
        <div className="cr-grid cr-fill" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gap: canvas ? 20 : 10, minHeight: 0, alignContent: 'start' }}>
          {vm.cards.map((c, i) => (
            <Reveal key={c.person.id} i={2 + i} y={24} className="cr-card" style={{ padding: canvas ? 18 : 10, display: 'flex', gap: canvas ? 18 : 10, minWidth: 0, opacity: c.live ? 1 : 0.6 }}>
              <div style={{ width: canvas ? 150 : 64, flex: 'none' }}>
                {c.best
                  ? <Thumb src={c.best.ref ? media.ref(c.best.ref, c.best.key, 'thumb') : null} color={c.best.product?.color || '#4a55ff'} board={c.best.format === 'video' ? 'video' : 'design'} radius={14} label={c.best.label} />
                  : <div style={{ aspectRatio: '4 / 5', borderRadius: 14, border: '1px dashed rgba(255,255,255,.18)' }} />}
              </div>
              <div className="cr-col" style={{ gap: canvas ? 10 : 6, minWidth: 0, flex: 1 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Avatar person={c.person} size={canvas ? 40 : 24} />
                  <span className="cr-clamp-1" style={{ fontWeight: 700, fontSize: canvas ? 'var(--t-small)' : 13 }}>{c.person.name}</span>
                </span>
                {c.live ? (
                  <>
                    <span className="cr-small">{c.live} {c.live === 1 ? 'creative' : 'creatives'} live last week</span>
                    {c.best && (
                      <>
                        <span className="cr-small" style={CAP}>Best of the week</span>
                        <span className="cr-clamp-2" style={{ fontWeight: 600, fontSize: canvas ? 'calc(var(--t-small) * .92)' : 12, lineHeight: 1.2 }} title={c.best.label}>{c.best.title || c.best.label}</span>
                        <span className="cr-small cr-num">
                          {[c.best.roas != null && `ROAS ${fmtMetric(c.best.roas, 'x')}`, c.best.ctr != null && `CTR ${fmtMetric(c.best.ctr, 'pct')}`, c.best.format === 'video' && c.best.hook != null && `Thumbstop ${fmtMetric(c.best.hook, 'pct')}`].filter(Boolean).join(' · ')}
                        </span>
                      </>
                    )}
                  </>
                ) : <span className="cr-small">Nothing live last week — new work is on the way.</span>}
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </SlideFrame>
  );
}

// ── This week: each person's main project ────────────────────────────────────
export function TeamFocusSlide({ slide, active }) {
  const { vm } = slide;
  const { layout, media, onTicket, openProduct } = useDeck();
  const canvas = layout === 'canvas';
  const n = vm.cards.length;
  const rows = canvas && n > 5 ? 2 : 1;
  const cols = canvas ? Math.max(1, Math.ceil(n / rows)) : 1;
  // How much fits in a column of the 1920×1080 canvas (header taken out); the busiest column sets the density
  const listH = rows === 1 ? 650 : 285;
  // each column sizes its own cards: a light week gets the big card, a busy one smaller cards (everything still shows)
  const densityFor = (k) => (!canvas ? 'compact'
    : FOCUS.feature + (k - 1) * (FOCUS.row + FOCUS.gap) <= listH ? 'roomy'
      : k * (FOCUS.row + FOCUS.gap) <= listH ? 'compact' : 'dense');
  const denseFits = Math.max(1, Math.floor((listH - 34) / (FOCUS.line + 6)));
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 26 }}>
        <SlideHeader slide={slide} subtitle={false} />
        <div className="cr-grid cr-fill" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoRows: canvas ? 'minmax(0,1fr)' : undefined, gap: canvas ? 18 : 10, minHeight: 0 }}>
          {vm.cards.map((c, i) => {
            const density = densityFor(c.tickets.length);
            const shown = density === 'dense' ? c.tickets.slice(0, denseFits) : c.tickets;
            const more = c.tickets.length > shown.length;
            const openAll = openProduct ? () => openProduct({ ids: c.tickets.map(t => t.id), title: `${c.person.name} · this week` }) : undefined;
            return (
              <Reveal key={c.person.id} i={2 + i} y={24} className="cr-card" style={{ padding: canvas ? 18 : 12, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0, minHeight: 0, overflow: 'hidden' }}>
                <div role={openAll ? 'button' : undefined} onClick={openAll} title={openAll ? 'See all their tickets' : undefined}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, cursor: openAll ? 'pointer' : undefined }}>
                  <Avatar person={c.person} size={canvas ? 44 : 28} />
                  <span className="cr-clamp-1" style={{ fontWeight: 700, fontSize: 'var(--t-small)', flex: 1, minWidth: 0 }}>{c.person.name}</span>
                  {c.off.length > 0 && <span className="cr-chip" title={c.off.map(shortDate).join(', ')} style={{ flex: 'none' }}><Plane size={12} /> Off {c.off.map(d => dayLabel(d)).join(', ')}</span>}
                </div>
                <div className="cr-col" style={{ gap: density === 'dense' ? 6 : FOCUS.gap, minHeight: 0 }}>
                  {shown.map((t, j) => {
                    const open = onTicket ? () => onTicket(t.id) : undefined;
                    const props = { t, days: vm.days, off: c.off, onClick: open, cover: media.cover(t), canvas };
                    if (density === 'roomy' && j === 0) return <FeatureTicket key={t.id} {...props} />;
                    if (density === 'dense') return <LineTicket key={t.id} {...props} />;
                    return <RowTicket key={t.id} {...props} />;
                  })}
                  {!c.tickets.length && <span className="cr-small">Nothing scheduled yet.</span>}
                </div>
                {more && openAll && (
                  <button type="button" onClick={openAll} className="cr-small" data-no-advance
                    style={{ marginTop: 'auto', alignSelf: 'flex-start', background: 'none', border: 0, padding: 0, color: '#8c93ff', fontWeight: 700, cursor: 'pointer' }}>
                    See all their tickets →
                  </button>
                )}
              </Reveal>
            );
          })}
        </div>
      </div>
    </SlideFrame>
  );
}

const FOCUS = { feature: 176, row: 92, line: 50, gap: 10 };

/** Sun–Thu strip: the days this ticket is planned, time off hatched. */
function DayStrip({ days, on, off, color, labels, height }) {
  if (!days.length) return null;
  return (
    <span style={{ display: 'flex', gap: 3 }} aria-hidden>
      {days.map(d => {
        const isOn = on.includes(d);
        const isOff = off.includes(d);
        return (
          <span key={d} title={shortDate(d)} style={{ flex: 1, height, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isOff ? 'repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 5px, rgba(255,255,255,.12) 5px 10px)' : isOn ? withAlpha(color, 0.8) : 'rgba(255,255,255,.07)',
            fontSize: 10, fontWeight: 700, color: isOn ? '#fff' : 'var(--cr-faint)' }}>
            {labels ? dayLabel(d).slice(0, 2) : ''}
          </span>
        );
      })}
    </span>
  );
}

const colorOf = (t) => t.product?.color || '#4a55ff';

function TicketKicker({ t }) {
  if (!t.hot && !t.main) return null;
  return (
    <span className="cr-small" style={{ ...CAP, fontSize: 'calc(var(--t-small) * .62)', display: 'flex', alignItems: 'center', gap: 5, color: t.hot ? '#ffb27a' : 'var(--cr-faint)' }}>
      {t.hot && <Flame size={12} />}{t.hot ? 'Hot project' : 'Main project'}
    </span>
  );
}

function FeatureTicket({ t, days, off, onClick, cover, canvas }) {
  return (
    <div role={onClick ? 'button' : undefined} onClick={onClick} style={{ display: 'flex', gap: 14, alignItems: 'flex-start', cursor: onClick ? 'pointer' : undefined, padding: 10, borderRadius: 16, background: withAlpha(colorOf(t), 0.12), border: `1px solid ${withAlpha(colorOf(t), 0.35)}` }}>
      <div style={{ width: canvas ? 112 : 60, flex: 'none' }}>
        <Thumb src={cover} color={colorOf(t)} board={t.board} radius={12} label={t.title} />
      </div>
      <div className="cr-col" style={{ gap: 8, minWidth: 0, flex: 1 }}>
        <TicketKicker t={t} />
        <span className="cr-clamp-2" style={{ ...DISPLAY, fontSize: canvas ? 32 : 20, textTransform: 'uppercase', color: '#fff' }} title={t.name}>{t.title || t.name}</span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <ProductChip product={t.product} small />
          <StatusChip status={t.status} />
        </span>
        <DayStrip days={days} on={t.days} off={off} color={colorOf(t)} labels={canvas} height={canvas ? 20 : 12} />
      </div>
    </div>
  );
}

function RowTicket({ t, days, off, onClick, cover, canvas }) {
  return (
    <div role={onClick ? 'button' : undefined} onClick={onClick} style={{ display: 'flex', gap: 12, alignItems: 'center', cursor: onClick ? 'pointer' : undefined, padding: 8, borderRadius: 14, background: 'rgba(255,255,255,.04)', border: `1px solid ${t.hot ? 'rgba(255,178,122,.45)' : 'rgba(255,255,255,.07)'}`, minHeight: canvas ? FOCUS.row : undefined }}>
      <div style={{ width: canvas ? 58 : 40, flex: 'none' }}>
        <Thumb src={cover} color={colorOf(t)} board={t.board} radius={9} label={t.title} />
      </div>
      <div className="cr-col" style={{ gap: 6, minWidth: 0, flex: 1 }}>
        <TicketKicker t={t} />
        <span className="cr-clamp-2" style={{ fontWeight: 700, fontSize: 'calc(var(--t-small) * .92)', lineHeight: 1.2, color: '#fff' }} title={t.name}>{t.title || t.name}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span className="cr-small cr-clamp-1" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'calc(var(--t-small) * .74)', minWidth: 0 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: colorOf(t), flex: 'none' }} />{t.product?.label && t.product.label !== '-' ? t.product.label : ''}
            {t.status?.label ? <span style={{ color: 'var(--cr-faint)' }}>· {t.status.label}</span> : null}
          </span>
        </span>
        <DayStrip days={days} on={t.days} off={off} color={colorOf(t)} height={canvas ? 7 : 5} />
      </div>
    </div>
  );
}

function LineTicket({ t, days, off, onClick }) {
  return (
    <div role={onClick ? 'button' : undefined} onClick={onClick} style={{ display: 'grid', gridTemplateColumns: '4px minmax(0,1fr) 92px', gap: 10, alignItems: 'center', cursor: onClick ? 'pointer' : undefined, minHeight: FOCUS.line, padding: '4px 8px 4px 0', borderRadius: 10, background: 'rgba(255,255,255,.035)' }}>
      <span style={{ alignSelf: 'stretch', borderRadius: 4, background: colorOf(t) }} />
      <span className="cr-col" style={{ gap: 2, minWidth: 0 }}>
        <span className="cr-clamp-1" style={{ fontWeight: 700, fontSize: 'calc(var(--t-small) * .86)', color: '#fff', display: 'flex', alignItems: 'center', gap: 5 }} title={t.name}>
          {t.hot && <Flame size={12} color="#ffb27a" style={{ flex: 'none' }} />}{t.title || t.name}
        </span>
        <span className="cr-small cr-clamp-1" style={{ fontSize: 'calc(var(--t-small) * .7)' }}>{[t.product?.label !== '-' ? t.product?.label : null, t.status?.label].filter(Boolean).join(' · ')}</span>
      </span>
      <DayStrip days={days} on={t.days} off={off} color={colorOf(t)} height={8} />
    </div>
  );
}

// ── The team's plate: this week and next, one total — never per person ─────────
const FULLNESS = (f) => (f == null ? ['No capacity set', '#8c93ff'] : f < 0.6 ? ['Room for more', '#3ddc97'] : f <= 0.95 ? ['Nicely full', '#8c93ff'] : f <= 1.1 ? ['At capacity', '#ffb547'] : ['Overbooked', '#ff6b81']);

export function TeamLoadSlide({ slide, active }) {
  const { vm } = slide;
  const { layout } = useDeck();
  const canvas = layout === 'canvas';
  const maxY = Math.max(1, ...vm.weeks.flatMap(w => w.days.map(x => Math.max(x.load, x.capacity))));
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 30 }}>
        <SlideHeader slide={slide} subtitle={false} />
        <div className="cr-grid cr-fill cr-one-sm" style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: canvas ? 28 : 12, minHeight: 0 }}>
          {vm.weeks.map((w, i) => <WeekLoad key={w.key} w={w} maxY={maxY} canvas={canvas} i={i} />)}
        </div>
        <span className="cr-small" style={{ color: 'var(--cr-faint)', fontSize: 'calc(var(--t-small) * .78)' }}>
          Bars: work planned for the whole team that day · line: what the team can take (time off taken out)
        </span>
      </div>
    </SlideFrame>
  );
}

function WeekLoad({ w, maxY, canvas, i }) {
  const [label, color] = FULLNESS(w.fullness);
  const H = canvas ? 250 : 120;
  const pctFull = w.fullness != null ? Math.round(w.fullness * 100) : null;
  return (
    <Reveal i={2 + i} y={30} className="cr-card" style={{ padding: canvas ? '28px 32px' : 16, display: 'flex', flexDirection: 'column', gap: canvas ? 20 : 12, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
        <span className="cr-h3" style={{ color: 'var(--cr-white)' }}>{w.label}</span>
        {w.from && <span className="cr-small">{shortDate(w.from)} – {shortDate(w.to)}</span>}
        {w.key === 'next' && <span className="cr-small" style={{ color: 'var(--cr-faint)' }}>· scheduled so far</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 24, flexWrap: 'wrap' }}>
        <div className="cr-col" style={{ gap: 6 }}>
          <CountUp className="cr-kpi-num" value={w.total} delay={0.45 + i * 0.1} style={{ fontSize: 'calc(var(--t-kpi) * .7)' }} />
          <span className="cr-small" style={{ ...CAP }}>projects on the team’s plate</span>
        </div>
        {w.total > 0 && <div className="cr-col" style={{ gap: 8, flex: 1, minWidth: 180, paddingBottom: 6 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="cr-chip" style={{ borderColor: withAlpha(color, 0.5), background: withAlpha(color, 0.14), color: '#fff' }}>
              <span className="cr-chip-dot" style={{ background: color }} />{label}
            </span>
            {pctFull != null && <span className="cr-small cr-num">{pctFull}% of capacity</span>}
          </span>
          {w.fullness != null && (
            <div style={{ position: 'relative', height: 10, borderRadius: 99, background: 'rgba(255,255,255,.07)' }}>
              <GrowBar className="cr-bar-seg" pct={Math.min(w.fullness, 1.25) / 1.25 * 100} color={color} delay={0.5 + i * 0.1} style={{ borderRadius: 99, height: '100%' }} />
              <span title="Full" style={{ position: 'absolute', left: `${100 / 1.25}%`, top: -4, bottom: -4, width: 2, background: 'rgba(255,255,255,.55)', borderRadius: 2 }} />
            </div>
          )}
        </div>}
      </div>
      {!w.total && (
        <div className="cr-col" style={{ flex: 1, alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 6, padding: 20, borderRadius: 18, border: '1px dashed rgba(255,255,255,.14)' }}>
          <span style={{ fontWeight: 700, fontSize: 'var(--t-small)' }}>Nothing on these days yet</span>
          <span className="cr-small" style={{ color: 'var(--cr-faint)' }}>It fills up as tickets get dates on Monday.</span>
        </div>
      )}
      {w.total > 0 && <div style={{ display: 'grid', gridTemplateColumns: `repeat(${w.days.length || 5}, minmax(0,1fr))`, gap: canvas ? 14 : 6, marginTop: 'auto' }}>
        {w.days.map((x, j) => {
          const over = x.capacity > 0 && x.load > x.capacity;
          const bar = (x.load / maxY) * H;
          const cap = (x.capacity / maxY) * H;
          return (
            <div key={x.d} className="cr-col" style={{ gap: 8, alignItems: 'stretch', minWidth: 0 }}>
              <div style={{ position: 'relative', height: H, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                <div style={{ width: '62%', height: Math.max(bar, x.load ? 4 : 0), borderRadius: '10px 10px 4px 4px', overflow: 'hidden', display: 'flex', alignItems: 'flex-end' }}>
                  <Grow color={over ? '#ffb547' : '#5d66ff'} delay={0.55 + i * 0.1 + j * 0.05} />
                </div>
                {x.capacity > 0 && <span style={{ position: 'absolute', left: '8%', right: '8%', bottom: cap, borderTop: '2px dashed rgba(255,255,255,.5)' }} />}
              </div>
              <span className="cr-small" style={{ textAlign: 'center', fontWeight: 700 }}>{dayLabel(x.d)} <span style={{ color: 'var(--cr-faint)', fontWeight: 500 }}>{x.d.slice(8)}</span></span>
              <span style={{ display: 'flex', justifyContent: 'center', gap: 2, minHeight: canvas ? 26 : 16 }} title={x.off.length ? `Out: ${x.off.map(p => p.name).join(', ')}` : undefined}>
                {x.off.slice(0, 4).map(p => <Avatar key={p.id} person={p} size={canvas ? 24 : 16} />)}
              </span>
            </div>
          );
        })}
      </div>}
    </Reveal>
  );
}

/** A bar that grows upward (the day columns). */
function Grow({ color, delay }) {
  const { motionLevel } = useDeck();
  const style = { width: '100%', height: '100%', background: color, transformOrigin: 'bottom center' };
  if (motionLevel === 'static') return <div style={style} />;
  return <m.div style={style} initial={{ scaleY: 0 }} animate={{ scaleY: 1 }} transition={{ duration: 0.7, ease: EASE, delay }} />;
}

// ── Hot projects ─────────────────────────────────────────────────────────────
const HEALTH = {
  on_track: ['On track', '#3ddc97', CheckCircle2],
  at_risk: ['At risk', '#ffb547', AlertTriangle],
  late: ['Late', '#ff6b81', Clock3],
  done: ['Delivered', '#3ddc97', BadgeCheck],
};

export function HotProjectsSlide({ slide, active }) {
  const { vm } = slide;
  const { layout } = useDeck();
  const canvas = layout === 'canvas';
  const n = Math.min(vm.projects.length, 6);
  const cols = canvas ? (n <= 3 ? n : 3) : 1;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 30 }}>
        <SlideHeader slide={slide} subtitle={false} />
        <div className="cr-grid cr-fill" style={{ gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0,1fr))`, gap: canvas ? 22 : 12, minHeight: 0, alignContent: 'start' }}>
          {vm.projects.slice(0, 6).map((p, i) => {
            const it = p.item;
            const [hl, hc, HIcon] = HEALTH[p.health?.key] || HEALTH.on_track;
            const due = it.deadline || it.timeline?.to;
            const days = due ? Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000) : null;
            const segs = it.journey || [];
            const a = segs.length ? Date.parse(segs[0].from) : 0;
            const b = segs.length ? Date.parse(segs[segs.length - 1].to) : 1;
            return (
              <Reveal key={p.id} i={2 + i} y={26} className="cr-card" style={{ padding: canvas ? 24 : 14, display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0,
                background: `radial-gradient(120% 120% at 100% 0%, ${withAlpha(it.product?.color || '#ff7a1a', 0.22)}, transparent 60%), rgba(255,255,255,.04)` }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Flame size={canvas ? 20 : 14} color="#ff8a3d" />
                  {it.priority?.label && <span className="cr-small" style={{ ...CAP, color: '#ffb27a' }}>{it.priority.label.replace(/[⚠️️]/g, '').trim()}</span>}
                  <span className="cr-chip" style={{ marginLeft: 'auto', color: hc, borderColor: withAlpha(hc, 0.5), background: withAlpha(hc, 0.12) }}><HIcon size={12} /> {hl}</span>
                </span>
                <span className="cr-clamp-2" style={{ ...DISPLAY, fontSize: canvas ? 46 : 22, textTransform: 'uppercase', color: '#fff' }}>{p.title}</span>
                <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}><ProductChip product={it.product} small /><StatusChip status={it.status} /></span>
                {segs.length > 0 && (
                  <div style={{ display: 'flex', height: canvas ? 10 : 6, borderRadius: 99, overflow: 'hidden', gap: 2 }}>
                    {segs.map((s, k) => <span key={k} style={{ width: `${((Date.parse(s.to) - Date.parse(s.from)) / Math.max(1, b - a)) * 100}%`, minWidth: 2, background: s.color || '#8c93ff' }} />)}
                  </div>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 'auto' }}>
                  <span style={{ display: 'flex' }}>{p.owners.slice(0, 3).map((o, k) => <span key={o.id} style={{ marginLeft: k ? -10 : 0 }}><Avatar person={o} size={canvas ? 36 : 24} ring="#030b2e" /></span>)}</span>
                  <span className="cr-small cr-clamp-1" style={{ flex: 1 }}>{p.owners.map(o => firstName(o.name)).join(', ')}{p.askers.length ? ` · for ${p.askers.map(firstName).join(', ')}` : ''}</span>
                  {days != null && it.open !== false && (
                    <span className="cr-num" style={{ fontWeight: 700, fontSize: 'var(--t-small)', color: days < 0 ? '#ff6b81' : days <= 2 ? '#ffb547' : 'var(--cr-ice)', whiteSpace: 'nowrap' }}>
                      {days < 0 ? `${-days}d late` : days === 0 ? 'Due today' : `${days}d left`}
                    </span>
                  )}
                </span>
              </Reveal>
            );
          })}
        </div>
      </div>
    </SlideFrame>
  );
}

// ── SLAs ─────────────────────────────────────────────────────────────────────
export function SlaSlide({ slide, active }) {
  const { vm } = slide;
  const { layout } = useDeck();
  const canvas = layout === 'canvas';
  const cols = canvas ? 'minmax(0,1.6fr) 70px repeat(4, minmax(0,1fr)) 90px' : 'minmax(0,1.4fr) 34px repeat(2, minmax(0,1fr))';
  const maxTotal = Math.max(1, ...vm.rows.map(r => r.total || 0));
  const head = canvas
    ? ['Task type', 'Tasks', 'Request → completed', 'In Working', 'In Fixes', 'People-hours', 'Fix rounds']
    : ['Task type', '#', 'Request → done', 'People-hours'];
  const cells = (r) => (canvas
    ? [hoursOrDays(r.working), hoursOrDays(r.fixes), r.hours != null ? fmtHours(r.hours) : '–', r.fixRounds ?? '–']
    : [r.hours != null ? fmtHours(r.hours) : '–']);
  const Row = ({ r, i, strong }) => (
    <Reveal i={i} x={-14} y={0} style={{ display: 'grid', gridTemplateColumns: cols, gap: 14, alignItems: 'center', padding: strong ? '12px 0 0' : 0, borderTop: strong ? '1px solid rgba(255,255,255,.12)' : undefined }}>
      <span className="cr-clamp-1" style={{ fontWeight: strong ? 800 : 600, fontSize: 'var(--t-small)' }}>{r.label}</span>
      <span className="cr-small cr-num" style={{ textAlign: 'right' }}>{r.n}</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ flex: 1, height: canvas ? 12 : 8, borderRadius: 99, background: 'rgba(255,255,255,.06)', overflow: 'hidden', display: 'flex' }}>
          <GrowBar pct={((r.total || 0) / maxTotal) * 100} color={strong ? '#ffffff' : '#4a55ff'} delay={0.3 + i * 0.04} style={{ borderRadius: 99 }} />
        </span>
        <span className="cr-num" style={{ fontWeight: 700, fontSize: 'var(--t-small)', minWidth: canvas ? 64 : 36, textAlign: 'right' }}>{fmtDays(r.total)}</span>
      </span>
      {cells(r).map((v, k) => <span key={k} className="cr-small cr-num" style={{ textAlign: 'right', fontWeight: strong ? 700 : 500 }}>{v}</span>)}
    </Reveal>
  );
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 30 }}>
        <SlideHeader slide={slide} subtitle={false} />
        <Reveal i={2} y={30} className="cr-card cr-fill" style={{ padding: canvas ? '26px 32px' : 14, display: 'flex', flexDirection: 'column', gap: canvas ? Math.max(12, Math.min(26, Math.floor(260 / Math.max(vm.rows.length, 1)))) : 10, minHeight: 0, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 14 }} className="cr-small">
            {head.map((h, k) => <span key={h} style={{ ...CAP, fontSize: 'calc(var(--t-small) * .62)', textAlign: k === 0 || k === 2 ? 'left' : 'right' }}>{h}</span>)}
          </div>
          {vm.rows.map((r, i) => <Row key={r.label} r={r} i={3 + i} />)}
          {vm.overall && <Row r={vm.overall} i={3 + vm.rows.length} strong />}
          {vm.mix.length > 0 && (
            <Reveal i={4 + vm.rows.length} className="cr-col" style={{ gap: 10, marginTop: 'auto' }}>
              <span className="cr-small" style={CAP}>Where a task's time went</span>
              <div style={{ display: 'flex', height: canvas ? 16 : 10, borderRadius: 99, overflow: 'hidden', gap: 3 }}>
                {vm.mix.map((p, k) => <GrowBar key={p.key} pct={p.pct} color={p.color} delay={0.4 + k * 0.05} />)}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px' }}>
                {vm.mix.map(p => <span key={p.key} className="cr-small" style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: p.color }} />{p.label} <b className="cr-num">{p.pct}%</b></span>)}
              </div>
              <span className="cr-small" style={{ fontSize: 'calc(var(--t-small) * .62)' }}>
                Medians of last week's completed tasks · In Working / In Fixes = calendar time in that status · people-hours = everyone's clocked-in time while it was in Working
              </span>
            </Reveal>
          )}
        </Reveal>
      </div>
    </SlideFrame>
  );
}

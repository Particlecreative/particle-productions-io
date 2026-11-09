import { Flame, Plane, Play, Image as ImageIcon, CheckCircle2, AlertTriangle, Clock3, BadgeCheck } from 'lucide-react';
import { useDeck } from '../deck/DeckContext';
import { Reveal, CountUp, GrowBar } from '../motion/Motion';
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
  const { layout, media, onTicket } = useDeck();
  const canvas = layout === 'canvas';
  const n = vm.cards.length;
  const cols = canvas ? (n <= 3 ? n : n <= 4 ? 2 : n <= 6 ? 3 : 4) : 1;
  const compact = canvas && n > 6;
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 30 }}>
        <SlideHeader slide={slide} subtitle={false} />
        <div className="cr-grid cr-fill" style={{ gridTemplateColumns: `repeat(${Math.max(1, cols)}, minmax(0,1fr))`, gap: canvas ? 20 : 10, minHeight: 0, alignContent: 'start' }}>
          {vm.cards.map((c, i) => {
            const m = c.main;
            return (
              <Reveal key={c.person.id} i={2 + i} y={24} className="cr-card" style={{ padding: canvas ? (compact ? 16 : 22) : 12, display: 'flex', flexDirection: 'column', gap: compact ? 10 : 14, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <Avatar person={c.person} size={canvas ? (compact ? 36 : 48) : 28} />
                  <span className="cr-clamp-1" style={{ fontWeight: 700, fontSize: 'var(--t-small)', flex: 1 }}>{c.person.name}</span>
                  {c.off.length > 0 && (
                    <span className="cr-chip" title={c.off.map(shortDate).join(', ')}><Plane size={12} /> Off {c.off.map(d => dayLabel(d)).join(', ')}</span>
                  )}
                </span>
                {m ? (
                  <div role={onTicket ? 'button' : undefined} onClick={onTicket ? () => onTicket(m.id) : undefined} style={{ display: 'flex', gap: canvas ? 16 : 10, alignItems: 'flex-start', cursor: onTicket ? 'pointer' : undefined }}>
                    {!compact && (
                      <div style={{ width: canvas ? 110 : 52, flex: 'none' }}>
                        <Thumb src={media.cover(m)} color={m.product?.color || '#4a55ff'} board={m.board} radius={12} label={m.title} />
                      </div>
                    )}
                    <div className="cr-col" style={{ gap: 8, minWidth: 0, flex: 1 }}>
                      <span className="cr-small" style={{ ...CAP, display: 'flex', alignItems: 'center', gap: 6, color: m.hot ? '#ffb27a' : undefined }}>
                        {m.hot && <Flame size={13} />}{m.hot ? 'Hot project' : 'Main project'}
                      </span>
                      <span className={compact ? 'cr-clamp-1' : 'cr-clamp-2'} style={{ ...DISPLAY, fontSize: canvas ? (compact ? 30 : 40) : 20, textTransform: 'uppercase', color: '#fff' }} title={m.name}>{m.title || m.name}</span>
                      <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        <ProductChip product={m.product} small />
                        {!compact && <StatusChip status={m.status} />}
                      </span>
                      {vm.days.length > 0 && (
                        <span style={{ display: 'flex', gap: 4 }}>
                          {vm.days.map(d => {
                            const on = m.days.includes(d);
                            const off = c.off.includes(d);
                            return (
                              <span key={d} title={shortDate(d)} style={{ flex: 1, height: canvas ? 22 : 14, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                background: off ? 'repeating-linear-gradient(135deg, rgba(255,255,255,.05) 0 6px, rgba(255,255,255,.12) 6px 12px)' : on ? withAlpha(m.product?.color || '#4a55ff', 0.75) : 'rgba(255,255,255,.06)',
                                fontSize: canvas ? 11 : 8, fontWeight: 700, color: on ? '#fff' : 'var(--cr-faint)' }}>
                                {canvas ? dayLabel(d).slice(0, 2) : ''}
                              </span>
                            );
                          })}
                        </span>
                      )}
                    </div>
                  </div>
                ) : <span className="cr-small">Nothing scheduled yet.</span>}
                {c.rest.length > 0 && (
                  <div className="cr-col" style={{ gap: 4, borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: compact ? 8 : 10 }}>
                    <span className="cr-small" style={{ ...CAP, fontSize: 'calc(var(--t-small) * .6)' }}>Also this week</span>
                    {c.rest.slice(0, compact ? 2 : 3).map(it => (
                      <span key={it.id} className="cr-small cr-clamp-1" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 99, background: it.product?.color || '#8c93ff', flex: 'none' }} />
                        {it.hot && <Flame size={11} color="#ffb27a" />}{it.title || it.name}
                      </span>
                    ))}
                    {c.rest.length > (compact ? 2 : 3) && <span className="cr-small" style={{ color: 'var(--cr-faint)' }}>+{c.rest.length - (compact ? 2 : 3)} more</span>}
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

import { CalendarDays, Clapperboard, Film, PenTool, Sparkles, Tv, UserRound } from 'lucide-react';
import { useDeck } from '../deck/DeckContext';
import { Reveal, CountUp, GrowBar, m, EASE } from '../motion/Motion';
import { Avatar, DeltaBadge, EditableText, ProductButton, ProductChip, Sparkline, TicketTile, SourceButtons } from '../ui/Bits';
import { MediaImage, FallbackTile } from '../ui/Media';
import { dayLabel, shortDate, withAlpha, ensureContrast, fmtDays } from '../deck/format';
import { SlideFrame, SlideHeader } from './SlideFrame';
import { BulletList } from './StorySlides';
import { decorate } from './specs';

const DIV_ICON = { design: PenTool, video: Film, tv: Tv };
const STAGE_COLOR = { pending: '#9d99b9', 'pre-production': '#fdab3d', production: '#579bfc', post: '#ff7575', 'post-production': '#ff7575', completed: '#00c875', delivered: '#00c875' };
const stageColor = (s) => STAGE_COLOR[String(s || '').toLowerCase()] || '#8c93ff';

/** Uniform tile grid that fits any count (1 → 12) without cropping work. */
export function galleryGrid(n) {
  if (n <= 1) return { cols: 1, rows: 1 };
  if (n <= 3) return { cols: n, rows: 1 };
  if (n === 4) return { cols: 2, rows: 2 };
  if (n <= 6) return { cols: 3, rows: 2 };
  if (n <= 8) return { cols: 4, rows: 2 };
  if (n <= 10) return { cols: 5, rows: 2 };
  return { cols: 4, rows: 3 };
}

function Label({ children, style }) {
  return <span className="cr-small" style={{ letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600, fontSize: 'calc(var(--t-small) * .82)', ...style }}>{children}</span>;
}

function MiniStat({ label, value, accent }) {
  return (
    <div className="cr-col" style={{ gap: 4 }}>
      <Label>{label}</Label>
      <span className="cr-num" style={{ fontFamily: 'var(--cr-font-display)', fontWeight: 800, fontSize: 'var(--t-h2)', lineHeight: 1, color: accent || 'var(--cr-white)' }}>{value}</span>
    </div>
  );
}

// ── Department at a glance ──────────────────────────────────────────────────
export function DeptOverviewSlide({ slide, active }) {
  const { vm } = slide;
  const { layout } = useDeck();
  const canvas = layout === 'canvas';
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 48 }}>
        <SlideHeader slide={slide} subtitle={false} />
        <div className="cr-grid cr-fill cr-one-sm" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 28 }}>
          {vm.divisions.map((d, i) => {
            const Icon = DIV_ICON[d.key];
            return (
              <Reveal key={d.key} i={2 + i} y={40} className="cr-card" style={{ padding: canvas ? '36px 40px 32px' : 22, display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0, overflow: 'hidden', borderColor: withAlpha(d.accent, 0.4) }}>
                <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 6, background: d.accent }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <span style={{ width: 52, height: 52, borderRadius: 16, background: withAlpha(d.accent, 0.2), display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon size={28} color={d.accent} /></span>
                  <span className="cr-h3" style={{ color: 'var(--cr-white)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: 'calc(var(--t-h3) * .82)' }}>{d.label}</span>
                </div>
                <div className="cr-col" style={{ gap: 6 }}>
                  <CountUp className="cr-kpi-num" value={d.key === 'tv' && !d.delivered && d.productions ? d.productions : d.delivered} delay={0.5 + i * 0.12} style={{ fontSize: 'calc(var(--t-kpi) * .9)' }} />
                  <Label>{d.key === 'tv' && !d.delivered && d.productions ? 'productions in the CP weekly' : 'delivered last week'}</Label>
                </div>
                <div style={{ minHeight: 30 }}>{d.delta != null && !(d.key === 'tv' && !d.delivered) && <DeltaBadge value={d.delta} suffix="vs week before" />}</div>
                {d.trend?.length > 1 && (
                  <div className="cr-hide-sm">
                    <Sparkline values={d.trend} width={canvas ? 430 : 220} height={70} color={d.accent} />
                  </div>
                )}
                <div className="cr-divider" style={{ marginTop: 'auto' }} />
                <div style={{ display: 'flex', gap: 36 }}>
                  <MiniStat label="In progress" value={d.inProgress} />
                  <MiniStat label="This week" value={d.planned} accent={d.accent} />
                  {d.key === 'tv' && d.delivered > 0 && <MiniStat label="Productions" value={d.productions} />}
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </SlideFrame>
  );
}

// ── Division overview (dashboard before the per-person drill-down) ─────────
export function DivisionOverviewSlide({ slide, active }) {
  const { vm } = slide;
  if (vm.division === 'tv') return <TvOverview slide={slide} active={active} />;
  return <TeamDivisionOverview slide={slide} active={active} />;
}

function KpiColumn({ vm, canvas }) {
  const s = vm.stats;
  const accent = vm.meta.accent;
  return (
    <Reveal i={2} y={30} className="cr-card" style={{ padding: canvas ? '30px 34px' : 20, display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 6, background: accent }} />
      <Label>Delivered last week</Label>
      <CountUp className="cr-kpi-num" value={s.delivered.length} delay={0.45} style={{ fontSize: 'calc(var(--t-kpi) * .82)' }} />
      <div style={{ minHeight: 28 }}>{s.delta != null && <DeltaBadge value={s.delta} suffix="vs week before" />}</div>
      {s.trend?.length > 1 && <div className="cr-hide-sm"><Sparkline values={s.trend} width={canvas ? 330 : 200} height={64} color={accent} /></div>}
      <div className="cr-divider" style={{ marginTop: 'auto' }} />
      <div className="cr-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 22 }}>
        <MiniStat label="In progress" value={s.inProgress.length} />
        <MiniStat label="In review" value={s.inReview.length} />
        <MiniStat label="This week" value={s.planned.length} accent={accent} />
        <MiniStat label="Turnaround" value={s.medianTurnaround != null ? fmtDays(s.medianTurnaround) : '–'} />
      </div>
    </Reveal>
  );
}

function TeamDivisionOverview({ slide, active }) {
  const { vm } = slide;
  const { layout } = useDeck();
  const canvas = layout === 'canvas';
  const maxP = Math.max(1, ...vm.byProduct.map(r => r.total));
  const maxPerson = Math.max(1, ...vm.byPerson.map(r => r.total));
  const rowH = canvas ? Math.min(56, Math.floor(470 / Math.max(vm.byProduct.length, vm.byPerson.length, 1)) - 10) : 40;
  const filter = { division: vm.division };
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 40 }}>
        <SlideHeader slide={slide} subtitle={false} />
        <div className="cr-grid cr-fill cr-one-sm" style={{ gridTemplateColumns: canvas ? '420px minmax(0,1.1fr) minmax(0,1fr)' : '1fr', gap: 28 }}>
          <KpiColumn vm={vm} canvas={canvas} />

          {/* By product — click a product to see all of its projects */}
          <Reveal i={3} y={30} className="cr-card" style={{ padding: canvas ? '28px 32px' : 18, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
              <span className="cr-h3" style={{ color: 'var(--cr-white)', flex: 1 }}>By product</span>
              <Label>tap to open</Label>
            </div>
            <div className="cr-col" style={{ gap: 10, flex: 1, justifyContent: vm.byProduct.length > 5 ? 'space-between' : 'flex-start' }}>
              {vm.byProduct.map((r, i) => {
                const c = ensureContrast(r.color || '#8c93ff', '#030b2e', 2.6);
                return (
                  <div key={r.label} style={{ display: 'grid', gridTemplateColumns: canvas ? '220px 1fr 56px' : '110px 1fr 36px', alignItems: 'center', gap: 16, height: rowH }}>
                    <ProductButton product={r.label} color={r.color} filter={filter} style={{ justifySelf: 'start', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis' }} />
                    <div style={{ height: Math.max(14, rowH * 0.42), display: 'flex' }}>
                      <div className="cr-bar-track" style={{ width: `${(r.total / maxP) * 100}%`, minWidth: 10, background: 'transparent' }}>
                        <GrowBar className="cr-bar-seg" pct={100} color={c} delay={i * 0.05} />
                      </div>
                    </div>
                    <CountUp className="cr-num" value={r.total} delay={0.4 + i * 0.05} style={{ fontFamily: 'var(--cr-font-display)', fontWeight: 800, fontSize: 'var(--t-h3)', color: '#fff', textAlign: 'right' }} />
                  </div>
                );
              })}
              {!vm.byProduct.length && <span className="cr-small">Nothing delivered last week.</span>}
            </div>
          </Reveal>

          {/* By person, split by department (who the work was for) */}
          <Reveal i={4} y={30} className="cr-card" style={{ padding: canvas ? '28px 32px' : 18, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, overflow: 'hidden' }}>
            <span className="cr-h3" style={{ color: 'var(--cr-white)' }}>By {vm.meta.peopleLabel}</span>
            <div className="cr-col" style={{ gap: 10, flex: 1 }}>
              {vm.byPerson.map((r, i) => (
                <div key={r.person.id} style={{ display: 'grid', gridTemplateColumns: canvas ? '44px 150px 1fr 48px' : '28px 80px 1fr 30px', alignItems: 'center', gap: 14, height: rowH }}>
                  <Avatar person={r.person} size={canvas ? 44 : 28} />
                  <span className="cr-clamp-1" style={{ fontWeight: 600, fontSize: 'var(--t-small)' }}>{r.person.name.split(' ')[0]}</span>
                  <div style={{ height: Math.max(14, rowH * 0.42), display: 'flex' }}>
                    <div className="cr-bar-track" style={{ width: `${(r.total / maxPerson) * 100}%`, minWidth: 10, gap: 3, background: 'transparent' }}>
                      {r.segments.map((sg, j) => (
                        <GrowBar key={sg.label} className="cr-bar-seg" pct={(sg.count / r.total) * 100} color={ensureContrast(sg.color, '#030b2e', 2.4)} delay={i * 0.05 + j * 0.04} />
                      ))}
                    </div>
                  </div>
                  <span className="cr-num" style={{ fontFamily: 'var(--cr-font-display)', fontWeight: 800, fontSize: 'var(--t-h3)', color: '#fff', textAlign: 'right' }}>{r.total}</span>
                </div>
              ))}
              {!vm.byPerson.length && <span className="cr-small">No deliveries yet.</span>}
            </div>
            {vm.departments.length > 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px' }}>
                {vm.departments.slice(0, 6).map(d => (
                  <span key={d.label} className="cr-small" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'calc(var(--t-small) * .8)' }}>
                    <span style={{ width: 14, height: 14, borderRadius: 4, background: ensureContrast(d.color, '#030b2e', 2.4) }} />{d.label}
                  </span>
                ))}
              </div>
            )}
          </Reveal>
        </div>
      </div>
    </SlideFrame>
  );
}

function TvOverview({ slide, active }) {
  const { vm } = slide;
  const { layout } = useDeck();
  const canvas = layout === 'canvas';
  const list = vm.productions.slice(0, canvas ? 6 : 12);
  const cols = list.length <= 1 ? 1 : list.length <= 4 ? 2 : 3;
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 40 }}>
        <SlideHeader slide={slide} subtitle={false} />
        <div className="cr-grid cr-fill cr-one-sm" style={{ gridTemplateColumns: canvas ? '420px minmax(0,1fr)' : '1fr', gap: 28 }}>
          <KpiColumn vm={vm} canvas={canvas} />
          <div className="cr-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))`, gridAutoRows: 'minmax(0,1fr)', gap: 20, minHeight: 0 }}>
            {list.map((p, i) => <ProductionCard key={p.production_id} p={p} i={3 + i} canvas={canvas} />)}
            {!list.length && (
              <Reveal i={3} className="cr-card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
                <span className="cr-sub">No productions in the CP weekly for this week.</span>
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </SlideFrame>
  );
}

function ProductionCard({ p, i, canvas }) {
  const sc = stageColor(p.stage);
  return (
    <Reveal i={i} className="cr-card" style={{ padding: canvas ? 26 : 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {p.stage && <span className="cr-chip" style={{ fontSize: 'calc(var(--t-small) * .85)', borderColor: withAlpha(sc, 0.55), background: withAlpha(sc, 0.18) }}><span className="cr-chip-dot" style={{ background: sc }} />{p.stage}</span>}
        {p.cross_brand && <ProductChip product={{ label: p.brand?.name, color: p.brand?.color || '#B842A9' }} small />}
      </div>
      <div className="cr-h3 cr-clamp-2" style={{ color: '#fff', fontSize: 'calc(var(--t-h3) * .85)' }}>{p.name}</div>
      {p.thisWeek?.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {p.thisWeek.slice(0, 3).map((h, j) => (
            <span key={j} className="cr-chip" style={{ fontSize: 'calc(var(--t-small) * .8)', borderColor: 'rgba(255,138,61,.5)', background: 'rgba(255,138,61,.14)' }}>
              {h.kind} · {dayLabel(h.date)} {shortDate(h.date).split(' ')[1]}
            </span>
          ))}
        </div>
      )}
      <div className="cr-small" style={{ marginTop: 'auto', fontSize: 'calc(var(--t-small) * .82)', display: 'flex', gap: 16 }}>
        {p.producer && <span className="cr-clamp-1"><UserRound size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> {p.producer}</span>}
        {p.linked > 0 && <span>{p.linked} linked ticket{p.linked === 1 ? '' : 's'}</span>}
      </div>
    </Reveal>
  );
}

// ── Division · this week (workload by day + what's coming + focus) ─────────
function loadBg(load, accent) {
  if (!load) return 'rgba(255,255,255,.025)';
  if (load > 1) return 'linear-gradient(160deg, rgba(226,68,92,.78), rgba(8,8,248,.5))';
  return withAlpha(accent, 0.16 + Math.min(load, 1) * 0.6);
}

export function DivisionNextSlide({ slide, active }) {
  const { vm } = slide;
  const { layout, editBullets, motionLevel } = useDeck();
  const canvas = layout === 'canvas';
  const accent = vm.meta.accent;
  const filter = { division: vm.division };
  const focusPanel = (
    <Reveal i={4} y={30} className="cr-card" style={{ padding: canvas ? '28px 32px' : 18, display: 'flex', flexDirection: 'column', gap: 20, minHeight: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="cr-h3" style={{ color: 'var(--cr-white)', flex: 1 }}>Focus</span>
        {vm.focusSource === 'ai' && <span className="cr-small" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'calc(var(--t-small) * .78)' }}><Sparkles size={14} /> Claude</span>}
      </div>
      {vm.focus.length > 0 || editBullets
        ? <BulletList slide={slide} bullets={vm.focus.length ? vm.focus : ['']} numbered={false} size="calc(var(--t-body) * 1.05)" startI={5} max={5} />
        : <span className="cr-small">Nothing planned yet.</span>}
      {vm.topProducts?.length > 0 && (
        <div className="cr-col" style={{ gap: 12, marginTop: 'auto' }}>
          <Label>Planned by product</Label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            {vm.topProducts.map(p => <ProductButton key={p.label} product={p.label} color={p.color} count={p.total} filter={filter} />)}
          </div>
        </div>
      )}
    </Reveal>
  );

  if (vm.division === 'tv') {
    return (
      <SlideFrame slide={slide} active={active}>
        <div className="cr-col" style={{ height: '100%', gap: 40 }}>
          <SlideHeader slide={slide} subtitle={false} />
          <div className="cr-grid cr-fill cr-one-sm" style={{ gridTemplateColumns: canvas ? 'minmax(0,1.5fr) minmax(0,1fr)' : '1fr', gap: 28 }}>
            <Reveal i={2} y={30} className="cr-card" style={{ padding: canvas ? '24px 26px' : 16, display: 'grid', gridTemplateColumns: `repeat(${Math.max(vm.days.length, 1)}, minmax(0,1fr))`, gap: 12, minHeight: 0, overflow: 'hidden' }}>
              {vm.days.map(d => {
                const events = vm.productions.flatMap(p => p.hits.filter(h => h.date === d).map(h => ({ ...h, p })));
                return (
                  <div key={d} className="cr-col" style={{ gap: 10, minHeight: 0 }}>
                    <div className="cr-small" style={{ textAlign: 'center', fontWeight: 600 }}>{dayLabel(d)} <span style={{ opacity: 0.6, fontWeight: 400 }}>{shortDate(d).split(' ')[1]}</span></div>
                    {events.map((ev, j) => (
                      <div key={j} style={{ borderRadius: 14, padding: '12px 14px', background: withAlpha(ev.kind === 'Shoot' ? '#ff8a3d' : ev.kind === 'Delivery' ? '#00c875' : '#8c93ff', 0.18), border: `1px solid ${withAlpha(ev.kind === 'Shoot' ? '#ff8a3d' : ev.kind === 'Delivery' ? '#00c875' : '#8c93ff', 0.5)}` }}>
                        <div style={{ fontSize: 'calc(var(--t-small) * .75)', letterSpacing: '.08em', textTransform: 'uppercase', fontWeight: 700 }}>{ev.kind}</div>
                        <div className="cr-clamp-3" style={{ fontSize: 'calc(var(--t-small) * .92)', fontWeight: 600, color: '#fff', marginTop: 4 }}>{ev.p.name}</div>
                      </div>
                    ))}
                    {!events.length && <div style={{ flex: 1, borderRadius: 14, border: '1px dashed var(--cr-hair)' }} />}
                  </div>
                );
              })}
              {!vm.days.length && <span className="cr-small">No schedule for this week.</span>}
            </Reveal>
            {focusPanel}
          </div>
        </div>
      </SlideFrame>
    );
  }

  const rows = vm.rows.filter(r => r.total > 0 || vm.rows.length <= 8).slice(0, canvas ? 9 : 14);
  const rowH = canvas ? Math.min(76, Math.floor(500 / Math.max(rows.length, 1)) - 10) : 44;
  const grid = `${canvas ? 240 : 90}px repeat(${vm.days.length}, minmax(0,1fr)) ${canvas ? 70 : 34}px`;
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 40 }}>
        <SlideHeader slide={slide} subtitle={false} />
        <div className="cr-grid cr-fill cr-one-sm" style={{ gridTemplateColumns: canvas ? 'minmax(0,1.45fr) minmax(0,1fr)' : '1fr', gap: 28 }}>
          <Reveal i={2} y={30} className="cr-card" style={{ padding: canvas ? '24px 28px' : 14, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: grid, gap: 10, alignItems: 'end' }}>
              <Label>Workload</Label>
              {vm.days.map(d => (
                <span key={d} className="cr-small" style={{ textAlign: 'center', fontWeight: 600 }}>{dayLabel(d)} <span style={{ opacity: 0.6, fontWeight: 400 }}>{shortDate(d).split(' ')[1]}</span></span>
              ))}
              <Label style={{ textAlign: 'right' }}>Total</Label>
            </div>
            {rows.map((r, ri) => (
              <div key={r.person.id} style={{ display: 'grid', gridTemplateColumns: grid, gap: 10, height: rowH }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <Avatar person={r.person} size={canvas ? Math.min(46, rowH - 14) : 26} />
                  <span className="cr-clamp-1" style={{ fontWeight: 600, fontSize: 'var(--t-small)' }}>{r.person.name.split(' ')[0]}</span>
                </div>
                {r.cells.map((c, ci) => {
                  const load = c.count / vm.capacity;
                  return (
                    <m.div key={c.date} className="cr-heat-cell"
                      initial={motionLevel === 'static' ? false : { opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.45, ease: EASE, delay: 0.35 + ci * 0.06 + ri * 0.03 }}
                      style={{ background: loadBg(load, accent), borderColor: load > 1 ? 'rgba(226,68,92,.7)' : undefined }}>
                      {c.count > 0 && <span className="cr-num" style={{ fontWeight: 800, fontSize: canvas ? 'var(--t-h3)' : 16, color: '#fff', fontFamily: 'var(--cr-font-display)' }}>{c.count}</span>}
                    </m.div>
                  );
                })}
                <span className="cr-num" style={{ alignSelf: 'center', textAlign: 'right', fontFamily: 'var(--cr-font-display)', fontWeight: 800, fontSize: 'var(--t-h3)', color: r.total ? accent : 'var(--cr-faint)' }}>{r.total}</span>
              </div>
            ))}
            {!rows.length && <span className="cr-small">Nobody has work scheduled yet.</span>}
            <div className="cr-small" style={{ marginTop: 'auto', fontSize: 'calc(var(--t-small) * .78)', display: 'flex', alignItems: 'center', gap: 12 }}>
              Projects scheduled per day · capacity {vm.capacity}/day
              {[0.25, 0.6, 1, 1.2].map(v => <span key={v} style={{ width: 22, height: 14, borderRadius: 4, background: loadBg(v, accent) }} />)}
            </div>
          </Reveal>
          {focusPanel}
        </div>
      </div>
    </SlideFrame>
  );
}

// ── One slide per production (from the CP — the core — with its Monday tickets) ──
export function ProductionSlide({ slide, active }) {
  const { vm } = slide;
  const { snapshot, overrides, layout, onTicket, editText } = useDeck();
  const canvas = layout === 'canvas';
  const p = vm.p;
  if (!p) return <SlideFrame slide={slide} active={active}><SlideHeader slide={slide} /></SlideFrame>;
  const set = (slot) => (editText ? (v) => editText(slide.key, slot, v) : undefined);
  const max = canvas ? 6 : 8;
  const tickets = vm.tickets.slice(0, max).map(id => decorate(snapshot, overrides, id));
  const more = vm.tickets.length - tickets.length;
  const g = galleryGrid(tickets.length);
  const sc = stageColor(p.stage);
  const dates = [
    p.planned_start && { label: 'Kick-off', value: shortDate(p.planned_start) },
    p.shoot_dates?.length && { label: p.shoot_dates.length > 1 ? 'Shoot days' : 'Shoot', value: p.shoot_dates.slice(0, 3).map(d => shortDate(d)).join(', ') + (p.shoot_dates.length > 3 ? ` +${p.shoot_dates.length - 3}` : '') },
    p.delivery_date && { label: 'Delivery', value: shortDate(p.delivery_date) },
  ].filter(Boolean);
  const hasWork = tickets.length > 0;
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-row" style={{ gap: 56, height: '100%' }}>
        <div className="cr-col cr-fixed-sm" style={{ width: canvas ? (hasWork ? 640 : 1100) : 'auto', flex: 'none', gap: 22, minHeight: 0, overflow: canvas ? 'hidden' : undefined }}>
          <Reveal i={0} y={14}><EditableText className="cr-eyebrow" value={slide.text.eyebrow} onCommit={set('eyebrow')} /></Reveal>
          <Reveal i={1}><EditableText className="cr-title cr-clamp-3" value={slide.text.title} onCommit={set('title')} style={{ fontSize: canvas ? `calc(var(--t-title) * ${p.name.length > 40 ? 0.62 : 0.8})` : undefined }} /></Reveal>
          <Reveal i={2} style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {p.stage && <span className="cr-chip" style={{ borderColor: withAlpha(sc, 0.55), background: withAlpha(sc, 0.18) }}><span className="cr-chip-dot" style={{ background: sc }} />{p.stage}</span>}
            {p.production_type && <span className="cr-chip">{p.production_type}</span>}
            {p.cross_brand && <ProductChip product={{ label: p.brand?.name, color: p.brand?.color || '#B842A9' }} />}
            {(p.product_type || []).slice(0, 3).map(pt => <span key={pt} className="cr-chip" style={{ fontSize: 'calc(var(--t-small) * .85)' }}>{pt}</span>)}
          </Reveal>
          {(dates.length > 0 || p.producer) && (
            <Reveal i={3} className="cr-grid" style={{ gridTemplateColumns: `repeat(${Math.min(dates.length + (p.producer ? 1 : 0), 3) || 1}, minmax(0,1fr))`, gap: 14 }}>
              {dates.map(d => (
                <div key={d.label} className="cr-card" style={{ padding: '14px 18px' }}>
                  <Label>{d.label}</Label>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: 'var(--t-body)', marginTop: 4 }}>{d.value}</div>
                </div>
              ))}
              {p.producer && dates.length < 3 && (
                <div className="cr-card" style={{ padding: '14px 18px' }}>
                  <Label>Producer</Label>
                  <div className="cr-clamp-1" style={{ fontWeight: 700, color: '#fff', fontSize: 'var(--t-body)', marginTop: 4 }}>{p.producer}</div>
                </div>
              )}
            </Reveal>
          )}
          {vm.thisWeek?.length > 0 && (
            <Reveal i={4} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <CalendarDays size={22} color="#ff8a3d" />
              {vm.thisWeek.map((h, j) => (
                <span key={j} className="cr-chip" style={{ borderColor: 'rgba(255,138,61,.55)', background: 'rgba(255,138,61,.15)' }}>This week · {h.kind} {dayLabel(h.date)}</span>
              ))}
            </Reveal>
          )}
          {p.note && <Reveal i={5}><div className="cr-body cr-clamp-3" style={{ fontSize: 'var(--t-body)', color: 'var(--cr-ice)', whiteSpace: 'pre-line', WebkitLineClamp: hasWork ? 5 : 8 }} dir="auto">{p.note}</div></Reveal>}
          {p.bullets?.length > 0 && (
            <Reveal i={6} className="cr-col" style={{ gap: 10 }}>
              {p.bullets.slice(0, hasWork ? 4 : 8).map((b, bi) => (
                <div key={bi} style={{ display: 'flex', gap: 14, fontSize: 'var(--t-body)' }} dir="auto">
                  <span style={{ color: '#ff8a3d' }}>•</span><span className="cr-clamp-2">{b.text}</span>
                </div>
              ))}
            </Reveal>
          )}
        </div>

        {hasWork && (
          <div className="cr-col cr-fill" style={{ gap: 14 }}>
            <Reveal i={3} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <Clapperboard size={22} color="var(--cr-electric-soft)" />
              <Label>From Monday · {vm.tickets.length} ticket{vm.tickets.length === 1 ? '' : 's'}</Label>
            </Reveal>
            <div className="cr-grid cr-fill" style={{ gridTemplateColumns: `repeat(${g.cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${g.rows}, minmax(0,1fr))`, gap: 18 }}>
              {tickets.map((it, i) => (
                <Reveal key={it.id} i={4 + i} y={30} className="cr-ratio-sm" style={{ position: 'relative', minHeight: 0 }}>
                  <TicketTile item={it} active={active} onClick={onTicket} style={{ position: 'absolute', inset: 0 }} big={tickets.length <= 2} />
                </Reveal>
              ))}
            </div>
            {more > 0 && <span className="cr-small">+ {more} more linked</span>}
          </div>
        )}
      </div>
    </SlideFrame>
  );
}

// ── Showcase: one project, a gallery of hand-picked images ─────────────────
export function ShowcaseSlide({ slide, active }) {
  const { vm } = slide;
  const { media, layout, openViewer, editText, mode } = useDeck();
  const canvas = layout === 'canvas';
  if (!vm.item) {
    return (
      <SlideFrame slide={slide} active={active}>
        <div className="cr-col" style={{ height: '100%', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
          <span className="cr-sub">Pick a project for this showcase in the inspector →</span>
        </div>
      </SlideFrame>
    );
  }
  const set = (slot) => (editText ? (v) => editText(slide.key, slot, v) : undefined);
  const imgs = vm.images.length ? vm.images : [{ auto: true }];
  const n = imgs.length;
  const grid = n === 1 ? { cols: '1fr', rows: '1fr' }
    : n === 2 ? { cols: '1fr 1fr', rows: '1fr' }
      : n === 3 ? { cols: '1.6fr 1fr', rows: '1fr 1fr' }
        : n === 4 ? { cols: '1fr 1fr', rows: '1fr 1fr' }
          : { cols: 'repeat(3, minmax(0,1fr))', rows: '1fr 1fr' };
  const open = openViewer && mode !== 'thumb' ? () => openViewer(vm.item) : undefined;
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 30 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 30 }}>
          <div className="cr-col" style={{ gap: 12, flex: 1, minWidth: 0 }}>
            <Reveal i={0} y={14}><EditableText className="cr-eyebrow" value={slide.text.eyebrow} onCommit={set('eyebrow')} /></Reveal>
            <Reveal i={1}><EditableText className="cr-title cr-clamp-1" value={slide.text.title} onCommit={set('title')} style={{ fontSize: canvas ? 'calc(var(--t-title) * .7)' : undefined }} /></Reveal>
            {(slide.text.subtitle || editText) && <Reveal i={2}><EditableText className="cr-sub cr-clamp-1" value={slide.text.subtitle} onCommit={set('subtitle')} placeholder="Add a subtitle" style={{ fontSize: 'calc(var(--t-sub) * .8)' }} /></Reveal>}
          </div>
          <Reveal i={2}><SourceButtons item={vm.item} size={40} /></Reveal>
        </div>
        <div className="cr-grid cr-fill" style={{ gridTemplateColumns: grid.cols, gridTemplateRows: grid.rows, gap: 18 }}>
          {imgs.map((im, i) => {
            const src = im.auto ? media.cover(vm.item) : media.ref(im.refId, im.key, 'full');
            const thumb = im.auto ? null : media.ref(im.refId, im.key, 'thumb');
            return (
              <Reveal key={im.auto ? 'auto' : `${im.refId}|${im.key}`} i={3 + i} y={24} scale={0.985}
                className={`cr-tile cr-ratio-sm ${open ? 'cr-clickable' : ''}`}
                style={{ position: 'relative', minHeight: 0, gridRow: n === 3 && i === 0 && canvas ? '1 / span 2' : undefined }}
                onClick={open}>
                {(thumb || src) && <div className="cr-tile2-backdrop" style={{ backgroundImage: `url("${thumb || src}")` }} />}
                <MediaImage src={src} className="cr-tile2-img"
                  fallback={thumb ? <MediaImage src={thumb} className="cr-tile2-img" fallback={<FallbackTile color={vm.item.product?.color} board={vm.item.board} />} /> : <FallbackTile color={vm.item.product?.color} board={vm.item.board} />} />
              </Reveal>
            );
          })}
        </div>
      </div>
    </SlideFrame>
  );
}


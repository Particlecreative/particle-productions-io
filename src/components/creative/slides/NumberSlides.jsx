import { useDeck } from '../deck/DeckContext';
import { Reveal, CountUp, GrowBar, m, EASE, DUR } from '../motion/Motion';
import { DeltaBadge, Sparkline } from '../ui/Bits';
import { fmtDays, withAlpha } from '../deck/format';
import { SlideFrame, SlideHeader } from './SlideFrame';

// ── KPIs ────────────────────────────────────────────────────────────────────
export function KpisSlide({ slide, active }) {
  const { vm } = slide;
  const { layout } = useDeck();
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 56 }}>
        <SlideHeader slide={slide} subtitle={false} />
        <div className="cr-grid cr-fill" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
          {vm.tiles.map((t, i) => (
            <Reveal key={t.key} i={2 + i} y={40} className="cr-card" style={{ padding: layout === 'canvas' ? '40px 40px 32px' : 20, display: 'flex', flexDirection: 'column', gap: 18, minHeight: 0 }}>
              <span className="cr-small" style={{ letterSpacing: '.1em', textTransform: 'uppercase', fontWeight: 600 }}>{t.label}</span>
              {t.format === 'days'
                ? <span className="cr-kpi-num">{t.value == null ? '–' : <CountUp value={t.value} format={(n) => fmtDays(n)} delay={0.45 + i * 0.1} />}</span>
                : <CountUp className="cr-kpi-num" value={t.value} delay={0.45 + i * 0.1} />}
              <div style={{ minHeight: 30 }}>
                {t.delta != null ? <DeltaBadge value={t.delta} /> : t.sub ? <span className="cr-small">{t.sub}</span> : null}
              </div>
              {t.spark?.length > 1 && (
                <div className="cr-hide-sm" style={{ marginTop: 'auto' }}>
                  <Sparkline values={t.spark} width={layout === 'canvas' ? 330 : 200} height={84} />
                  <div className="cr-small" style={{ fontSize: 16, marginTop: 6, color: 'var(--cr-faint)' }}>Last 8 weeks</div>
                </div>
              )}
            </Reveal>
          ))}
        </div>
        <Reveal i={7} className="cr-grid cr-card" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', padding: layout === 'canvas' ? '26px 40px' : 18, gap: 24 }}>
          {vm.strip.map((s) => (
            <div key={s.label} className="cr-col" style={{ gap: 6 }}>
              <span className="cr-small" style={{ fontSize: 'calc(var(--t-small) * .85)', letterSpacing: '.08em', textTransform: 'uppercase' }}>{s.label}</span>
              <span className="cr-h3 cr-num" style={{ color: '#fff' }}>{s.value}</span>
              {s.sub && <span className="cr-small" style={{ fontSize: 'calc(var(--t-small) * .8)' }}>{s.sub}</span>}
            </div>
          ))}
        </Reveal>
      </div>
    </SlideFrame>
  );
}

// ── By product (stacked bars, Monday colours) ──────────────────────────────
export function ByProductSlide({ slide, active }) {
  const { vm } = slide;
  const { layout } = useDeck();
  const rowH = layout === 'canvas' ? Math.min(64, Math.floor(700 / Math.max(vm.rows.length, 1)) - 14) : 34;
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-row" style={{ gap: 96, height: '100%' }}>
        <div className="cr-col cr-fixed-sm" style={{ width: layout === 'canvas' ? 520 : 'auto', flex: 'none', justifyContent: 'space-between' }}>
          <SlideHeader slide={slide} />
          <Reveal i={3} className="cr-col" style={{ gap: 14 }}>
            <Legend color="#8c93ff" label="Video" solid />
            <Legend color="#8c93ff" label="Design" />
          </Reveal>
        </div>
        <div className="cr-col cr-fill" style={{ justifyContent: 'center', gap: 14 }}>
          {vm.rows.map((r, i) => (
            <Reveal key={r.label} i={2 + i} x={-20} y={0} style={{ display: 'grid', gridTemplateColumns: layout === 'canvas' ? '300px 1fr 90px' : '120px 1fr 44px', alignItems: 'center', gap: 24, height: rowH }}>
              <span className="cr-clamp-1" style={{ fontSize: 'var(--t-body)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 14 }}>
                <span className="cr-chip-dot" style={{ background: r.color, width: 16, height: 16 }} />
                {r.label}
              </span>
              <div style={{ height: Math.max(18, rowH * 0.62), display: 'flex' }}>
                <div className="cr-bar-track" style={{ width: `${(r.total / vm.max) * 100}%`, minWidth: 12, background: 'transparent' }}>
                  {r.video > 0 && <GrowBar className="cr-bar-seg" pct={(r.video / r.total) * 100} color={r.color} delay={i * 0.05} />}
                  {r.design > 0 && <GrowBar className="cr-bar-seg" pct={(r.design / r.total) * 100} color={withAlpha(r.color, 0.42)} delay={i * 0.05 + 0.08} />}
                </div>
              </div>
              <CountUp className="cr-num" value={r.total} delay={0.4 + i * 0.05} style={{ fontFamily: 'var(--cr-font-display)', fontWeight: 800, fontSize: 'var(--t-h2)', color: '#fff', textAlign: 'right' }} />
            </Reveal>
          ))}
          {vm.otherCount > 0 && <Reveal i={2 + vm.rows.length} className="cr-small">+ {vm.otherCount} more across other products</Reveal>}
        </div>
      </div>
    </SlideFrame>
  );
}

function Legend({ color, label, solid }) {
  return (
    <span className="cr-small" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ width: 44, height: 16, borderRadius: 99, background: solid ? color : withAlpha(color, 0.42) }} />
      {label}
    </span>
  );
}

// ── Donut (type / department / platform mix) ───────────────────────────────
function arcPath(cx, cy, r, a0, a1) {
  const p = (a) => [cx + r * Math.cos(a - Math.PI / 2), cy + r * Math.sin(a - Math.PI / 2)];
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0.toFixed(2)},${y0.toFixed(2)} A${r},${r} 0 ${large} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`;
}

export function ByTypeSlide({ slide, active }) {
  const { vm } = slide;
  const { layout, motionLevel } = useDeck();
  const size = layout === 'canvas' ? 560 : 280;
  const r = size / 2 - 48;
  const gap = vm.rows.length > 1 ? 0.035 : 0;
  let a = 0;
  const arcs = vm.rows.map(row => {
    const span = (row.total / Math.max(vm.total, 1)) * Math.PI * 2;
    const seg = { row, a0: a + gap / 2, a1: a + span - gap / 2 };
    a += span;
    return seg;
  });
  return (
    <SlideFrame slide={slide} active={active}>
      <div className="cr-col" style={{ height: '100%', gap: 40 }}>
        <SlideHeader slide={slide} subtitle={false} />
        <div className="cr-row cr-fill" style={{ alignItems: 'center', gap: 120 }}>
          <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,.05)" strokeWidth={layout === 'canvas' ? 64 : 34} />
              {arcs.map((s, i) => (
                <m.path
                  key={s.row.label}
                  d={arcPath(size / 2, size / 2, r, s.a0, Math.max(s.a0 + 0.001, s.a1))}
                  fill="none"
                  stroke={s.row.color}
                  strokeWidth={layout === 'canvas' ? 64 : 34}
                  strokeLinecap="butt"
                  initial={motionLevel === 'static' ? false : { pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: DUR.chart * 0.8, ease: EASE, delay: 0.35 + i * 0.12 }}
                />
              ))}
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <CountUp className="cr-kpi-num" value={vm.total} style={{ fontSize: 'calc(var(--t-kpi) * .72)' }} />
              <span className="cr-small" style={{ letterSpacing: '.1em', textTransform: 'uppercase' }}>{vm.dimension === 'type' ? 'videos' : 'deliveries'}</span>
            </div>
          </div>
          <div className="cr-col cr-fill" style={{ gap: 20 }}>
            {vm.rows.map((row, i) => (
              <Reveal key={row.label} i={3 + i} x={-20} y={0} style={{ display: 'grid', gridTemplateColumns: '24px 1fr 90px 90px', gap: 20, alignItems: 'center' }}>
                <span style={{ width: 24, height: 24, borderRadius: 7, background: row.color }} />
                <span className="cr-clamp-1" style={{ fontSize: 'var(--t-body)', fontWeight: 600 }}>{row.label}</span>
                <span className="cr-num" style={{ fontFamily: 'var(--cr-font-display)', fontWeight: 800, fontSize: 'var(--t-h2)', color: '#fff', textAlign: 'right' }}>{row.total}</span>
                <span className="cr-small cr-num" style={{ textAlign: 'right' }}>{Math.round((row.total / Math.max(vm.total, 1)) * 100)}%</span>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </SlideFrame>
  );
}

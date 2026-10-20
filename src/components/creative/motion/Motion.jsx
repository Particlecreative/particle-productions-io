// Motion primitives for the deck. `motion` is only imported inside the lazy creative chunks.
import { useEffect, useRef, useState } from 'react';
import { LazyMotion, domMax, MotionConfig, m, animate, useReducedMotion } from 'motion/react';
import { useDeck } from '../deck/DeckContext';

export const EASE = [0.16, 1, 0.3, 1];
export const DUR = { slide: 0.65, element: 0.7, stagger: 0.07, delay: 0.28, count: 1.4, chart: 1.1 };

export function MotionProvider({ children }) {
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={{ ease: EASE }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}

/** Slide-level transitions (direction-aware). */
export const slideVariants = {
  push: {
    enter: (dir) => ({ opacity: 0, x: `${4 * dir}%` }),
    center: { opacity: 1, x: '0%', scale: 1, transition: { duration: DUR.slide, ease: EASE } },
    exit: (dir) => ({ opacity: 0, x: `${-2 * dir}%`, scale: 0.985, transition: { duration: DUR.slide * 0.8, ease: EASE } }),
  },
  fade: {
    enter: { opacity: 0 },
    center: { opacity: 1, transition: { duration: DUR.slide, ease: EASE } },
    exit: { opacity: 0, transition: { duration: DUR.slide * 0.7, ease: EASE } },
  },
  zoom: {
    enter: { opacity: 0, scale: 1.12 },
    center: { opacity: 1, scale: 1, transition: { duration: DUR.slide * 1.1, ease: EASE } },
    exit: { opacity: 0, scale: 0.94, transition: { duration: DUR.slide * 0.7, ease: EASE } },
  },
  none: { enter: { opacity: 1 }, center: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0 } } },
};

/**
 * Staggered entrance. `i` orders the stagger; `build` (1-based) hides the element
 * until the presenter reaches that build step.
 */
export function Reveal({ i = 0, build = 0, y = 26, x = 0, scale = 1, as = 'div', className, style, children, ...rest }) {
  const { motionLevel, buildStep, layout } = useDeck();
  const Comp = m[as] || m.div;
  if (motionLevel === 'static') {
    const Tag = as;
    return <Tag className={className} style={style} {...rest}>{children}</Tag>;
  }
  if (layout === 'stack') {
    // Phone layout: reveal as each block scrolls into view
    return (
      <Comp className={className} style={style} initial={{ opacity: 0, y: Math.min(y, 18) }} whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.25 }} transition={{ duration: DUR.element, ease: EASE, delay: Math.min(i, 6) * 0.05 }} {...rest}>
        {children}
      </Comp>
    );
  }
  const shown = !build || (buildStep ?? 99) >= build;
  const delay = build ? 0.05 : DUR.delay + i * DUR.stagger;
  return (
    <Comp
      className={className}
      style={style}
      initial={{ opacity: 0, y, x, scale }}
      animate={shown ? { opacity: 1, y: 0, x: 0, scale: 1 } : { opacity: 0, y, x, scale }}
      transition={{ duration: DUR.element, ease: EASE, delay: shown ? delay : 0 }}
      {...rest}
    >
      {children}
    </Comp>
  );
}

/** Number that counts up from 0 when the slide becomes active. */
export function CountUp({ value, format = (n) => Math.round(n).toLocaleString('en-US'), delay = DUR.delay, className, style }) {
  const { motionLevel } = useDeck();
  const reduced = useReducedMotion();
  const final = Number(value) || 0;
  const [shown, setShown] = useState(motionLevel === 'static' || reduced ? final : 0);
  const ref = useRef(null);

  useEffect(() => {
    if (motionLevel === 'static' || reduced || !Number.isFinite(final)) { setShown(final); return undefined; }
    const controls = animate(0, final, {
      duration: DUR.count, delay, ease: EASE,
      onUpdate: (v) => setShown(v),
    });
    return () => controls.stop();
  }, [final, motionLevel, reduced, delay]);

  if (value == null || Number.isNaN(Number(value))) return <span className={className} style={style}>–</span>;
  // Reserve the final width so the layout doesn't jitter while counting
  return (
    <span ref={ref} className={className} style={{ display: 'inline-grid', ...style }}>
      <span style={{ gridArea: '1 / 1', visibility: 'hidden' }}>{format(final)}</span>
      <span style={{ gridArea: '1 / 1' }}>{format(shown)}</span>
    </span>
  );
}

/** Horizontal bar segment that grows from the left. */
export function GrowBar({ pct, color, delay = 0, className, style }) {
  const { motionLevel } = useDeck();
  if (motionLevel === 'static') {
    return <div className={className} style={{ width: `${pct}%`, background: color, ...style }} />;
  }
  return (
    <m.div
      className={className}
      style={{ width: `${pct}%`, background: color, transformOrigin: 'left center', ...style }}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: DUR.chart, ease: EASE, delay: DUR.delay + delay }}
    />
  );
}

export { m };

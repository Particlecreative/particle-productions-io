// Live pages (Tomer, 25 Nov 2026: "the creative look should refresh every X seconds — new tickets / comments must show up
// live"). Runs `tick` every `every` ms while the tab is visible, right away when the person comes back to the tab, and
// never two at once. Hidden tabs don't poll (no load on Monday for a page nobody looks at).
import { useEffect, useRef, useState } from 'react';

export function useLive(tick, { every = 30000, enabled = true } = {}) {
  const fn = useRef(tick);
  fn.current = tick;
  const busy = useRef(false);
  const [at, setAt] = useState(null);
  useEffect(() => {
    if (!enabled) return undefined;
    let last = Date.now();
    const run = async () => {
      if (busy.current || document.visibilityState === 'hidden') return;
      busy.current = true;
      try { await fn.current(); setAt(Date.now()); last = Date.now(); } catch { /* the page shows its own error */ } finally { busy.current = false; }
    };
    const t = setInterval(run, every);
    const back = () => { if (document.visibilityState === 'visible' && Date.now() - last > Math.min(every, 15000)) run(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, [every, enabled]);
  return at;
}

/** "just now" · "12s ago" · "3m ago" — re-renders itself every 5 s. */
export function useAgo(ms) {
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force(x => x + 1), 5000); return () => clearInterval(t); }, []);
  if (!ms) return null;
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  return s < 8 ? 'just now' : s < 60 ? `${s}s ago` : `${Math.round(s / 60)}m ago`;
}

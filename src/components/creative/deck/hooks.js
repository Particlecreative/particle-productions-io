import { useCallback, useEffect, useRef, useState } from 'react';

// ── Navigation with build steps ─────────────────────────────────────────────
export function useDeckNavigation(slides, { initialIndex = 0 } = {}) {
  const [state, setState] = useState({ index: Math.min(initialIndex, Math.max(slides.length - 1, 0)), build: 0, dir: 1 });
  const count = slides.length;

  useEffect(() => {
    setState(s => (s.index >= count && count > 0 ? { index: count - 1, build: 0, dir: -1 } : s));
  }, [count]);

  const next = useCallback(() => setState(s => {
    const builds = slides[s.index]?.builds || 0;
    if (s.build < builds) return { ...s, build: s.build + 1, dir: 1 };
    if (s.index >= count - 1) return s;
    return { index: s.index + 1, build: 0, dir: 1 };
  }), [slides, count]);

  const prev = useCallback(() => setState(s => {
    if (s.build > 0) return { ...s, build: s.build - 1, dir: -1 };
    if (s.index <= 0) return s;
    return { index: s.index - 1, build: slides[s.index - 1]?.builds || 0, dir: -1 };
  }), [slides]);

  const goto = useCallback((i, { built = false } = {}) => setState(s => {
    const idx = Math.max(0, Math.min(count - 1, i));
    return { index: idx, build: built ? (slides[idx]?.builds || 0) : 0, dir: idx >= s.index ? 1 : -1 };
  }), [slides, count]);

  return { ...state, next, prev, goto, count, setState };
}

// ── Keyboard (capture phase, priority over App.jsx globals) ────────────────
const isEditableTarget = (t) => !!t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));

/**
 * handlers: { key: fn } where key is a KeyboardEvent.key (lower-cased for letters).
 * swallow: keys that must never reach the app's global shortcuts (dark mode "d", search "/", "n", ⌘K).
 */
export function useDeckKeys(handlers, { enabled = true, swallow = ['d', '/', 'n'] } = {}) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled) return undefined;
    const onKey = (e) => {
      if (isEditableTarget(e.target) || e.isComposing) return;
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      if ((e.metaKey || e.ctrlKey) && k === 'k') { e.preventDefault(); e.stopImmediatePropagation(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const fn = ref.current[k];
      if (fn) {
        e.preventDefault();
        e.stopImmediatePropagation();
        fn(e);
      } else if (swallow.includes(k)) {
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled]);
}

// ── Fullscreen ──────────────────────────────────────────────────────────────
export function requestFullscreen() {
  const el = document.documentElement;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen;
  if (!fn) return Promise.resolve(false);
  try {
    const p = fn.call(el, { navigationUI: 'hide' });
    return (p && p.then ? p : Promise.resolve()).then(() => true).catch(() => false);
  } catch { return Promise.resolve(false); }
}
export function exitFullscreen() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen;
  if (fn && (document.fullscreenElement || document.webkitFullscreenElement)) fn.call(document).catch?.(() => {});
}
export function useFullscreenState() {
  const [fs, setFs] = useState(!!(document.fullscreenElement || document.webkitFullscreenElement));
  useEffect(() => {
    const on = () => setFs(!!(document.fullscreenElement || document.webkitFullscreenElement));
    document.addEventListener('fullscreenchange', on);
    document.addEventListener('webkitfullscreenchange', on);
    return () => { document.removeEventListener('fullscreenchange', on); document.removeEventListener('webkitfullscreenchange', on); };
  }, []);
  return fs;
}

// ── Idle cursor ─────────────────────────────────────────────────────────────
export function useIdle(ms = 2200) {
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    let t = null;
    const wake = () => { setIdle(false); clearTimeout(t); t = setTimeout(() => setIdle(true), ms); };
    wake();
    window.addEventListener('mousemove', wake);
    window.addEventListener('mousedown', wake);
    window.addEventListener('touchstart', wake, { passive: true });
    return () => { clearTimeout(t); window.removeEventListener('mousemove', wake); window.removeEventListener('mousedown', wake); window.removeEventListener('touchstart', wake); };
  }, [ms]);
  return idle;
}

// ── Screen wake lock while presenting ──────────────────────────────────────
export function useWakeLock(active) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return undefined;
    let lock = null;
    let cancelled = false;
    const acquire = async () => {
      try { lock = await navigator.wakeLock.request('screen'); } catch { lock = null; }
      if (cancelled && lock) lock.release().catch(() => {});
    };
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVis); lock?.release().catch(() => {}); };
  }, [active]);
}

// ── Fonts gate (FitText + count-up measurement need the real fonts) ────────
export function useFontsReady() {
  const [ready, setReady] = useState(() => typeof document === 'undefined' || !document.fonts || document.fonts.status === 'loaded');
  useEffect(() => {
    if (!document.fonts) { setReady(true); return undefined; }
    let alive = true;
    const loads = ['800 100px "Sofia Sans Extra Condensed"', '300 40px "Sofia Sans"', '700 40px "Sofia Sans"', '400 28px Inter', '600 28px Inter']
      .map(f => document.fonts.load(f).catch(() => null));
    const timeout = new Promise(r => setTimeout(r, 2500));
    Promise.race([Promise.all(loads).then(() => document.fonts.ready), timeout]).then(() => { if (alive) setReady(true); });
    return () => { alive = false; };
  }, []);
  return ready;
}

// ── Autosave (debounced, max-wait, flush on hide/unload/unmount, 409 aware) ─
export function useAutosave({ save, delay = 800, maxWait = 5000, onError }) {
  const [status, setStatus] = useState('idle'); // idle | dirty | saving | saved | error | conflict | locked
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const dirty = useRef(false);
  const firstDirtyAt = useRef(0);
  const timer = useRef(null);
  const saving = useRef(null);
  const saveRef = useRef(save);
  saveRef.current = save;

  const run = useCallback(async ({ keepalive = false } = {}) => {
    clearTimeout(timer.current);
    if (!dirty.current) return saving.current;
    if (saving.current) { await saving.current; if (!dirty.current) return null; }
    dirty.current = false;
    setStatus('saving');
    const p = (async () => {
      try {
        await saveRef.current({ keepalive });
        setLastSavedAt(new Date().toISOString());
        setStatus(dirty.current ? 'dirty' : 'saved');
      } catch (e) {
        if (e?.status === 409) setStatus('conflict');
        else if (e?.status === 423) setStatus('locked');
        else { dirty.current = true; setStatus('error'); onError?.(e); }
      } finally { saving.current = null; }
    })();
    saving.current = p;
    await p;
    if (dirty.current) { timer.current = setTimeout(() => run(), delay); }
    return null;
  }, [delay, onError]);

  const markDirty = useCallback(() => {
    if (!dirty.current) firstDirtyAt.current = Date.now();
    dirty.current = true;
    setStatus(s => (s === 'saving' ? s : 'dirty'));
    clearTimeout(timer.current);
    const waited = Date.now() - firstDirtyAt.current;
    timer.current = setTimeout(() => run(), waited > maxWait ? 0 : delay);
  }, [delay, maxWait, run]);

  const flush = useCallback((opts) => run(opts), [run]);

  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden' && dirty.current) run({ keepalive: true }); };
    const onUnload = (e) => {
      if (dirty.current || saving.current) {
        run({ keepalive: true });
        e.preventDefault();
        e.returnValue = '';
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
      if (dirty.current) run({ keepalive: true });
      clearTimeout(timer.current);
    };
  }, [run]);

  return { status, setStatus, lastSavedAt, markDirty, flush, isDirty: () => dirty.current || !!saving.current };
}

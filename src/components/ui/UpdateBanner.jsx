import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { RefreshCw, X } from 'lucide-react';

/**
 * "A new version is out — Reload" (Tomer, 12 Nov 2026: an open tab kept the code from before a deploy, so the new
 * Captain export card never showed). The panel is one page that loads its code once; a tab left open keeps the old
 * code until it's reloaded. Every 5 minutes, and whenever you come back to the tab (at most once a minute), this
 * asks the server for the page and compares its main bundle with the one this tab runs. Nothing reloads by itself —
 * the person may be mid-edit.
 */
const CHECK_MS = 5 * 60 * 1000;
const MIN_GAP_MS = 60 * 1000;
// Pages people outside the team open (signing, forms, shared decks, request links) and the fullscreen presenter
const QUIET = [/^\/sign\//, /^\/supplier-form\//, /^\/cc-payment\//, /^\/script\//, /^\/weekly\//, /^\/creative-report\//, /^\/finance-view/, /^\/request\//, /\/present\/?$/];

/** The main bundle a page loads, e.g. "/assets/index-DAbSLzGA.js" (pure). */
export function bundleOf(html) {
  return String(html || '').match(/\/assets\/index-[\w-]+\.js/)?.[0] || null;
}

function loadedBundle() {
  const s = document.querySelector('script[type="module"][src*="/assets/index-"]');
  return s ? bundleOf(s.getAttribute('src')) : null;
}

export default function UpdateBanner() {
  const { pathname } = useLocation();
  const [fresh, setFresh] = useState(null);     // the newer bundle the server has
  const [dismissed, setDismissed] = useState(null);

  useEffect(() => {
    const mine = loadedBundle();
    if (!mine) return undefined;   // the dev server runs unbundled code — nothing to compare
    let last = 0;
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState === 'hidden' || Date.now() - last < MIN_GAP_MS) return;
      last = Date.now();
      try {
        // "/" not "/?t=…": the service worker caches every page it fetches, one entry per URL
        const res = await fetch('/', { cache: 'no-store', headers: { Accept: 'text/html' } });
        if (!res.ok) return;
        const live = bundleOf(await res.text());
        if (!stopped && live && live !== mine) setFresh(live);
      } catch { /* offline — next time */ }
    };
    const onBack = () => { if (document.visibilityState === 'visible') check(); };
    const timer = setInterval(check, CHECK_MS);
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onBack);
      window.removeEventListener('focus', onBack);
    };
  }, []);

  if (!fresh || fresh === dismissed || QUIET.some(re => re.test(pathname))) return null;
  return (
    <div role="status" aria-live="polite"
      className="fixed z-[95] bottom-5 left-1/2 -translate-x-1/2 w-max max-w-[calc(100vw-32px)] flex items-center gap-3 pl-4 pr-2 py-2 rounded-2xl text-white shadow-[0_12px_32px_-8px_rgba(3,11,46,.55)]"
      style={{ background: '#030b2e' }}>
      <span className="min-w-0">
        <span className="block text-sm font-semibold leading-tight">A new version of CP Panel is out</span>
        <span className="block text-[11px] text-white/60 leading-tight">Save what you’re working on, then reload to get it.</span>
      </span>
      <button type="button" onClick={() => window.location.reload()}
        className="flex-none flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-[#0808f8] hover:bg-[#2a2aff] transition-colors">
        <RefreshCw size={13} /> Reload
      </button>
      <button type="button" onClick={() => setDismissed(fresh)} aria-label="Not now" title="Not now"
        className="flex-none p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10">
        <X size={14} />
      </button>
    </div>
  );
}

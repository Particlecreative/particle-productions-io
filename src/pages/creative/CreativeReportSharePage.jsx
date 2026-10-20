import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { creativeApi } from '../../lib/creativeReportService';
import { useDeckModel } from '../../components/creative/deck/useDeckModel';
import { useFontsReady } from '../../components/creative/deck/hooks';
import DeckPlayer from '../../components/creative/presenter/DeckPlayer';
import DeckShell from '../../components/creative/deck/DeckShell';
import SlideRenderer from '../../components/creative/deck/SlideRenderer';
import TicketLightbox from '../../components/creative/ui/TicketLightbox';
import { DeckSplash } from './CreativeReportPresentPage';

function useMeta(name, content) {
  useEffect(() => {
    let el = document.querySelector(`meta[name="${name}"]`);
    const created = !el;
    if (!el) { el = document.createElement('meta'); el.setAttribute('name', name); document.head.appendChild(el); }
    const prev = el.getAttribute('content');
    el.setAttribute('content', content);
    return () => { if (created) el.remove(); else el.setAttribute('content', prev || ''); };
  }, [name, content]);
}

function usePhoneLayout() {
  const calc = () => window.innerWidth < 768 || (window.innerHeight > window.innerWidth && window.innerWidth < 1024);
  const [phone, setPhone] = useState(calc);
  useEffect(() => {
    const on = () => setPhone(calc());
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return phone;
}

export default function CreativeReportSharePage() {
  const { token } = useParams();
  const [payload, setPayload] = useState(null);
  const [picks, setPicks] = useState({});
  const [error, setError] = useState(null);
  const [lightbox, setLightbox] = useState(null);
  const fontsReady = useFontsReady();
  const phone = usePhoneLayout();
  useMeta('robots', 'noindex, nofollow');
  useMeta('referrer', 'no-referrer');

  useEffect(() => {
    let alive = true;
    creativeApi.publicShare(token)
      .then(p => { if (alive) setPayload(p); })
      .catch(e => alive && setError(e.status === 410 ? 'This link has expired' : e.status === 404 ? 'This link was revoked or doesn’t exist' : e.message));
    return () => { alive = false; };
  }, [token]);
  useEffect(() => {
    let alive = true;
    if (payload) creativeApi.publicPicks(token).then(r => alive && setPicks(r?.picks || {})).catch(() => {});
    return () => { alive = false; };
  }, [payload, token]);
  useEffect(() => {
    if (payload?.report) document.title = `${payload.brand?.name || 'Particle'} · Creative Weekly · ${payload.report.snapshot?.week?.label || ''}`;
  }, [payload]);

  const model = useDeckModel({ report: payload?.report, mediaToken: payload?.media?.token, picks });
  const deckValue = useMemo(() => ({ reportId: payload?.report?.id, isPublic: true, brand: payload?.brand || { name: 'Particle' } }), [payload]);

  if (error) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(900px 600px at 80% 0%, rgba(8,8,248,.4), transparent 60%), #030b2e', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e8ecff', textAlign: 'center', padding: 24 }}>
        <div>
          <div style={{ fontSize: 12, letterSpacing: '.22em', textTransform: 'uppercase', color: '#8c93ff', fontWeight: 600 }}>Creative Weekly</div>
          <div style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', fontWeight: 800, fontSize: 56, textTransform: 'uppercase', color: '#fff', marginTop: 10, lineHeight: 0.9 }}>{error}</div>
          <div style={{ marginTop: 12, opacity: 0.6 }}>Ask for a fresh link.</div>
        </div>
      </div>
    );
  }
  if (!payload || !fontsReady) return <DeckSplash />;

  if (phone) {
    return (
      <DeckShell value={{ ...deckValue, mode: 'share', layout: 'stack', motionLevel: 'full', snapshot: model.snapshot, overrides: model.overrides, narrative: model.narrative, media: model.media, pageOf: model.pageOf, onTicket: setLightbox }}>
        <div style={{ background: '#030b2e' }}>
          {model.visible.map(s => (
            <section key={s.key} style={{ borderBottom: '1px solid rgba(255,255,255,.06)' }}>
              <SlideRenderer slide={s} active />
            </section>
          ))}
        </div>
        {lightbox && <TicketLightbox item={lightbox} onClose={() => setLightbox(null)} />}
      </DeckShell>
    );
  }
  return <DeckPlayer model={model} deckValue={deckValue} variant="share" />;
}

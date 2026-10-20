import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { creativeApi } from '../../lib/creativeReportService';
import { useBrand } from '../../context/BrandContext';
import { useDeckModel } from '../../components/creative/deck/useDeckModel';
import { useFontsReady } from '../../components/creative/deck/hooks';
import DeckPlayer from '../../components/creative/presenter/DeckPlayer';
import PresenterConsole from '../../components/creative/presenter/PresenterConsole';

export function DeckSplash({ label = 'Loading the deck…' }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'radial-gradient(900px 600px at 80% 0%, rgba(8,8,248,.45), transparent 60%), #030b2e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: '#e8ecff', zIndex: 70 }}>
      <Loader2 size={30} className="animate-spin" color="#8c93ff" />
      <div style={{ fontSize: 13, letterSpacing: '.18em', textTransform: 'uppercase', color: '#8c93ff', fontWeight: 600 }}>{label}</div>
    </div>
  );
}

export default function CreativeReportPresentPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { brand } = useBrand();
  const [payload, setPayload] = useState(location.state?.payload || null);
  const [picks, setPicks] = useState(location.state?.picks || {});
  const [error, setError] = useState(null);
  const fontsReady = useFontsReady();
  const view = params.get('view');
  const startAt = Math.max(0, Number(params.get('slide') || 1) - 1);

  useEffect(() => {
    let alive = true;
    if (!payload) creativeApi.get(id).then(p => { if (alive) setPayload(p); }).catch(e => alive && setError(e.message));
    return () => { alive = false; };
  }, [id, payload]);
  useEffect(() => {
    let alive = true;
    if (payload) creativeApi.picks(id).then(r => { if (alive) setPicks(p => ({ ...p, ...(r?.picks || {}) })); }).catch(() => {});
    return () => { alive = false; };
  }, [id, payload]);

  const model = useDeckModel({ report: payload?.report, mediaToken: payload?.media?.token, picks });
  const deckValue = useMemo(() => ({
    reportId: id,
    isPublic: false,
    brand: { name: brand?.name || 'Particle', logo_url: brand?.logo_url || null },
  }), [id, brand]);
  const lastIndex = useRef(startAt);

  useEffect(() => {
    const prev = document.title;
    document.title = `Presenting · ${payload?.report?.title || 'Creative Weekly'}`;
    return () => { document.title = prev; };
  }, [payload]);

  if (error) return <DeckSplash label={error} />;
  if (!payload || !fontsReady) return <DeckSplash />;

  if (view === 'console') {
    return <PresenterConsole model={model} deckValue={deckValue} channel={`cr-deck-${id}`} />;
  }
  return (
    <DeckPlayer
      model={model}
      deckValue={deckValue}
      variant="present"
      initialIndex={startAt}
      channel={`cr-deck-${id}`}
      onIndexChange={(i) => { lastIndex.current = i; }}
      onExit={() => navigate(`/creative-reports/${id}`, { state: { slideIndex: lastIndex.current } })}
    />
  );
}

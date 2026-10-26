import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const CompletionPrompt = lazy(() => import('./CompletionPrompt'));

/**
 * Listens for productions moved to Completed (anywhere in the CP) and asks the Editor who did it for the finals.
 * Tiny on purpose: the prompt itself is a lazy chunk, loaded only when it's needed.
 */
export default function CompletionPromptHost() {
  const { isEditor } = useAuth();
  const [queue, setQueue] = useState([]);
  useEffect(() => {
    if (!isEditor) return undefined;
    const on = (e) => { const id = e.detail?.id; if (id) setQueue(q => (q.includes(id) ? q : [...q, id])); };
    window.addEventListener('cp:production-completed', on);
    return () => window.removeEventListener('cp:production-completed', on);
  }, [isEditor]);
  const next = useCallback(() => setQueue(q => q.slice(1)), []);
  if (!queue.length) return null;
  return (
    <Suspense fallback={null}>
      <CompletionPrompt key={queue[0]} productionId={queue[0]} remaining={queue.length - 1} onDone={next} />
    </Suspense>
  );
}

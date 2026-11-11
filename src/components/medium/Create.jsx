import Freeform from './Freeform';
import Generator from './Generator';
import HeadlineHooks from './HeadlineHooks';
import Holiday from './Holiday';
import MassProduction from './MassProduction';
import { START } from './Today';

/** One place to start a brief: pick how, then the form for it. */
export default function Create({ mode, setMode, overview, notify, onOpen, onQueued }) {
  const m = START.some(s => s.mode === mode) ? mode : 'idea';
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5" role="tablist" aria-label="How do you want to start?">
        {START.map(s => (
          <button key={s.mode} type="button" role="tab" aria-selected={m === s.mode} className={`md-action compact ${m === s.mode ? 'on' : ''}`} onClick={() => setMode(s.mode)}>
            <span className="md-emoji" aria-hidden>{s.emoji}</span>
            <span className="md-action-title">{s.title}</span>
          </button>
        ))}
      </div>
      {m === 'idea' && <Freeform overview={overview} notify={notify} onOpen={onOpen} onQueued={onQueued} />}
      {m === 'winner' && <Generator overview={overview} notify={notify} onOpen={onOpen} onQueued={onQueued} />}
      {m === 'hooks' && <HeadlineHooks overview={overview} notify={notify} onOpen={onOpen} onQueued={onQueued} />}
      {m === 'holiday' && <Holiday overview={overview} notify={notify} onOpen={onOpen} />}
      {m === 'mass' && <MassProduction notify={notify} onOpen={onOpen} onQueued={onQueued} />}
    </div>
  );
}

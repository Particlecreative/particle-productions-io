import { useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { readiness, READY_ORDER, niceDate } from './util';
import { BriefCard } from './BriefItems';

export const START = [
  { mode: 'idea', emoji: '💡', title: 'I have an idea', line: 'Say it the way you’d say it in the hallway. Medium shapes it into a brief — and writes a sharper version next to yours.' },
  { mode: 'winner', emoji: '🏆', title: 'Build on a winner', line: 'New hooks, a fresh take, or a winning idea moved to another product or lane.' },
  { mode: 'hooks', emoji: '🪝', title: 'Headline → video hook', line: 'A static’s headline that already won opens a new video, word for word.' },
  { mode: 'holiday', emoji: '🎁', title: 'Plan a holiday', line: 'One setup — every product, every format, the sale math and the deadlines.' },
];

const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function nextRun(weekday, hour) {
  const now = new Date();
  const d = new Date(now);
  d.setHours(Number(hour) || 0, 0, 0, 0);
  let add = (Number(weekday) - now.getDay() + 7) % 7;
  if (add === 0 && d <= now) add = 7;
  d.setDate(d.getDate() + add);
  return add === 0 ? `today at ${String(hour).padStart(2, '0')}:00` : add === 1 ? `tomorrow at ${String(hour).padStart(2, '0')}:00` : `${DAY[d.getDay()]} at ${String(hour).padStart(2, '0')}:00`;
}

/** The home: start something, what's waiting for you, what's coming up. No dashboards. */
export default function Today({ overview, briefs, onOpen, go }) {
  const waiting = useMemo(() => (briefs || []).filter(b => b.status === 'PENDING_REVIEW')
    .map(b => ({ b, r: readiness(b) })).sort((x, y) => (READY_ORDER[x.r.key] ?? 9) - (READY_ORDER[y.r.key] ?? 9) || new Date(y.b.created_at) - new Date(x.b.created_at)), [briefs]);
  const writing = (briefs || []).filter(b => ['QUEUED', 'WRITING'].includes(b.status)).length;
  const ready = waiting.filter(x => x.r.key === 'ready').length;
  const next = (overview?.holidays || []).find(h => h.days_to_brief_by >= 0);
  const ap = overview?.autopilot || {};
  const mondayOn = !!(overview?.monday_submit ?? overview?.sources?.monday?.submit);
  const approvedWeek = (briefs || []).filter(b => ['APPROVED', 'SUBMITTED'].includes(b.status) && Date.now() - new Date(b.created_at).getTime() < 7 * 86400000).length;

  return (
    <div className="space-y-10">
      <section>
        <h2 className="md-h2">What do you want to make?</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {START.map(s => (
            <button key={s.mode} type="button" className="md-action" onClick={() => go('create', s.mode)}>
              <span className="md-emoji" aria-hidden>{s.emoji}</span>
              <span className="md-action-title">{s.title}</span>
              <span className="md-action-line">{s.line}</span>
              {s.mode === 'holiday' && next && <span className="md-action-foot">{next.name} — briefs due in {next.days_to_brief_by} day{next.days_to_brief_by === 1 ? '' : 's'}</span>}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="md-h2">Waiting for you</h2>
          <span className="md-sub">{waiting.length ? `${waiting.length} brief${waiting.length === 1 ? '' : 's'}${ready ? ` · ${ready} ready to approve` : ''}` : ''}{writing ? `${waiting.length ? ' · ' : ''}✍️ ${writing} being written` : ''}</span>
          {(briefs || []).length > 0 && <button type="button" className="ml-auto text-[13.5px] font-semibold trk-muted hover:underline inline-flex items-center gap-1" onClick={() => go('briefs')}>All briefs <ArrowRight size={14} /></button>}
        </div>
        {!waiting.length ? (
          <div className="mt-4 trk-glass md-empty rounded-3xl">
            <div className="md-emoji" aria-hidden>{writing ? '✍️' : '☕️'}</div>
            <div className="mt-3 text-[17px] font-semibold">{writing ? 'Medium is writing — they’ll show up here' : 'You’re all caught up'}</div>
            <div className="mt-1 md-sub">{writing ? 'Each brief takes about a minute: written, style-checked, scored and proofread by Captain Caption.' : 'Start something above — or let Autopilot bring Sunday’s briefs.'}</div>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {waiting.slice(0, 9).map(({ b }) => <BriefCard key={b.id} b={b} onOpen={() => onOpen(b.id)} />)}
          </div>
        )}
        {waiting.length > 9 && <button type="button" className="mt-4 trk-btn" onClick={() => go('briefs')}>See all {waiting.length} waiting <ArrowRight size={13} /></button>}
      </section>

      <section>
        <h2 className="md-h2">Coming up</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <button type="button" className="md-action compact" onClick={() => go('create', 'holiday')}>
            <span className="md-emoji" aria-hidden>🗓️</span>
            <span className="min-w-0"><span className="md-action-title block">{next ? next.name : 'No holiday soon'}</span>
              <span className="md-action-line block">{next ? `Briefs due ${niceDate(next.brief_by)} · sale starts ${niceDate(next.date)}` : 'The calendar is clear for now.'}</span></span>
          </button>
          <button type="button" className="md-action compact" onClick={() => go('behind', 'sources')}>
            <span className="md-emoji" aria-hidden>🤖</span>
            <span className="min-w-0"><span className="md-action-title block">{ap.enabled ? `Autopilot: ${ap.per_week || 12} briefs ${nextRun(ap.weekday ?? 0, ap.hour ?? 7)}` : 'Autopilot is off'}</span>
              <span className="md-action-line block">{ap.enabled ? 'From this week’s AfterLife winners — they land here for review.' : 'Turn it on and Medium briefs the week’s winners every Sunday.'}</span></span>
          </button>
          <button type="button" className="md-action compact" onClick={() => go('market')}>
            <span className="md-emoji" aria-hidden>🌍</span>
            <span className="min-w-0"><span className="md-action-title block">{overview?.market ? `${overview.market.new_ads} new competitor ads` : 'Market Watch'}</span>
              <span className="md-action-line block">{overview?.market ? `From ${overview.market.brands} men’s grooming brands — and what’s worth briefing.` : 'What men’s grooming brands are running, every Sunday.'}</span></span>
          </button>
          <div className="md-action compact" style={{ cursor: 'default' }}>
            <span className="md-emoji" aria-hidden>📮</span>
            <span className="min-w-0"><span className="md-action-title block">{approvedWeek} approved this week</span>
              <span className="md-action-line block">{mondayOn ? 'Approving creates the ticket in Monday’s Form Requests.' : 'Approved briefs stay in CP for now (Monday is off).'}</span></span>
          </div>
        </div>
      </section>
    </div>
  );
}

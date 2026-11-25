// Team Weekly (Tomer, 25 Nov 2026: "see the latest Creative Weeklys — team version — no editing permission"). The team deck
// of each week; opens in the presenter view (read-only). The server only gives the Creative team team decks.
import { useEffect, useState } from 'react';
import { Presentation, Loader2, Play, Film, PenTool, CircleCheck } from 'lucide-react';
import CreativeShell from '../../components/creative-team/CreativeShell';
import { creativeApi } from '../../lib/creativeReportService';
import { meApi } from '../../lib/meService';

const weekLabel = (r) => r.week_label || (r.week_start ? `Week of ${new Date(`${String(r.week_start).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : 'Week');

export default function TeamWeekly() {
  const [list, setList] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    meApi.pageView('Team Weekly');
    creativeApi.list().then(r => setList((r.reports || []).filter(x => x.deck === 'team').sort((a, b) => String(b.week_start).localeCompare(String(a.week_start)))))
      .catch(e => setErr(e.message));
  }, []);
  const [latest, ...older] = list || [];
  return (
    <CreativeShell eyebrow="Creative Weekly" title="Team Weekly" sub="The team’s week — what we shipped, what’s next, who’s on what. Every Sunday.">
      {err && <div className="text-red-600 text-sm">{err}</div>}
      {!list && !err && <div className="py-20 text-center text-gray-400"><Loader2 className="inline animate-spin" /></div>}
      {list && !list.length && <div className="rounded-3xl border border-dashed border-gray-200 py-16 text-center text-gray-500">No team weekly yet — it’s made on Sunday.</div>}
      {latest && (
        <a href={`/creative-reports/${latest.id}/present`} className="group block rounded-3xl p-7 text-white relative overflow-hidden shadow-lg" style={{ background: 'linear-gradient(135deg,#030b2e 0%,#1a1f6b 55%,#0808f8 100%)' }}>
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/60">Latest</div>
          <div className="mt-1 text-[34px] sm:text-[44px] font-black uppercase leading-none" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif' }}>{weekLabel(latest)}</div>
          <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
            <span className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1"><CircleCheck size={13} /> {latest.totals?.delivered ?? 0} delivered</span>
            <span className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1"><Film size={13} /> {latest.totals?.video ?? 0} video</span>
            <span className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1"><PenTool size={13} /> {latest.totals?.design ?? 0} design</span>
          </div>
          <span className="mt-5 inline-flex items-center gap-2 bg-white text-[#030b2e] font-bold text-sm px-4 py-2.5 rounded-xl group-hover:scale-[1.02] transition-transform"><Play size={15} /> Watch it</span>
          <Presentation size={180} className="absolute -right-6 -bottom-8 text-white/[0.06]" />
        </a>
      )}
      {older.length > 0 && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {older.map(r => (
            <a key={r.id} href={`/creative-reports/${r.id}/present`} className="rounded-2xl border border-gray-200 bg-white p-4 hover:border-[#0808f8]/40 hover:shadow-md transition-all">
              <div className="font-bold text-[#030b2e]">{weekLabel(r)}</div>
              <div className="text-[12.5px] text-gray-500 mt-1">{r.totals?.delivered ?? 0} delivered · {r.totals?.video ?? 0} video · {r.totals?.design ?? 0} design</div>
            </a>
          ))}
        </div>
      )}
    </CreativeShell>
  );
}

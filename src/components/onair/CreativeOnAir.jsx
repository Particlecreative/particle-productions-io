// On Air for the Creative team (Tomer, 25 Nov 2026: "without $$$ — just to know what runs when, what starts, what ends").
// Meta: which creatives run, since when, which stopped, who made them (yours first). TV: the spots on air per product, when
// each first aired and where, and the booked schedule. The server strips every money number before it gets here.
import { useEffect, useMemo, useState } from 'react';
import { Loader2, Play, Radio, Tv, Smartphone, Sparkles, X } from 'lucide-react';
import { onairApi } from '../../lib/onairService';
import { useAuth } from '../../context/AuthContext';
import { meApi } from '../../lib/meService';

const day = (d) => (d ? new Date(`${String(d).slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z֐-׿ ]/g, '').trim();

function MetaCard({ c, mine, onPlay }) {
  return (
    <div className={`rounded-2xl bg-white border overflow-hidden flex flex-col ${mine ? 'border-[#0808f8]/40 ring-1 ring-[#0808f8]/10' : 'border-gray-200'}`}>
      <button type="button" onClick={() => (c.video_url || c.file_url) && onPlay(c)} className="relative aspect-[4/5] max-h-[280px] bg-gray-100 flex items-center justify-center overflow-hidden">
        {c.thumb ? <img src={c.thumb} alt="" loading="lazy" className="w-full h-full object-cover" /> : <span className="text-gray-300 text-3xl">{c.format === 'video' ? '🎬' : '🖼️'}</span>}
        {c.video_url && <span className="absolute inset-0 flex items-center justify-center"><span className="w-11 h-11 rounded-full bg-black/45 text-white flex items-center justify-center"><Play size={18} /></span></span>}
        <span className="absolute left-2 top-2 flex gap-1">
          {c.live ? <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-emerald-500 text-white">● Live</span> : <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-gray-700/80 text-white">Ended</span>}
          {c.new && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#0808f8] text-white">New</span>}
        </span>
        {mine && <span className="absolute right-2 top-2 text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-white text-[#0808f8]">Yours</span>}
      </button>
      <div className="p-3 flex flex-col gap-1">
        <div className="text-[13px] font-semibold text-[#030b2e] line-clamp-2">{c.label}</div>
        <div className="text-[11.5px] text-gray-500">{[c.product, c.format === 'video' ? 'Video' : 'Static'].filter(Boolean).join(' · ')}</div>
        <div className="text-[12px] text-gray-700">{c.live ? <>Running since <b>{day(c.first_spend)}</b></> : <>Ran <b>{day(c.first_spend)}</b> – <b>{day(c.last_spend)}</b></>}</div>
        {c.maker && <div className="text-[11.5px] text-gray-400">by {c.maker}</div>}
      </div>
    </div>
  );
}

function Player({ c, onClose }) {
  useEffect(() => { const k = (e) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);
  return (
    <div className="fixed inset-0 z-[90] bg-black/85 flex items-center justify-center p-4" onClick={onClose}>
      {c.video_url ? <video src={c.video_url} controls autoPlay playsInline className="max-h-[86vh] max-w-[92vw] rounded-xl" onClick={(e) => e.stopPropagation()} />
        : <img src={c.file_url} alt="" className="max-h-[86vh] max-w-[92vw] rounded-xl" onClick={(e) => e.stopPropagation()} />}
      <button type="button" onClick={onClose} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white" aria-label="Close"><X size={18} /></button>
    </div>
  );
}

export default function CreativeOnAir() {
  const { user } = useAuth();
  const [tab, setTab] = useState('meta');
  const [media, setMedia] = useState(null);
  const [tv, setTv] = useState(null);
  const [show, setShow] = useState('all');
  const [play, setPlay] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    meApi.pageView('On Air');
    onairApi.media().then(setMedia).catch(e => setErr(e.message));
    onairApi.tv().then(setTv).catch(() => setTv({ products: [] }));
  }, []);
  const me = norm(user?.name);
  const isMine = (c) => !!me && norm(c.maker) === me;
  const creatives = useMemo(() => {
    const list = (media?.creatives || []).filter(c => show === 'all' || (show === 'mine' && isMine(c)) || (show === 'new' && c.new) || (show === 'live' && c.live) || (show === 'ended' && !c.live));
    return list.sort((a, b) => (isMine(b) - isMine(a)) || (b.live - a.live) || String(b.first_spend || '').localeCompare(String(a.first_spend || '')));
  }, [media, show]); // eslint-disable-line react-hooks/exhaustive-deps
  const mineLive = (media?.creatives || []).filter(c => isMine(c) && c.live).length;

  return (
    <div className="max-w-[2400px] mx-auto pb-16">
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="flex-1 min-w-[220px]">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0808f8] flex items-center gap-1.5"><Radio size={12} /> Live now</div>
          <h1 className="font-black uppercase leading-none text-[34px] sm:text-[48px] mt-1" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: '#030b2e' }}>On Air</h1>
          <p className="text-sm text-gray-500 mt-1.5">What runs, since when, and what stopped — on Meta and on TV.{mineLive ? <> <b className="text-[#0808f8]">{mineLive} of yours</b> running on Meta right now.</> : null}</p>
        </div>
        <div className="flex rounded-xl border border-gray-200 bg-white p-1">
          {[['meta', Smartphone, 'Meta'], ['tv', Tv, 'TV']].map(([k, Icon, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`flex items-center gap-1.5 text-[13px] font-semibold px-4 py-1.5 rounded-lg ${tab === k ? 'bg-[#030b2e] text-white' : 'text-gray-500'}`}><Icon size={14} /> {l}</button>
          ))}
        </div>
      </div>

      {tab === 'meta' && (
        <>
          <div className="flex flex-wrap gap-1.5 mb-4">
            {[['all', 'All'], ['mine', 'Mine'], ['live', 'Live'], ['new', 'Started lately'], ['ended', 'Ended']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setShow(k)} className={`text-[12.5px] font-semibold px-3 py-1.5 rounded-full border ${show === k ? 'bg-[#0808f8] text-white border-[#0808f8]' : 'bg-white text-gray-600 border-gray-200'}`}>{l}</button>
            ))}
            {media?.last_day && <span className="ml-auto text-[12px] text-gray-400 self-center">AfterLife data up to {day(media.last_day)}</span>}
          </div>
          {err && <div className="text-red-600 text-sm">{err}</div>}
          {!media && !err && <div className="py-20 text-center text-gray-400"><Loader2 className="inline animate-spin" /></div>}
          {media && !creatives.length && <div className="rounded-3xl border border-dashed border-gray-200 py-14 text-center text-gray-500">{show === 'mine' ? 'None of yours ran on Meta in the last two weeks.' : 'Nothing here.'}</div>}
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
            {creatives.map(c => <MetaCard key={c.key} c={c} mine={isMine(c)} onPlay={setPlay} />)}
          </div>
        </>
      )}

      {tab === 'tv' && (
        <div className="flex flex-col gap-5">
          {!tv && <div className="py-20 text-center text-gray-400"><Loader2 className="inline animate-spin" /></div>}
          {tv && !(tv.products || []).length && <div className="rounded-3xl border border-dashed border-gray-200 py-14 text-center text-gray-500">Nothing on TV right now.</div>}
          {(tv?.products || []).map(p => (
            <section key={p.name} className="rounded-3xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2"><Tv size={16} className="text-[#0808f8]" /><h2 className="text-[18px] font-bold text-[#030b2e]">{p.name}</h2><span className="text-[12px] text-gray-400">{(p.spots || []).length} spot{(p.spots || []).length === 1 ? '' : 's'} on air</span></div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {(p.spots || []).map(s => (
                  <div key={s.code || s.name} className="rounded-xl bg-gray-50 px-3 py-2.5">
                    <div className="flex items-center gap-2"><span className="font-semibold text-[13.5px] text-[#030b2e] truncate">{s.library?.title || s.name || s.code}</span>{s.is_new && <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full bg-[#0808f8] text-white flex-none">New</span>}</div>
                    <div className="text-[12px] text-gray-500 mt-0.5">{s.code}{s.first?.date ? <> · first aired <b>{day(s.first.date)}</b>{s.first.station ? ` on ${s.first.station}` : ''}</> : s.first_seen ? <> · on air since <b>{day(s.first_seen)}</b></> : null}</div>
                  </div>
                ))}
              </div>
              {(p.plan?.creatives || []).length > 0 && (
                <div className="mt-4">
                  <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1.5 flex items-center gap-1"><Sparkles size={11} /> Booked next</div>
                  <div className="flex flex-wrap gap-1.5">
                    {p.plan.creatives.map((c, i) => <span key={`${c.code}-${i}`} className="text-[12px] px-2.5 py-1 rounded-full border border-gray-200 text-gray-700">{c.library?.title || c.name || c.code}{c.markets?.length ? ` · ${c.markets.slice(0, 3).join(', ')}` : ''}</span>)}
                  </div>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      {play && <Player c={play} onClose={() => setPlay(null)} />}
    </div>
  );
}

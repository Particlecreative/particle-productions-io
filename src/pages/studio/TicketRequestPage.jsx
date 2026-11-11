import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ArrowRight, Loader2, AlertTriangle, UserRound, Search, Check } from 'lucide-react';
import TicketCreator from '../../components/studio/TicketCreator';
import { shareTicketApi } from '../../lib/ticketShareService';

const SAVED = 'cp_request_from';
const load = () => { try { const v = JSON.parse(localStorage.getItem(SAVED) || 'null'); return v?.name ? v : null; } catch { return null; } };
const save = (v) => { try { localStorage.setItem(SAVED, JSON.stringify(v)); } catch { /* private mode */ } };

/** /request/:token — anyone with the studio's link can request a ticket; they say who they are first. */
export default function TicketRequestPage() {
  const { token } = useParams();
  const [who, setWho] = useState(load);
  const [asking, setAsking] = useState(() => !load());
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const whoRef = useRef(who);
  whoRef.current = who;
  const api = useMemo(() => shareTicketApi(token, () => whoRef.current), [token]);

  useEffect(() => {
    document.title = 'Request a ticket — Particle Creative Studio';
    const m = document.createElement('meta'); m.name = 'robots'; m.content = 'noindex'; document.head.appendChild(m);
    api.ticketForm().then(setInfo).catch(e => setError(e));
    return () => m.remove();
  }, [api]);

  return (
    <div className="min-h-screen" style={{ background: 'radial-gradient(1000px 520px at 90% -10%, rgba(8,8,248,.10), transparent 60%), #f5f6fb' }}>
      <header className="max-w-[1400px] mx-auto px-4 sm:px-8 pt-6 sm:pt-8 flex flex-wrap items-end gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#0808f8]">Particle · Creative Studio</div>
          <h1 className="text-[40px] sm:text-[52px] leading-[0.95] font-extrabold text-[#030b2e] mt-2" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif' }}>Request a ticket</h1>
          <p className="text-sm sm:text-[15px] text-gray-500 mt-2 max-w-[620px]">Tell us what you need in your own words — add links, files or screenshots. The assistant fills in the studio’s form; you check it and send it.</p>
        </div>
        {who && !asking && (
          <button type="button" onClick={() => setAsking(true)} className="ml-auto inline-flex items-center gap-2 text-sm pl-2 pr-3 py-1.5 rounded-full bg-white border border-gray-200 hover:border-[#0808f8]" title="Change who the request is from">
            <Avatar u={who} size={28} />
            <span className="text-gray-500">Requesting as</span> <b className="text-[#030b2e]">{who.name}</b> <span className="text-[#0808f8] font-semibold">· change</span>
          </button>
        )}
      </header>

      <main className="max-w-[1400px] mx-auto px-4 sm:px-8 py-6 sm:py-8">
        {error ? (
          <div className="max-w-lg mx-auto mt-10 bg-white rounded-3xl border border-gray-200 p-10 text-center">
            <AlertTriangle size={36} className="mx-auto text-amber-500" />
            <div className="text-lg font-bold text-[#030b2e] mt-3">{error.status === 404 ? 'This link isn’t active any more' : 'Something went wrong'}</div>
            <p className="text-sm text-gray-500 mt-1">{error.status === 404 ? 'Ask the studio for the current request link.' : error.message}</p>
          </div>
        ) : !info ? (
          <div className="py-24 text-center text-gray-400"><Loader2 className="animate-spin inline" /></div>
        ) : asking ? (
          <WhoAreYou requesters={info.requesters || []} initial={who} onDone={(v) => { save(v); setWho(v); setAsking(false); }} />
        ) : (
          <TicketCreator api={api} share={{ requester: who, onChangeRequester: () => setAsking(true) }} />
        )}
      </main>
      <footer className="pb-8 text-center text-xs text-gray-400">Particle Creative Studio · tickets go to the studio’s Monday board</footer>
    </div>
  );
}

function Avatar({ u, size = 32 }) {
  return u?.photo
    ? <img src={u.photo} alt="" referrerPolicy="no-referrer" className="rounded-full object-cover flex-none" style={{ width: size, height: size }} />
    : <span className="rounded-full flex items-center justify-center text-white font-bold flex-none" style={{ width: size, height: size, fontSize: size * 0.4, background: '#030b2e' }}>{String(u?.name || '?').slice(0, 1).toUpperCase()}</span>;
}

/** Pick yourself from the studio's Monday users (or, if you're not on Monday, type your name). */
function WhoAreYou({ requesters, initial, onDone }) {
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(initial?.id ? requesters.find(r => r.id === initial.id) || null : null);
  const [manual, setManual] = useState(!!initial && !initial.id);
  const [name, setName] = useState(initial && !initial.id ? initial.name : '');
  const [email, setEmail] = useState(initial?.email || '');
  const fold = (x) => String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = requesters.filter(r => !q.trim() || fold(r.name).includes(fold(q.trim()))).slice(0, 60);
  const ok = manual ? name.trim().length >= 2 && (!email || /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email.trim())) : !!pick;
  const done = (e) => {
    e.preventDefault();
    if (!ok) return;
    onDone(manual ? { id: null, name: name.trim(), email: email.trim().toLowerCase() || null } : { id: pick.id, name: pick.name, photo: pick.photo || null });
  };
  return (
    <form className="max-w-md mx-auto mt-4 sm:mt-10 bg-white rounded-3xl border border-gray-200 shadow-sm p-7" onSubmit={done}>
      <span className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: '#0808f80f' }}><UserRound size={22} className="text-[#0808f8]" /></span>
      <div className="text-2xl font-extrabold text-[#030b2e] mt-4" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif' }}>Who’s this request from?</div>
      <p className="text-sm text-gray-500 mt-1">{manual ? 'Your name goes on the ticket, so the studio knows who to ask.' : 'Pick yourself — the ticket is Requested by you on Monday, and you’ll get its updates.'}</p>

      {!manual ? (
        <>
          <div className="relative mt-5">
            <Search size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search your name…" aria-label="Search Monday users" className="w-full text-[15px] pl-10 pr-4 py-3 rounded-2xl border border-gray-200 outline-none focus:border-[#4a55ff]" />
          </div>
          <div className="mt-2 max-h-[300px] overflow-y-auto -mx-2 px-2" role="listbox" aria-label="Monday users">
            {list.map(r => (
              <button key={r.id} type="button" role="option" aria-selected={pick?.id === r.id} onClick={() => setPick(r)} onDoubleClick={() => onDone({ id: r.id, name: r.name, photo: r.photo || null })}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-2xl text-left transition-colors ${pick?.id === r.id ? 'bg-[#0808f8]/8 ring-1 ring-[#0808f8]' : 'hover:bg-gray-50'}`}>
                <Avatar u={r} />
                <span className="text-[15px] text-gray-800 flex-1 truncate">{r.name}</span>
                {pick?.id === r.id && <Check size={16} className="text-[#0808f8]" />}
              </button>
            ))}
            {!list.length && <div className="text-sm text-gray-400 px-3 py-6 text-center">No one called “{q}” on Monday.</div>}
          </div>
          <button type="button" onClick={() => { setManual(true); setName(q); }} className="mt-3 text-xs font-semibold text-gray-500 hover:text-[#0808f8]">Not on Monday? Type your name instead</button>
        </>
      ) : (
        <>
          <label className="block mt-5">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Your name</span>
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last name" className="mt-1 w-full text-[15px] px-4 py-3 rounded-2xl border border-gray-200 outline-none focus:border-[#4a55ff]" />
          </label>
          <label className="block mt-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">Work email <span className="normal-case font-medium tracking-normal text-gray-400">(optional)</span></span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" className="mt-1 w-full text-[15px] px-4 py-3 rounded-2xl border border-gray-200 outline-none focus:border-[#4a55ff]" />
          </label>
          <button type="button" onClick={() => setManual(false)} className="mt-3 text-xs font-semibold text-gray-500 hover:text-[#0808f8]">← Pick from Monday users</button>
        </>
      )}
      <button type="submit" disabled={!ok} className="mt-5 w-full text-[15px] font-semibold py-3 rounded-2xl text-white flex items-center justify-center gap-2 disabled:opacity-40" style={{ background: '#0808f8' }}>
        {pick && !manual ? <>Continue as {pick.name.split(' ')[0]}</> : 'Continue'} <ArrowRight size={16} />
      </button>
      <p className="text-[11px] text-gray-400 mt-3 text-center">Remembered on this device only.</p>
    </form>
  );
}

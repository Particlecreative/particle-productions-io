// Team activity (admins) — Tomer, 17 Nov 2026: "I want to see their use in CP — what are their actions, what did they do,
// stats and when". Everyone who isn't an admin: sign-ins, pages, briefs written / approved / sent, tickets created, the
// libraries and productions they opened, Monday connected, and anything the Growth Studio refused them.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, Loader2, AlertTriangle, RefreshCw, Check } from 'lucide-react';
import { meApi } from '../../lib/meService';
import { useLive, useAgo } from '../../lib/useLive';

const NAVY = '#030b2e';
const KIND = {
  signin: ['🔑', 'Signed in'], page: ['👀', 'Opened a page'], brief_write: ['✍️', 'Wrote briefs'], brief_edit: ['🖊️', 'Edited a brief'],
  brief_approve: ['✅', 'Approved'], brief_submit: ['📤', 'Sent to Monday'], brief_reject: ['🚫', 'Rejected'], ticket_create: ['✨', 'Created a ticket'],
  ticket_draft: ['📝', 'Drafted a ticket'], ads_library: ['📱', 'Ads Library'], tv_library: ['📺', 'TV Library'], productions: ['🎬', 'Productions'],
  production: ['🎬', 'Opened a production'], workload: ['📅', 'Workload'], campaigns: ['📣', 'Campaigns'], briefs: ['📂', 'Their briefs'],
  monday_connect: ['🔗', 'Connected Monday'], monday_disconnect: ['⛓️', 'Disconnected Monday'], blocked: ['⛔', 'Refused'],
  task_move: ['🔀', 'Moved a task'], delivery_link: ['🎬', 'Added a delivery link'], task_update: ['💬', 'Wrote an update'], task_like: ['👍', 'Liked an update'],
  clock_in: ['🟢', 'Clocked in'], clock_out: ['⚪', 'Clocked out'], time_off: ['🌴', 'Time off'], hr_connect: ['🔗', 'Connected BambooHR'],
  password_reveal: ['👁️', 'Revealed a password'], password_copy: ['📋', 'Copied a password'], password_edit: ['🔐', 'Edited a login'], password_add: ['➕', 'Added a login'],
  change: ['✏️', 'Changed something'],
};
const FILTERS = [['all', 'Everything'], ['moves', 'Moves only'], ['tasks', 'Tasks'], ['hr', 'Clock & time off'], ['passwords', 'Passwords'], ['pages', 'Pages']];
const inFilter = (k, f) => f === 'all' || (f === 'moves' ? !['page', 'signin', 'tv_library', 'ads_library', 'productions', 'production', 'workload', 'campaigns', 'briefs'].includes(k)
  : f === 'tasks' ? /^task_|delivery_link|ticket_/.test(k) : f === 'hr' ? /^clock_|time_off|hr_/.test(k) : f === 'passwords' ? /^password_/.test(k) : f === 'pages' ? k === 'page' : true);
const COLS = [['signin', 'Sign-ins'], ['brief_write', 'Briefs written'], ['brief_approve', 'Approved'], ['brief_submit', 'Sent to Monday'], ['ticket_create', 'Tickets'], ['ads_library', 'Ads Library'], ['tv_library', 'TV Library'], ['productions', 'Productions']];
const ago = (iso) => {
  if (!iso) return '—';
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 90) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const time = (iso) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jerusalem' });
const ilDay = (iso) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

export default function TeamActivity() {
  const [days, setDays] = useState(30);
  const [who, setWho] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await meApi.activity(days, who)); } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [days, who]);
  useEffect(() => { load(); }, [load]);
  // live (25 Nov 2026): every 20 s, quietly
  const liveAt = useLive(async () => { try { setData(await meApi.activity(days, who)); } catch { /* keep what's shown */ } }, { every: 20000 });
  const liveAgo = useAgo(liveAt);
  const [kind, setKind] = useState('moves');
  const online = useMemo(() => (data?.people || []).filter(p => p.last_seen && Date.now() - new Date(p.last_seen).getTime() < 5 * 60 * 1000), [data]);

  const connected = useMemo(() => new Set((data?.monday || []).map(m => String(m.user_id))), [data]);
  const byDay = useMemo(() => {
    const m = new Map();
    for (const e of data?.events || []) { if (!inFilter(e.kind, kind)) continue; const d = ilDay(e.at); if (!m.has(d)) m.set(d, []); m.get(d).push(e); }
    return [...m.entries()];
  }, [data, kind]);
  const spark = useMemo(() => {
    const m = new Map();
    for (const r of data?.daily || []) if (!who || String(r.user_id) === who) m.set(r.day, (m.get(r.day) || 0) + r.n);
    const out = [];
    for (let i = (data?.days || days) - 1; i >= 0; i--) { const d = new Date(Date.now() - i * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); out.push([d, m.get(d) || 0]); }
    return out;
  }, [data, days, who]);
  const maxS = Math.max(1, ...spark.map(([, n]) => n));

  return (
    <div className="max-w-[1600px] mx-auto pb-16 flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0808f8] flex items-center gap-1.5"><Activity size={13} /> Team activity</div>
          <h1 className="font-black uppercase leading-none text-[40px] sm:text-[52px] mt-1" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: NAVY }}>Who did what in CP</h1>
          <p className="text-sm text-gray-500 mt-1">Every move of everyone in CP but you — the creative team, Growth, producers and admins. Live: it refreshes itself every 20 seconds{liveAgo ? ` (updated ${liveAgo})` : ''}. Reading the same page twice within 10 minutes counts once.</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex bg-white border border-gray-200 rounded-xl p-0.5">
            {[[7, '7 days'], [30, '30 days'], [90, '90 days']].map(([d, l]) => <button key={d} type="button" onClick={() => setDays(d)} className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${days === d ? 'bg-[#030b2e] text-white' : 'text-gray-600'}`}>{l}</button>)}
          </div>
          <button type="button" onClick={load} disabled={loading} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-white border border-gray-200 text-gray-600"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh</button>
        </div>
      </div>

      {error && <div className="px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {error}</div>}
      {!data && !error && <div className="py-24 text-center text-gray-400"><Loader2 className="inline animate-spin" /></div>}

      {data && (
        <>
          <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3 flex flex-wrap items-center gap-3">
            <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              <span className="relative flex w-2 h-2"><span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-60 animate-ping" /><span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" /></span>
              Online now · {online.length}
            </span>
            {!online.length && <span className="text-[12.5px] text-gray-400">Nobody in the last 5 minutes.</span>}
            {online.map(p => (
              <button key={p.user_id} type="button" onClick={() => setWho(String(p.user_id))} className="flex items-center gap-2 pl-1 pr-3 py-1 rounded-full bg-emerald-50 text-[12.5px] font-semibold text-emerald-800">
                <span className="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px] font-bold">{String(p.name || '?').split(' ').map(x => x[0]).join('').slice(0, 2)}</span>
                {p.name}<span className="text-emerald-600/70 font-normal">· {p.role}</span>
              </button>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-2">Actions per day{who ? ` · ${data.people.find(p => String(p.user_id) === who)?.name || ''}` : ''}</div>
            <div className="flex items-end gap-[3px] h-16">
              {spark.map(([d, n]) => <div key={d} title={`${dayLabel(d)}: ${n}`} className="flex-1 rounded-t" style={{ height: `${Math.max(n ? 8 : 2, (n / maxS) * 100)}%`, background: n ? '#0808f8' : '#e5e7eb' }} />)}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100">
                <th className="px-4 py-2.5">Person</th><th className="px-3 py-2.5">Last seen</th><th className="px-3 py-2.5">Days active</th>
                {COLS.map(([, l]) => <th key={l} className="px-3 py-2.5 text-right whitespace-nowrap">{l}</th>)}
                <th className="px-3 py-2.5 text-center">Monday</th>
              </tr></thead>
              <tbody>
                {!data.people.length && <tr><td colSpan={COLS.length + 4} className="py-10 text-center text-gray-400">Nobody yet — it fills in as soon as the team signs in.</td></tr>}
                {data.people.map(p => (
                  <tr key={p.user_id} onClick={() => setWho(who === String(p.user_id) ? '' : String(p.user_id))}
                    className={`border-b border-gray-50 cursor-pointer ${who === String(p.user_id) ? 'bg-[#eef0ff]' : 'hover:bg-[#f5f6ff]'}`}>
                    <td className="px-4 py-2.5"><div className="font-semibold" style={{ color: NAVY }}>{p.name || 'Someone'}</div><div className="text-[11px] text-gray-400">{p.role}</div></td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{ago(p.last_seen)}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-600 tabular-nums">{p.days_active}</td>
                    {COLS.map(([k]) => <td key={k} className="px-3 py-2.5 text-right tabular-nums font-semibold" style={{ color: p.kinds?.[k] ? NAVY : '#d1d5db' }}>{p.kinds?.[k] || 0}</td>)}
                    <td className="px-3 py-2.5 text-center">{connected.has(String(p.user_id)) ? <Check size={15} className="inline text-emerald-600" /> : <span className="text-gray-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center gap-2">
            <h2 className="font-black uppercase text-[24px] leading-none" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif', color: NAVY }}>What happened</h2>
            {who && <button type="button" onClick={() => setWho('')} className="text-xs font-semibold text-[#0808f8] hover:underline">Show everyone</button>}
            <div className="ml-auto flex flex-wrap gap-1">
              {FILTERS.map(([k, l]) => <button key={k} type="button" onClick={() => setKind(k)} className={`text-[11.5px] font-semibold px-2.5 py-1 rounded-lg ${kind === k ? 'bg-[#030b2e] text-white' : 'text-gray-500 hover:bg-gray-100 bg-white border border-gray-200'}`}>{l}</button>)}
            </div>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200">
            {!byDay.length && <div className="py-10 text-center text-sm text-gray-400">Nothing in this period.</div>}
            {byDay.map(([d, list]) => (
              <div key={d} className="border-b border-gray-100 last:border-0">
                <div className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-gray-400">{dayLabel(d)} · {list.length}</div>
                {list.map(e => {
                  const [emoji, kindLabel] = KIND[e.kind] || ['•', e.kind];
                  return (
                    <div key={e.id} className="flex items-baseline gap-3 px-4 py-1.5 text-sm">
                      <span className="w-12 flex-none text-[11px] text-gray-400 tabular-nums">{time(e.at)}</span>
                      <span className="w-5 flex-none" aria-hidden="true">{emoji}</span>
                      <span className="min-w-0 flex-1">
                        <b className="font-semibold" style={{ color: NAVY }}>{e.user_name || 'Someone'}</b>{' '}
                        <span className={e.kind === 'blocked' ? 'text-red-600' : 'text-gray-700'}>{(e.label || kindLabel).replace(/^./, c => c.toLowerCase())}</span>
                        {e.ref_name && <span className="text-gray-500"> — {e.ref_name}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

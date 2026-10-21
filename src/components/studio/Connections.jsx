import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, Clock, Film, CalendarCheck, ExternalLink } from 'lucide-react';
import { Card } from './Bits';
import { studioApi } from '../../lib/studioService';
import { useAuth } from '../../context/AuthContext';

const when = (iso) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

function Status({ ok, children }) {
  return ok
    ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14} /> {children || 'Connected'}</span>
    : <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400">Not connected</span>;
}

/** Keys are typed here and sent straight to the server (sealed there) — they're never shown again. */
export default function Connections({ onChanged }) {
  const { isAdmin } = useAuth();
  const [c, setC] = useState(null);
  const [bhr, setBhr] = useState({ subdomain: 'particle', key: '' });
  const [tmdb, setTmdb] = useState('');
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const load = () => studioApi.connections().then(setC).catch(e => setMsg({ ok: false, text: e.message }));
  useEffect(() => { load(); }, []);
  const run = async (key, fn, okText) => {
    setBusy(key); setMsg(null);
    try { const r = await fn(); setMsg({ ok: true, text: typeof okText === 'function' ? okText(r) : okText }); await load(); onChanged?.(); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(null); }
  };
  if (!c) return <div className="py-16 text-center text-gray-400"><Loader2 className="animate-spin inline" /></div>;
  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      {msg && <div className={`px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 ${msg.ok ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>{msg.ok ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}{msg.text}</div>}

      <Card title={<span className="flex items-center gap-2"><CalendarCheck size={15} className="text-[#0808f8]" /> Monday</span>} right={<Status ok={c.monday.connected} />}>
        <p className="text-sm text-gray-500">Video Projects and Design Projects 2.0 are read live. Changes you make in the Studio (drag &amp; drop, new tickets) are written back to Monday.</p>
      </Card>

      <Card title={<span className="flex items-center gap-2"><Clock size={15} className="text-[#0808f8]" /> BambooHR — clock in / out &amp; time off</span>}
        right={<Status ok={c.bamboohr.connected}>{c.bamboohr.connected ? `Connected · ${c.bamboohr.subdomain}.bamboohr.com` : null}</Status>}>
        <p className="text-sm text-gray-500 mb-3">
          Uses <b>your own</b> BambooHR API key, so the Studio sees exactly what you see as their manager: clock-ins for time tracking, and time off / holidays for the vacations layer.
          In BambooHR: click your photo (top right) → <b>API Keys</b> → <b>Add New Key</b>.
        </p>
        {c.bamboohr.connected && c.bamboohr.set_at && (
          <p className="text-xs text-gray-400 mb-3">Connected {when(c.bamboohr.set_at)}{c.bamboohr.set_by ? ` by ${c.bamboohr.set_by}` : ''}{c.bamboohr.meta?.employees_visible != null ? ` · sees ${c.bamboohr.meta.employees_visible} people` : ''}{c.bamboohr.source === 'env' ? ' · from server settings' : ''}</p>
        )}
        {isAdmin ? (
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); run('bhr', () => studioApi.connectBamboo(bhr.subdomain, bhr.key), (r) => `BambooHR connected — it can see ${r.employees_visible} people.`).then(() => setBhr(b => ({ ...b, key: '' }))); }}>
            <div className="flex items-center rounded-xl border border-gray-200 bg-white overflow-hidden">
              <input value={bhr.subdomain} onChange={e => setBhr({ ...bhr, subdomain: e.target.value })} className="w-28 text-sm px-3 py-2 outline-none" placeholder="company" />
              <span className="text-sm text-gray-400 pr-3">.bamboohr.com</span>
            </div>
            <input type="password" autoComplete="off" value={bhr.key} onChange={e => setBhr({ ...bhr, key: e.target.value })} placeholder={c.bamboohr.connected ? 'Paste a new key to replace' : 'Paste your API key'}
              className="flex-1 min-w-[220px] text-sm px-3 py-2 rounded-xl border border-gray-200 outline-none focus:border-[#4a55ff]" />
            <button type="submit" disabled={busy === 'bhr' || !bhr.key} className="text-sm font-semibold px-4 py-2 rounded-xl text-white disabled:opacity-40 flex items-center gap-2" style={{ background: '#0808f8' }}>
              {busy === 'bhr' && <Loader2 size={14} className="animate-spin" />} Test &amp; connect
            </button>
            {c.bamboohr.connected && c.bamboohr.source !== 'env' && (
              <button type="button" disabled={busy === 'bhr'} onClick={() => window.confirm('Disconnect BambooHR? Time tracking falls back to 09:00–19:00.') && run('bhr', studioApi.disconnectBamboo, 'BambooHR disconnected.')}
                className="text-sm font-semibold px-3 py-2 rounded-xl text-gray-500 hover:text-red-600">Disconnect</button>
            )}
          </form>
        ) : <p className="text-xs text-gray-400">Only admins can connect BambooHR.</p>}
      </Card>

      <Card title={<span className="flex items-center gap-2"><Film size={15} className="text-[#0808f8]" /> TMDB — movie stills for the line of the day</span>} right={<Status ok={c.tmdb.connected} />}>
        <p className="text-sm text-gray-500 mb-3">
          Free. Sign up at <a className="text-[#0808f8] inline-flex items-center gap-1" href="https://www.themoviedb.org/signup" target="_blank" rel="noopener noreferrer">themoviedb.org <ExternalLink size={11} /></a>, then
          Settings → <b>API</b> → request a key (choose “Developer”, personal use) and paste the <b>API Read Access Token</b> or <b>API Key</b> here.
        </p>
        {isAdmin ? (
          <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); run('tmdb', () => studioApi.connectTmdb(tmdb), 'TMDB connected — today’s still will appear on the dashboard.').then(() => setTmdb('')); }}>
            <input type="password" autoComplete="off" value={tmdb} onChange={e => setTmdb(e.target.value)} placeholder={c.tmdb.connected ? 'Paste a new key to replace' : 'Paste the TMDB key or token'}
              className="flex-1 min-w-[260px] text-sm px-3 py-2 rounded-xl border border-gray-200 outline-none focus:border-[#4a55ff]" />
            <button type="submit" disabled={busy === 'tmdb' || !tmdb} className="text-sm font-semibold px-4 py-2 rounded-xl text-white disabled:opacity-40 flex items-center gap-2" style={{ background: '#0808f8' }}>
              {busy === 'tmdb' && <Loader2 size={14} className="animate-spin" />} Test &amp; connect
            </button>
          </form>
        ) : <p className="text-xs text-gray-400">Only admins can connect TMDB.</p>}
        <p className="text-[11px] text-gray-400 mt-3">This product uses the TMDB API but is not endorsed or certified by TMDB.</p>
      </Card>
    </div>
  );
}

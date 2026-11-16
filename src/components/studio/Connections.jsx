import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, Loader2, Clock, Film, CalendarCheck, ExternalLink, FolderPlus, Copy } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
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
  const [dbx, setDbx] = useState({ key: '', base: '' });
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [params, setParams] = useSearchParams();
  // back from Dropbox's sign-in
  useEffect(() => {
    const ok = params.get('dropbox'), err = params.get('dropbox_error');
    if (!ok && !err) return;
    setMsg(ok ? { ok: true, text: 'Dropbox connected — every new ticket now gets its folder and link.' } : { ok: false, text: `Dropbox: ${err}` });
    const next = new URLSearchParams(params); next.delete('dropbox'); next.delete('dropbox_error'); setParams(next, { replace: true });
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
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

      <DropboxCard d={c.dropbox || {}} isAdmin={isAdmin} busy={busy} dbx={dbx} setDbx={setDbx}
        connect={() => run('dbx', async () => { const r = await studioApi.connectDropbox(dbx.key, dbx.base || c.dropbox?.base); window.location.href = r.url; }, 'Opening Dropbox…')}
        disconnect={() => window.confirm('Disconnect Dropbox? New tickets will be made without a Dropbox folder.') && run('dbx', studioApi.disconnectDropbox, 'Dropbox disconnected.')} />

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

/** New tickets get a Dropbox folder where the studio's folders go (Tomer, 16 Nov 2026) — needs a Full Dropbox app. */
function DropboxCard({ d, isAdmin, busy, dbx, setDbx, connect, disconnect }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard?.writeText(d.redirect_uri || '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }).catch(() => {}); };
  return (
    <Card title={<span className="flex items-center gap-2"><FolderPlus size={15} className="text-[#0808f8]" /> Dropbox — a folder for every new ticket</span>}
      right={<Status ok={d.connected}>{d.connected ? `Connected${d.account ? ` · ${d.account}` : ''}` : null}</Status>}>
      <p className="text-sm text-gray-500 mb-3">
        A ticket made in <b>New ticket</b> gets its folder in the studio’s tree, the way the folders are made today —
        <span className="text-gray-700"> Marketing Ads › Products › Face Cream › Video › Meta › 11_November 2026 › <i>the ticket</i></span> (Website, TV and Bundles have their own branches) —
        and the link goes in the ticket’s Dropbox column.
      </p>
      {d.connected ? (
        <p className="text-xs text-gray-400 mb-3">Folders go in <b className="text-gray-600">{d.folder || d.base}</b>{d.set_at ? ` · connected ${when(d.set_at)}` : ''}{d.set_by ? ` by ${d.set_by}` : ''}</p>
      ) : (
        <ol className="text-sm text-gray-600 mb-3 list-decimal pl-5 space-y-1">
          <li>At <a className="text-[#0808f8] inline-flex items-center gap-1" href="https://www.dropbox.com/developers/apps/create" target="_blank" rel="noopener noreferrer">dropbox.com/developers <ExternalLink size={11} /></a> → <b>Scoped access</b> → <b>Full Dropbox</b> → name it (e.g. “CP Studio folders”).</li>
          <li><b>Permissions</b> tab: tick <code className="text-xs">files.metadata.read</code>, <code className="text-xs">files.content.write</code>, <code className="text-xs">sharing.read</code> and <code className="text-xs">sharing.write</code> → Submit.</li>
          <li><b>Settings</b> tab → Redirect URIs → add
            <button type="button" onClick={copy} className="ml-1 inline-flex items-center gap-1 text-xs font-mono px-2 py-0.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 break-all text-left">{d.redirect_uri}<Copy size={11} className="flex-none" /></button>
            {copied && <span className="text-xs text-emerald-700 ml-1">copied</span>}
            <span className="block text-xs text-gray-400">Leave “Allow public clients (PKCE)” on — only the app key is needed, never the secret.</span></li>
          <li>Paste the <b>App key</b> below → Connect → sign in with the Dropbox account that has the studio’s folders.</li>
        </ol>
      )}
      {isAdmin ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={(e) => { e.preventDefault(); connect(); }}>
          <input autoComplete="off" value={dbx.key} onChange={e => setDbx({ ...dbx, key: e.target.value })} placeholder={d.connected ? 'App key (to reconnect)' : 'App key'}
            className="w-44 text-sm px-3 py-2 rounded-xl border border-gray-200 outline-none focus:border-[#4a55ff]" />
          <input value={dbx.base} onChange={e => setDbx({ ...dbx, base: e.target.value })} placeholder={d.base || '/Creative Assets 2026 - MV Sync'} title="The studio’s top folder"
            className="flex-1 min-w-[220px] text-sm px-3 py-2 rounded-xl border border-gray-200 outline-none focus:border-[#4a55ff]" />
          <button type="submit" disabled={busy === 'dbx' || !dbx.key} className="text-sm font-semibold px-4 py-2 rounded-xl text-white disabled:opacity-40 flex items-center gap-2" style={{ background: '#0808f8' }}>
            {busy === 'dbx' && <Loader2 size={14} className="animate-spin" />} {d.connected ? 'Reconnect' : 'Connect Dropbox'}
          </button>
          {d.connected && <button type="button" disabled={busy === 'dbx'} onClick={disconnect} className="text-sm font-semibold px-3 py-2 rounded-xl text-gray-500 hover:text-red-600">Disconnect</button>}
        </form>
      ) : <p className="text-xs text-gray-400">Only admins can connect Dropbox.</p>}
    </Card>
  );
}

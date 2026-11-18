// First stop (Tomer, 17 Nov 2026): "let's start by connecting your Monday to your user". Once connected, the briefs and
// tickets they send from CP are created on Monday AS them — their name, their notifications.
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Check, Loader2, ArrowRight, KeyRound, ChevronDown, ChevronUp, AlertTriangle, Unplug } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { meApi } from '../../lib/meService';

export const SKIP_KEY = 'cp_monday_skip_v1';
const first = (n) => String(n || '').trim().split(/\s+/)[0];

export default function Welcome() {
  const { user, isGrowth } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const [st, setSt] = useState(null);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(params.get('monday_error') || null);
  const [showToken, setShowToken] = useState(false);
  const [token, setToken] = useState('');

  useEffect(() => {
    meApi.monday().then(setSt).catch(e => setErr(e.message));
    if (params.get('monday') || params.get('monday_error')) setParams({}, { replace: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (st && !st.oauth) setShowToken(true); }, [st]);

  const oneClick = async () => {
    setBusy('oauth'); setErr(null);
    try { const { url } = await meApi.connectUrl(); window.location.href = url; } catch (e) { setErr(e.message); setBusy(null); }
  };
  const paste = async () => {
    setBusy('token'); setErr(null);
    try { setSt(await meApi.connectToken(token.trim())); setToken(''); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  const disconnect = async () => {
    if (!window.confirm('Disconnect your Monday? Briefs, tickets, scheduling and comments you send will be done by CP’s account instead.')) return;
    setBusy('off');
    try { await meApi.disconnect(); setSt(s => ({ ...s, connected: false, name: null })); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };
  const go = () => nav(isGrowth ? '/creative-studio' : '/studio');
  const skip = () => { try { localStorage.setItem(SKIP_KEY, '1'); } catch { /* ignore */ } go(); };

  return (
    <div className="min-h-[calc(100vh-120px)] flex items-center justify-center p-4">
      <div className="w-full max-w-[640px] rounded-[28px] overflow-hidden shadow-xl border border-gray-200 bg-white">
        <div className="px-8 pt-8 pb-7 text-white" style={{ background: 'radial-gradient(120% 140% at 100% 0%, #0808f8 0%, #0b1a6b 45%, #030b2e 100%)' }}>
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/60">Welcome{user?.name ? `, ${first(user.name)}` : ''}</div>
          <h1 className="mt-3 font-black uppercase leading-[0.92] text-[44px] sm:text-[54px]" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif' }}>
            Let’s start by connecting your Monday
          </h1>
          <p className="mt-3 text-[15px] text-white/75 leading-relaxed">Then what you do from here — briefs, tickets{isGrowth ? '' : ', scheduling, assigning and comments in the Studio'} — lands on Monday <b className="text-white">as you</b>: your name on it, your notifications, your activity.</p>
        </div>

        <div className="px-8 py-7">
          {!st ? (
            <div className="py-6 text-center text-gray-400"><Loader2 className="inline animate-spin" /></div>
          ) : st.connected ? (
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 border border-emerald-200 px-4 py-3.5">
                <span className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center flex-none"><Check size={18} /></span>
                <div className="min-w-0">
                  <div className="font-semibold text-emerald-900">Connected as {st.name || 'you'}</div>
                  <div className="text-xs text-emerald-800/70">{st.email ? `${st.email} · ` : ''}{st.account ? `${st.account}.monday.com` : ''}</div>
                </div>
                <button type="button" onClick={disconnect} disabled={busy === 'off'} className="ml-auto text-xs font-semibold text-emerald-800/70 hover:text-red-600 flex items-center gap-1"><Unplug size={13} /> Disconnect</button>
              </div>
              <button type="button" onClick={go} className="flex items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-white font-semibold" style={{ background: '#0808f8' }}>
                {isGrowth ? 'Go to the Creative Studio' : 'Back to the Studio'} <ArrowRight size={17} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {st.oauth && (
                <button type="button" onClick={oneClick} disabled={!!busy} className="flex items-center justify-center gap-2.5 rounded-2xl px-5 py-4 text-white font-semibold text-[16px] disabled:opacity-60" style={{ background: '#0808f8' }}>
                  {busy === 'oauth' ? <Loader2 size={18} className="animate-spin" /> : <MondayMark />} Connect Monday
                </button>
              )}
              <div className="rounded-2xl border border-gray-200">
                <button type="button" onClick={() => setShowToken(v => !v)} className="w-full flex items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-gray-700">
                  <KeyRound size={15} className="text-gray-400" /> {st.oauth ? 'Or paste your personal Monday token' : 'Paste your personal Monday token'}
                  <span className="ml-auto text-gray-400">{showToken ? <ChevronUp size={16} /> : <ChevronDown size={16} />}</span>
                </button>
                {showToken && (
                  <div className="px-4 pb-4 flex flex-col gap-3">
                    <ol className="text-[13px] text-gray-600 leading-relaxed list-decimal pl-5">
                      <li>Open <a className="font-semibold text-[#0808f8] underline" href={`https://${st.account_slug || 'particle-for-men'}.monday.com/apps/manage/tokens`} target="_blank" rel="noopener noreferrer">your Monday tokens page</a> (or Monday → your picture → <b>Developers</b> → <b>My access tokens</b>).</li>
                      <li>Click <b>Show</b>, then <b>Copy</b> next to “Personal API token”.</li>
                      <li>Paste it here. It’s locked away on the server — nobody, including you, can see it again.</li>
                    </ol>
                    <div className="flex gap-2">
                      <input type="password" value={token} onChange={e => setToken(e.target.value)} placeholder="Paste your Monday token" autoComplete="off"
                        className="flex-1 min-w-0 text-sm px-3 py-2.5 rounded-xl border border-gray-200 focus:border-[#0808f8] outline-none" onKeyDown={e => { if (e.key === 'Enter' && token.trim()) paste(); }} />
                      <button type="button" onClick={paste} disabled={!token.trim() || !!busy} className="px-4 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-40" style={{ background: '#030b2e' }}>
                        {busy === 'token' ? <Loader2 size={15} className="animate-spin" /> : 'Connect'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <button type="button" onClick={skip} className="self-center text-xs font-semibold text-gray-400 hover:text-gray-700">Skip for now — CP’s account will create what you send, with your name in it</button>
            </div>
          )}
          {err && <div className="mt-4 flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded-xl px-3 py-2.5"><AlertTriangle size={15} className="mt-0.5 flex-none" /> {err}</div>}
        </div>
      </div>
    </div>
  );
}

function MondayMark() {
  return (
    <svg width="22" height="14" viewBox="0 0 44 28" aria-hidden="true">
      <circle cx="38" cy="22" r="5" fill="#00ca72" />
      <rect x="21" y="2" width="9" height="26" rx="4.5" transform="rotate(30 25.5 15)" fill="#ffcc00" />
      <rect x="5" y="2" width="9" height="26" rx="4.5" transform="rotate(30 9.5 15)" fill="#fb275d" />
    </svg>
  );
}

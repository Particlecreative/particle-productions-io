// Studio passwords (Tomer, 25 Nov 2026): the Access Passwords board, live from Monday — read, edit and add logins in CP.
// Passwords stay hidden until Reveal (they hide again after 20 s) or Copy (copied without showing); each one is logged.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { KeyRound, Search, Plus, Copy, Eye, EyeOff, ExternalLink, Pencil, Check, X, Loader2, History, RefreshCw, CalendarClock, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { passwordsApi } from '../../lib/passwordsService';
import { useLive } from '../../lib/useLive';

const DISPLAY = { fontFamily: '"Sofia Sans Extra Condensed", sans-serif' };
const PALETTE = ['#0808f8', '#00a9a5', '#e2445c', '#fdab3d', '#a25ddc', '#00c875', '#ff7a1a', '#579bfc'];
const tint = (name) => PALETTE[[...String(name)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % PALETTE.length];
const domainOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return ''; } };
const money = (n) => (n == null ? '' : `$${Number(n).toLocaleString('en-US')}`);

function Avatar({ name, size = 40 }) {
  const c = tint(name);
  return (
    <span className="flex items-center justify-center rounded-2xl font-black text-white flex-none uppercase" style={{ width: size, height: size, background: `linear-gradient(135deg, ${c}, ${c}cc)`, fontSize: size * 0.42 }}>
      {String(name).replace(/[^a-z0-9]/gi, '').slice(0, 1) || '•'}
    </span>
  );
}

function CopyBtn({ onCopy, label = 'Copy', small }) {
  const [state, setState] = useState(null);
  const go = async (e) => {
    e.stopPropagation();
    setState('busy');
    try { await onCopy(); setState('ok'); } catch { setState('err'); }
    setTimeout(() => setState(null), 1600);
  };
  return (
    <button type="button" onClick={go} title={label} className={`flex items-center gap-1 rounded-lg font-semibold transition-colors ${small ? 'text-[11px] px-1.5 py-1' : 'text-[11.5px] px-2 py-1'} ${state === 'ok' ? 'text-emerald-600 bg-emerald-50' : 'text-gray-500 hover:text-[#030b2e] hover:bg-gray-100'}`}>
      {state === 'busy' ? <Loader2 size={12} className="animate-spin" /> : state === 'ok' ? <Check size={12} /> : <Copy size={12} />}{state === 'ok' ? 'Copied' : state === 'err' ? 'Failed' : label}
    </button>
  );
}

function SecretRow({ row, board }) {
  const [shown, setShown] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!shown) return undefined; const t = setTimeout(() => setShown(null), 20000); return () => clearTimeout(t); }, [shown]);
  if (!row.has_password) return <div className="text-[12px] text-gray-400 italic">No password saved</div>;
  const reveal = async () => {
    if (shown) { setShown(null); return; }
    setBusy(true);
    try { setShown((await passwordsApi.reveal(board, row.id, 'reveal')).password); } finally { setBusy(false); }
  };
  const copy = async () => { const { password } = await passwordsApi.reveal(board, row.id, 'copy'); await navigator.clipboard.writeText(password); };
  return (
    <div className="flex items-center gap-1 min-w-0">
      <span className={`flex-1 min-w-0 truncate font-mono text-[13px] ${shown ? 'text-[#030b2e] dark:text-gray-100' : 'text-gray-400 tracking-[0.2em]'}`}>{shown || '••••••••••'}</span>
      <button type="button" onClick={reveal} title={shown ? 'Hide' : 'Show for 20 seconds'} className="p-1.5 rounded-lg text-gray-500 hover:text-[#030b2e] hover:bg-gray-100">
        {busy ? <Loader2 size={13} className="animate-spin" /> : shown ? <EyeOff size={13} /> : <Eye size={13} />}
      </button>
      <CopyBtn onCopy={copy} small />
    </div>
  );
}

function LoginCard({ row, board, people, flagTitle, money: showMoney, onEdit }) {
  const owners = (row.people || []).map(id => people[id]).filter(Boolean);
  const host = domainOf(row.link);
  return (
    <div className="group rounded-2xl border border-gray-200 bg-white p-4 flex flex-col gap-3 hover:border-[#0808f8]/30 hover:shadow-[0_10px_30px_-12px_rgba(3,11,46,.25)] transition-all">
      <div className="flex items-start gap-3">
        <Avatar name={row.name} />
        <div className="min-w-0 flex-1">
          <div className="font-bold text-[15px] text-[#030b2e] truncate">{row.name}</div>
          {host ? <a href={row.link} target="_blank" rel="noopener noreferrer" className="text-[12px] text-[#0808f8] hover:underline inline-flex items-center gap-1 max-w-full"><span className="truncate">{host}</span><ExternalLink size={11} className="flex-none" /></a>
            : <span className="text-[12px] text-gray-400">No link</span>}
        </div>
        <button type="button" onClick={() => onEdit(row)} title="Edit" className="p-1.5 rounded-lg text-gray-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-[#030b2e] hover:bg-gray-100 transition-opacity"><Pencil size={14} /></button>
      </div>
      <div className="rounded-xl bg-gray-50 px-3 py-2 flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 w-[66px] flex-none">Login</span>
          <span className="flex-1 min-w-0 truncate text-[13px] text-[#030b2e] dark:text-gray-100">{row.login || <span className="text-gray-400 italic">—</span>}</span>
          {row.login && <CopyBtn onCopy={() => navigator.clipboard.writeText(row.login)} small />}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-gray-400 w-[66px] flex-none">Password</span>
          <div className="flex-1 min-w-0"><SecretRow row={row} board={board} /></div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap text-[11.5px] text-gray-500 mt-auto">
        {row.renewal && <span className="inline-flex items-center gap-1"><CalendarClock size={12} /> Renews {row.renewal}</span>}
        {showMoney && row.monthly ? <span className="font-semibold text-gray-600">{money(row.monthly)}/mo</span> : null}
        {showMoney && row.credits ? <span>{Number(row.credits).toLocaleString('en-US')} credits</span> : null}
        {row.flag && <span className="inline-flex items-center gap-1 text-emerald-700"><ShieldCheck size={12} /> {flagTitle}</span>}
        <span className="ml-auto flex -space-x-1.5">
          {owners.slice(0, 3).map(p => <span key={p.id} title={p.name} className="w-6 h-6 rounded-full ring-2 ring-white dark:ring-[#1c2028] bg-gray-200 overflow-hidden flex items-center justify-center text-[9px] font-bold text-gray-600">{p.photo ? <img src={p.photo} alt="" className="w-full h-full object-cover" /> : p.name.split(' ').map(x => x[0]).join('').slice(0, 2)}</span>)}
        </span>
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}
const inputCls = 'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-[13.5px] text-[#030b2e] dark:text-gray-100 outline-none focus:border-[#0808f8] focus:ring-2 focus:ring-[#0808f8]/15';

function Editor({ row, groups, board, flagTitle, money: showMoney, onClose, onSaved }) {
  const isNew = !row?.id;
  const [f, setF] = useState(() => ({ name: row?.name || '', group: row?.group || groups[0]?.id || '', link: row?.link || '', login: row?.login || '', password: '', renewal: row?.renewal || '', flag: !!row?.flag, credits: row?.credits ?? '', monthly: row?.monthly ?? '' }));
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF(x => ({ ...x, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const body = {};
      for (const k of ['name', 'link', 'login', 'renewal', 'flag']) if (isNew || f[k] !== (row?.[k] ?? (k === 'flag' ? false : ''))) body[k] = f[k];
      if (f.password) body.password = f.password;
      if (showMoney) for (const k of ['credits', 'monthly']) if (isNew ? f[k] !== '' : String(f[k] ?? '') !== String(row?.[k] ?? '')) body[k] = f[k];
      if (isNew) { body.group = f.group; await passwordsApi.create(board, body); }
      else if (Object.keys(body).length) await passwordsApi.update(board, row.id, body);
      onSaved(isNew ? 'Added — it’s on Monday too' : 'Saved on Monday');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-6" onClick={onClose}>
      <div className="w-full sm:max-w-[520px] bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 pt-5 pb-3 border-b border-gray-100">
          <Avatar name={f.name || '+'} size={34} />
          <div className="flex-1 min-w-0">
            <div className="font-bold text-[16px] text-[#030b2e] truncate">{isNew ? 'Add a login' : `Edit ${row.name}`}</div>
            <div className="text-[11.5px] text-gray-400">Saved straight to the Monday board</div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:text-gray-700 hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="px-6 py-5 grid gap-4">
          <Field label="Service"><input value={f.name} onChange={set('name')} className={inputCls} placeholder="e.g. Artlist" autoFocus={isNew} /></Field>
          {isNew && (
            <Field label="Section">
              <div className="flex flex-wrap gap-1.5">
                {groups.map(g => <button key={g.id} type="button" onClick={() => set('group')(g.id)} className={`text-[12px] font-semibold px-2.5 py-1 rounded-lg border ${f.group === g.id ? 'border-[#0808f8] text-[#0808f8] bg-[#0808f8]/5' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{g.title}</button>)}
              </div>
            </Field>
          )}
          <Field label="Link"><input value={f.link} onChange={set('link')} className={inputCls} placeholder="https://" /></Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Login"><input value={f.login} onChange={set('login')} className={inputCls} autoComplete="off" /></Field>
            <Field label={isNew ? 'Password' : 'New password'} hint={isNew ? null : 'Leave empty to keep the current one'}>
              <div className="relative">
                <input value={f.password} onChange={set('password')} type={showPw ? 'text' : 'password'} className={`${inputCls} pr-9 font-mono`} autoComplete="new-password" />
                <button type="button" onClick={() => setShowPw(x => !x)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-700">{showPw ? <EyeOff size={14} /> : <Eye size={14} />}</button>
              </div>
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Renewal day"><input value={f.renewal} onChange={set('renewal')} className={inputCls} placeholder="e.g. 12th" /></Field>
            <label className="flex items-center gap-2 mt-5 text-[13px] text-gray-700 cursor-pointer"><input type="checkbox" checked={f.flag} onChange={set('flag')} className="w-4 h-4 accent-[#0808f8]" /> {flagTitle}</label>
          </div>
          {showMoney && (
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="$ / month"><input value={f.monthly} onChange={set('monthly')} inputMode="decimal" className={inputCls} /></Field>
              <Field label="Credits"><input value={f.credits} onChange={set('credits')} inputMode="numeric" className={inputCls} /></Field>
            </div>
          )}
          {err && <div className="text-[12.5px] text-red-600 flex items-center gap-1.5"><AlertTriangle size={14} /> {err}</div>}
        </div>
        <div className="px-6 pb-6 flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} className="text-[13px] font-semibold px-4 py-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button type="button" disabled={busy || !f.name.trim()} onClick={save} className="text-[13px] font-semibold px-4 py-2 rounded-xl text-white bg-[#0808f8] hover:bg-[#0606d0] disabled:opacity-50 flex items-center gap-1.5">{busy && <Loader2 size={14} className="animate-spin" />}{isNew ? 'Add login' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function HistoryModal({ onClose }) {
  const [rows, setRows] = useState(null);
  useEffect(() => { passwordsApi.history().then(r => setRows(r.history || [])).catch(() => setRows([])); }, []);
  const VERB = { reveal: 'revealed', copy: 'copied', edit: 'edited', add: 'added' };
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-[560px] bg-white rounded-3xl shadow-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-6 py-4 border-b border-gray-100"><History size={16} className="text-[#0808f8]" /><div className="font-bold text-[#030b2e] flex-1">Who opened what</div><button type="button" onClick={onClose} className="p-2 rounded-xl text-gray-400 hover:bg-gray-100"><X size={16} /></button></div>
        <div className="overflow-y-auto px-3 py-2">
          {!rows ? <div className="py-10 text-center text-gray-400"><Loader2 className="animate-spin inline" /></div>
            : !rows.length ? <div className="py-10 text-center text-sm text-gray-400">Nothing yet.</div>
              : rows.map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-gray-50 text-[13px]">
                  <span className="text-gray-400 text-[11.5px] w-[92px] flex-none">{new Date(r.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  <span className="min-w-0 flex-1 truncate"><b className="text-[#030b2e]">{r.user_name || 'Someone'}</b> <span className="text-gray-500">{VERB[r.action] || r.action}</span> <b className="text-[#030b2e]">{r.item_name}</b>{r.fields?.length && r.action === 'edit' ? <span className="text-gray-400"> · {r.fields.join(', ')}</span> : null}</span>
                  <span className="text-[10.5px] font-bold uppercase text-gray-400">{r.board}</span>
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}

export default function Passwords() {
  const { isAdmin } = useAuth();
  const [board, setBoard] = useState(() => { try { return localStorage.getItem('cp_pw_board') || 'particle'; } catch { return 'particle'; } });
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  const [group, setGroup] = useState('all');
  const [edit, setEdit] = useState(null);
  const [hist, setHist] = useState(false);
  const [toast, setToast] = useState(null);
  const load = useCallback(async (force = false) => {
    try { setData(await passwordsApi.list(board, force)); setErr(null); } catch (e) { setErr(e.message); }
  }, [board]);
  useEffect(() => { setData(null); load(); try { localStorage.setItem('cp_pw_board', board); } catch { /* ignore */ } }, [board, load]);
  useLive(() => load(), { every: 60000 });
  useEffect(() => { if (!toast) return undefined; const t = setTimeout(() => setToast(null), 3000); return () => clearTimeout(t); }, [toast]);

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (data?.rows || []).filter(r => (group === 'all' || r.group === group) && (!needle || `${r.name} ${r.login} ${domainOf(r.link)}`.toLowerCase().includes(needle)));
  }, [data, q, group]);
  const groups = data?.groups || [];
  const byGroup = useMemo(() => groups.map(g => ({ ...g, rows: rows.filter(r => r.group === g.id) })).filter(g => g.rows.length), [groups, rows]);
  const monthly = useMemo(() => (data?.money ? (data.rows || []).reduce((a, r) => a + (Number(r.monthly) || 0), 0) : 0), [data]);

  return (
    <div className="max-w-[1500px] mx-auto pb-16">
      <div className="flex flex-wrap items-end gap-3 mb-5">
        <div className="min-w-0 flex-1 basis-[260px]">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#0808f8] flex items-center gap-1.5"><KeyRound size={12} /> Studio passwords</div>
          <h1 className="font-black uppercase leading-none text-[34px] sm:text-[48px] mt-1 text-[#030b2e]" style={DISPLAY}>The studio’s logins</h1>
          <p className="text-sm text-gray-500 mt-1.5">Live from the Access Passwords board on Monday — change it here or there. Passwords stay hidden until you reveal or copy one.</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && <button type="button" onClick={() => setHist(true)} className="flex items-center gap-1.5 text-[13px] font-semibold px-3 py-2 rounded-xl border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"><History size={14} /> Who opened what</button>}
          <button type="button" onClick={() => load(true)} title="Refresh from Monday" className="p-2 rounded-xl border border-gray-200 bg-white text-gray-500 hover:text-gray-800"><RefreshCw size={15} /></button>
          <button type="button" onClick={() => setEdit({})} className="flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-xl text-white bg-[#0808f8] hover:bg-[#0606d0]"><Plus size={15} /> Add login</button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="flex rounded-xl border border-gray-200 bg-white p-0.5">
          {(data?.boards || [{ key: 'particle', name: 'Particle' }, { key: 'blurr', name: 'Blurr' }]).map(b => (
            <button key={b.key} type="button" onClick={() => setBoard(b.key)} className={`text-[13px] font-semibold px-3 py-1.5 rounded-lg ${board === b.key ? 'bg-[#030b2e] text-white' : 'text-gray-500 hover:text-gray-800'}`}>{b.name}</button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[200px] max-w-[360px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a service or login…" className="w-full rounded-xl border border-gray-200 bg-white pl-9 pr-3 py-2 text-[13.5px] outline-none focus:border-[#0808f8]" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[{ id: 'all', title: 'All' }, ...groups].map(g => (
            <button key={g.id} type="button" onClick={() => setGroup(g.id)} className={`text-[12px] font-semibold px-2.5 py-1.5 rounded-lg border ${group === g.id ? 'border-[#0808f8] text-[#0808f8] bg-[#0808f8]/5' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>{g.title}</button>
          ))}
        </div>
        {data?.money && monthly > 0 && <span className="ml-auto text-[12px] text-gray-500">Subscriptions on this board: <b className="text-[#030b2e]">{money(monthly)}/mo</b></span>}
      </div>

      {err && <div className="mb-4 px-4 py-3 rounded-2xl bg-red-50 text-red-700 text-sm flex items-center gap-2"><AlertTriangle size={16} /> {err}</div>}
      {!data && !err && <div className="py-24 text-center text-gray-400"><Loader2 className="animate-spin inline" /></div>}
      {data && !rows.length && <div className="py-20 text-center text-sm text-gray-400">{q ? 'Nothing matches that.' : 'No logins on this board yet.'}</div>}

      {byGroup.map(g => (
        <section key={g.id} className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: g.color || '#c4c4c4' }} />
            <h2 className="font-black uppercase text-[20px] leading-none text-[#030b2e]" style={DISPLAY}>{g.title}</h2>
            <span className="text-[12px] text-gray-400">{g.rows.length}</span>
          </div>
          <div className="grid gap-3 grid-cols-[repeat(auto-fill,minmax(290px,1fr))]">
            {g.rows.map(r => <LoginCard key={r.id} row={r} board={board} people={data.people || {}} flagTitle={data.flag_title} money={data.money} onEdit={setEdit} />)}
          </div>
        </section>
      ))}

      {edit && <Editor row={edit.id ? edit : null} groups={groups} board={board} flagTitle={data?.flag_title || 'Done'} money={!!data?.money} onClose={() => setEdit(null)} onSaved={(m) => { setEdit(null); setToast(m); load(true); }} />}
      {hist && <HistoryModal onClose={() => setHist(false)} />}
      {toast && <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] px-4 py-2.5 rounded-xl bg-[#030b2e] text-white text-[13px] font-semibold shadow-xl flex items-center gap-2"><Check size={14} /> {toast}</div>}
    </div>
  );
}

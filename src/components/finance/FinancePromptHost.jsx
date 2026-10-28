import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Lock, Sparkles, Loader2, X, CalendarClock, CheckCircle2 } from 'lucide-react';
import { setFinancePrompt, apiGet } from '../../lib/apiClient';
import { financeApi, REASONS, usd, dayLabel } from '../../lib/financeService';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

/**
 * One prompt for every finance rule the server enforces — mounted once in the app shell.
 * When a save comes back "this needs a reason" (409), this asks, and the save is sent again with the answers.
 */
export default function FinancePromptHost() {
  const [current, setCurrent] = useState(null); // { payload, sig, resolvers: [] }
  const queue = useRef([]);
  const currentRef = useRef(null);

  useEffect(() => {
    setFinancePrompt((payload, meta = {}) => new Promise((resolve) => {
      // The same save sent twice (Enter, then blur) asks once — both get the same answer
      const sig = `${meta.method} ${meta.path} ${payload.code} ${JSON.stringify(payload.impact || payload.to || payload.kind || '')}`;
      const same = [currentRef.current, ...queue.current].find(it => it && it.sig === sig);
      if (same) { same.resolvers.push(resolve); return; }
      const item = { payload, sig, resolvers: [resolve] };
      if (currentRef.current) queue.current.push(item);
      else { currentRef.current = item; setCurrent(item); }
    }));
    return () => setFinancePrompt(null);
  }, []);

  function close(answer) {
    currentRef.current?.resolvers.forEach(r => r(answer));
    const next = queue.current.shift() || null;
    currentRef.current = next;
    setCurrent(next);
  }

  if (!current) return null;
  const p = current.payload;
  if (p.code === 'locked' || p.code === 'dates_from_lines') return <InfoDialog payload={p} onClose={() => close(null)} />;
  if (p.code === 'reason_required') return <ReasonDialog key={current.sig} payload={p} onDone={close} />;
  return <FlowDialog key={current.sig} payload={p} onDone={close} />;
}

function Shell({ icon: Icon, tone = 'blue', title, subtitle, children, onClose }) {
  const tones = { blue: 'bg-blue-50 text-blue-600', amber: 'bg-amber-50 text-amber-600', red: 'bg-red-50 text-red-600', gray: 'bg-gray-100 text-gray-500' };
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="px-6 pt-5 pb-3 flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tones[tone]}`}><Icon size={19} /></div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-gray-900 text-[17px] leading-snug">{title}</h3>
            {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100" aria-label="Close"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function InfoDialog({ payload, onClose }) {
  return (
    <Shell icon={payload.code === 'locked' ? Lock : CalendarClock} tone="gray" title={payload.code === 'locked' ? 'This production is closed' : 'Dates come from the budget lines'} onClose={onClose}>
      <div className="px-6 pb-5">
        <p className="text-sm text-gray-600">{payload.error}</p>
        <div className="mt-4 flex justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--brand-accent)' }}>OK</button>
        </div>
      </div>
    </Shell>
  );
}

const field = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-blue-400 bg-white';
const label = 'block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1';

function ReasonDialog({ payload, onDone }) {
  const imp = payload.impact || {};
  const mode = payload.mode;
  const over = mode === 'over_planned';
  const plannedChange = mode === 'planned_change';
  const needApprover = over || plannedChange || payload.need_approver;
  const [approvers, setApprovers] = useState([]);
  const [f, setF] = useState({ reason: '', approved_by: '', other: '', approved_at: today(), note: '', link: '', new_planned: over ? Math.ceil((imp.coreAfter || 0) / 100) * 100 : '' });
  const [quick, setQuick] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { apiGet('/finance/approvers').then(r => setApprovers(r?.approvers || [])).catch(() => {}); }, []);
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const approvedBy = f.approved_by === '__other' ? f.other.trim() : f.approved_by;

  async function fillWithClaude() {
    if (!quick.trim()) return;
    setBusy(true); setErr('');
    try {
      const r = await financeApi.quickNote(quick, { production: payload.production, line: payload.line, change: imp });
      setF(x => ({
        ...x,
        reason: r.reason || x.reason,
        approved_by: r.approved_by ? (approvers.includes(r.approved_by) ? r.approved_by : '__other') : x.approved_by,
        other: r.approved_by && !approvers.includes(r.approved_by) ? r.approved_by : x.other,
        approved_at: r.approved_at || x.approved_at,
        note: r.note || x.note,
        link: r.link || x.link,
        new_planned: over && r.new_planned ? r.new_planned : x.new_planned,
      }));
    } catch (e) { setErr(e.message || 'Claude couldn’t read that'); }
    setBusy(false);
  }

  const valid = f.reason && (!needApprover || approvedBy) && (!over || Number(f.new_planned) >= (imp.coreAfter || 0) - 0.5);
  function submit() {
    if (!valid) return;
    onDone({
      reason: f.reason, approved_by: approvedBy || null, approved_at: f.approved_at || null,
      note: f.note.trim() || null, link: f.link.trim() || null,
      ...(over ? { new_planned: Number(f.new_planned) } : {}),
    });
  }

  const title = over ? 'This goes over the approved budget' : plannedChange ? 'Change the approved Planned Budget' : 'The budget is approved — what changed?';
  const subtitle = `${payload.production || ''}${payload.line ? ` · ${payload.line}` : ''}`;
  return (
    <Shell icon={over ? AlertTriangle : CheckCircle2} tone={over ? 'red' : 'blue'} title={title} subtitle={subtitle} onClose={() => onDone(null)}>
      <div className="px-6 pb-5 space-y-3 max-h-[70vh] overflow-y-auto">
        {over && (
          <div className="rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-800">
            Planned <b>{usd(imp.planned)}</b> · lines would be <b>{usd(imp.coreAfter)}</b> — over by <b>{usd(imp.overBy)}</b>.
            <div className="text-xs mt-1 text-red-700">It needs who approved it (Ayal). Finance gets an email with the new budget.</div>
          </div>
        )}
        {mode === 'in_buffer' && (
          <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3 text-sm text-blue-900">
            {imp.delta >= 0 ? 'Uses' : 'Gives back'} <b>{usd(Math.abs(imp.delta))}</b> of the 10% unexpected — <b>{usd(imp.leftAfter)}</b> left after this.
            <div className="text-xs mt-1 text-blue-700">Planned stays {usd(imp.planned)}. No email to finance — it goes in the weekly summary.</div>
          </div>
        )}
        {plannedChange && (
          <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3 text-sm text-amber-900">
            {usd(imp.planned)} → <b>{usd(imp.newPlanned)}</b>. Finance gets an email.
          </div>
        )}

        <div className="rounded-xl border border-dashed border-gray-200 p-3">
          <div className="flex items-center gap-2 mb-1.5">
            <Sparkles size={13} className="text-violet-500" />
            <span className="text-xs font-semibold text-gray-600">Quick note — paste or dictate what was decided</span>
          </div>
          <textarea value={quick} onChange={e => setQuick(e.target.value)} rows={2} className={field} placeholder="e.g. Ayal approved a 60s version in today’s screening, +$4K for the edit" />
          <div className="flex justify-end mt-1.5">
            <button type="button" onClick={fillWithClaude} disabled={!quick.trim() || busy}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-violet-600 text-white disabled:opacity-40 flex items-center gap-1.5">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} Fill in with Claude
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Reason *</label>
            <select value={f.reason} onChange={e => set('reason', e.target.value)} className={field}>
              <option value="">Choose…</option>
              {REASONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Approved by{needApprover ? ' *' : ''}</label>
            <select value={f.approved_by} onChange={e => set('approved_by', e.target.value)} className={field}>
              <option value="">{needApprover ? 'Choose…' : '—'}</option>
              {approvers.map(a => <option key={a} value={a}>{a}</option>)}
              <option value="__other">Someone else…</option>
            </select>
            {f.approved_by === '__other' && <input value={f.other} onChange={e => set('other', e.target.value)} className={`${field} mt-1.5`} placeholder="Name" />}
          </div>
          <div>
            <label className={label}>Decided on</label>
            <input type="date" value={f.approved_at} onChange={e => set('approved_at', e.target.value)} className={field} />
          </div>
          {over ? (
            <div>
              <label className={label}>New Planned Budget (USD)</label>
              <input type="number" min={Math.ceil(imp.coreAfter || 0)} value={f.new_planned} onChange={e => set('new_planned', e.target.value)} className={field} />
            </div>
          ) : (
            <div>
              <label className={label}>Link (optional)</label>
              <input value={f.link} onChange={e => set('link', e.target.value)} className={field} placeholder="https://…" />
            </div>
          )}
        </div>
        <div>
          <label className={label}>Note</label>
          <textarea value={f.note} onChange={e => set('note', e.target.value)} rows={2} className={field} placeholder="What was decided, in a line — finance reads this" />
        </div>
        {err && <div className="text-xs text-red-600">{err}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={() => onDone(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200">Cancel</button>
          <button type="button" onClick={submit} disabled={!valid} className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ background: over ? '#dc2626' : 'var(--brand-accent)' }}>
            {over ? 'Save & tell finance' : 'Save'}
          </button>
        </div>
      </div>
    </Shell>
  );
}

function FlowDialog({ payload, onDone }) {
  const [note, setNote] = useState('');
  const [work, setWork] = useState(null);
  const askWork = !!payload.ask_work;
  const copy = useMemo(() => {
    const name = payload.production || 'this production';
    switch (payload.code) {
      case 'postpone_required': return {
        icon: CalendarClock, tone: 'amber', title: `Postponing ${name}?`,
        sub: `${dayLabel(payload.from?.start)} → ${dayLabel(payload.from?.end)}  ⟶  ${dayLabel(payload.to?.start)} → ${dayLabel(payload.to?.end)}`,
        q: 'Why is it moving?', btn: 'Postpone & tell finance',
      };
      case 'stage_prompt':
        if (payload.kind === 'completed') return { icon: CheckCircle2, tone: 'blue', title: `Mark ${name} Completed`, sub: 'Finance gets an email so they can plan the last payments.', q: 'Anything finance should know?', btn: 'Complete & tell finance' };
        if (payload.kind === 'paused') return { icon: CalendarClock, tone: 'amber', title: `Pause ${name}?`, sub: 'Finance gets an email.', q: 'Why is it paused?', btn: 'Pause & tell finance' };
        return { icon: AlertTriangle, tone: 'red', title: `Reopen ${name}?`, sub: 'Finance gets an urgent email straight away.', q: 'Why is it reopening?', btn: 'Reopen' };
      case 'unlock_reason': return { icon: Lock, tone: 'red', title: `Reopen ${name}?`, sub: 'It’s closed — finance gets an urgent email straight away.', q: 'Why is it reopening?', btn: 'Reopen' };
      case 'unapprove_reason': return { icon: AlertTriangle, tone: 'red', title: 'Remove the budget approval?', sub: 'Planned follows the lines again. Finance is told.', q: 'Why?', btn: 'Remove approval' };
      default: return { icon: AlertTriangle, tone: 'gray', title: payload.error || 'Finance needs a note', q: 'Note', btn: 'Save' };
    }
  }, [payload]);
  const valid = note.trim() && (!askWork || work !== null);
  return (
    <Shell icon={copy.icon} tone={copy.tone} title={copy.title} subtitle={copy.sub} onClose={() => onDone(null)}>
      <div className="px-6 pb-5 space-y-3">
        <div>
          <label className={label}>{copy.q} *</label>
          <textarea autoFocus value={note} onChange={e => setNote(e.target.value)} rows={3} className={field} />
        </div>
        {askWork && (
          <div>
            <label className={label}>Did any work or cost happen this month? *</label>
            <div className="flex gap-2">
              {[[true, 'Yes'], [false, 'No']].map(([v, l]) => (
                <button key={l} type="button" onClick={() => setWork(v)}
                  className={`flex-1 py-2 rounded-lg text-sm font-semibold border ${work === v ? 'text-white border-transparent' : 'text-gray-600 border-gray-200 bg-white hover:bg-gray-50'}`}
                  style={work === v ? { background: 'var(--brand-accent)' } : undefined}>{l}</button>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-1">Finance uses this to decide whether this month needs an accrual.</p>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={() => onDone(null)} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200">Cancel</button>
          <button type="button" disabled={!valid} onClick={() => onDone({ note: note.trim(), work_this_month: askWork ? work : null })}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40" style={{ background: copy.tone === 'red' ? '#dc2626' : 'var(--brand-accent)' }}>{copy.btn}</button>
        </div>
      </div>
    </Shell>
  );
}

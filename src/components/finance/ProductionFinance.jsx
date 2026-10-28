import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BadgeCheck, Lock, Unlock, ShieldCheck, Loader2, CalendarClock, GitBranch, FileSpreadsheet, ExternalLink, AlertTriangle, X, Receipt } from 'lucide-react';
import { financeApi, usd, signedUsd, nativeMoney, dayLabel, dayYearLabel, monthLabel, companyOf, EVENT_LABEL, REASON_LABEL } from '../../lib/financeService';
import { lockProduction } from '../../lib/dataService';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });

/** Company + finance code chips (Particle / Blurr / Biomella are separate companies — always visible). */
export function CompanyChips({ fin }) {
  if (!fin) return null;
  const c = companyOf(fin.company?.id);
  return (
    <>
      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-black tracking-wider text-white" style={{ background: c.color }} title={fin.company_line}>
        {c.short.toUpperCase()}
      </span>
      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-[11px] font-bold border border-gray-200 text-gray-600 bg-white" title="Finance code (Priority)">
        {fin.code}
      </span>
      {fin.parent_id && (
        <Link to={`/production/${encodeURIComponent(fin.parent_id)}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-violet-50 text-violet-700 hover:bg-violet-100">
          <GitBranch size={11} /> Re-edit of {fin.parent_id}
        </Link>
      )}
      {(fin.children || []).map(k => (
        <Link key={k.id} to={`/production/${encodeURIComponent(k.id)}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-violet-50 text-violet-700 hover:bg-violet-100">
          <GitBranch size={11} /> {k.id}
        </Link>
      ))}
    </>
  );
}

/** Closed / open (the production lock) with the admin's Close / Reopen button. */
export function LockControl({ production, isAdmin, onChanged }) {
  const [busy, setBusy] = useState(false);
  const locked = !!production?.locked;
  async function toggle() {
    if (!locked && !window.confirm('Close this production? Its budget lines freeze (payments stay open) and finance gets a “production closed” email.')) return;
    setBusy(true);
    try { await lockProduction(production.id, !locked); onChanged?.(); } catch (e) { alert(e.message); }
    setBusy(false);
  }
  return (
    <div className="flex items-center gap-1.5">
      {locked && (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-1 rounded-full bg-gray-800 text-white" title={production.locked_by ? `Closed by ${production.locked_by}` : 'Closed'}>
          <Lock size={11} /> Closed
        </span>
      )}
      {isAdmin && (
        <button type="button" onClick={toggle} disabled={busy}
          className="inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          title={locked ? 'Reopen — finance gets an urgent email' : 'Close — budget freezes, finance is emailed'}>
          {busy ? <Loader2 size={11} className="animate-spin" /> : locked ? <Unlock size={11} /> : <Lock size={11} />} {locked ? 'Reopen' : 'Close'}
        </button>
      )}
    </div>
  );
}

/** The Planned Budget card: estimate + 10% before approval, frozen after, with how much unexpected is left. */
export function PlannedCard({ fin, fallback, fmt, isAdmin, onApprove }) {
  if (!fin) return fallback;
  const st = fin.state;
  if (!st.approved) {
    return (
      <div className="rounded-2xl px-4 py-3 border border-gray-100 bg-gray-50/80">
        <div className="flex items-center justify-between mb-1.5">
          <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Planned Budget</div>
          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">Not approved</span>
        </div>
        <div className="text-2xl font-black tracking-tight text-gray-800">{fmt(st.planned)}</div>
        <div className="text-[10px] text-gray-400 mt-1">{st.hasUnexpected ? "Estimate — 'unexpected' line included" : `Estimate + 10% unexpected (+${fmt(st.planned - st.core)})`}</div>
        {isAdmin && !fin.locked && (
          <button type="button" onClick={onApprove} className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-full text-white" style={{ background: 'var(--brand-accent)' }}>
            <BadgeCheck size={12} /> Approve budget
          </button>
        )}
      </div>
    );
  }
  const used = Math.min(100, st.usedPct);
  const tone = st.over > 0 ? '#dc2626' : used >= 80 ? '#f59e0b' : '#16a34a';
  return (
    <div className="rounded-2xl px-4 py-3 border border-emerald-100 bg-emerald-50/50">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider">Planned Budget</div>
        <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-600 text-white" title={`Approved by ${fin.approved_by} on ${dayYearLabel(fin.approved_at)}${fin.approved_user && fin.approved_user !== fin.approved_by ? ` (entered by ${fin.approved_user})` : ''}`}>
          <ShieldCheck size={10} /> Approved
        </span>
      </div>
      <div className="text-2xl font-black tracking-tight text-gray-800">{fmt(st.planned)}</div>
      <div className="mt-2">
        <div className="h-1.5 bg-white rounded-full overflow-hidden border border-emerald-100">
          <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(2, used)}%`, background: tone }} />
        </div>
        <div className="text-[10px] mt-1 font-semibold" style={{ color: st.over > 0 ? '#dc2626' : '#4b5563' }}>
          {st.over > 0 ? `Over by ${fmt(st.over)}` : `Unexpected left ${fmt(st.bufferLeft)} of ${fmt(st.bufferTotal)}`}
        </div>
        <div className="text-[10px] text-gray-400">{fin.approved_by} · {dayLabel(fin.approved_at)}</div>
      </div>
    </div>
  );
}

export function ApproveModal({ fin, production, onClose, onDone }) {
  const [approvers, setApprovers] = useState(fin?.approvers || []);
  const [by, setBy] = useState(fin?.approvers?.[0] || '');
  const [other, setOther] = useState('');
  const [date, setDate] = useState(today());
  const [note, setNote] = useState('');
  const [planned, setPlanned] = useState(Math.round(fin?.state?.planned || 0));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { if (!approvers.length) financeApi.production(production.id).then(f => { setApprovers(f.approvers || []); setBy((f.approvers || [])[0] || ''); }).catch(() => {}); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const who = by === '__other' ? other.trim() : by;
  async function submit() {
    setBusy(true); setErr('');
    try { await financeApi.approve(production.id, { approved_by: who, approved_at: date, note: note.trim() || null, planned: Number(planned) }); onDone(); }
    catch (e) { setErr(e.message?.replace(/^\{"error":"|"\}$/g, '') || 'Couldn’t approve'); }
    setBusy(false);
  }
  const plan = fin?.payment_plan || [];
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" onMouseDown={e => e.stopPropagation()}>
        <div className="px-6 pt-5 pb-2 flex items-start gap-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center bg-emerald-50 text-emerald-600 shrink-0"><BadgeCheck size={19} /></div>
          <div className="flex-1">
            <h3 className="font-bold text-gray-900 text-[17px]">Approve the budget</h3>
            <p className="text-sm text-gray-500">The Planned Budget freezes. From now on, changes need a reason, and anything over Planned needs approval. Finance gets an email.</p>
          </div>
          <button type="button" onClick={onClose} className="p-1 rounded-lg text-gray-400 hover:bg-gray-100"><X size={16} /></button>
        </div>
        <div className="px-6 pb-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Approved by *</label>
              <select value={by} onChange={e => setBy(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white">
                {approvers.map(a => <option key={a}>{a}</option>)}
                <option value="__other">Someone else…</option>
              </select>
              {by === '__other' && <input value={other} onChange={e => setOther(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-1.5" placeholder="Name" />}
            </div>
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Approved on</label>
              <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Planned Budget (USD)</label>
              <input type="number" value={planned} onChange={e => setPlanned(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              <p className="text-[11px] text-gray-400 mt-1">Lines {usd(fin?.state?.core)} + 10% unexpected. Bank of Israel rate ₪{fin?.totals?.rate?.rate}/$ ({dayLabel(fin?.totals?.rate?.date)}) is locked with the approval.</p>
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Note for finance (optional)</label>
              <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          {plan.length > 0 && (
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-1">Payments planned (net+30) — in the email</div>
              {plan.map(p => <div key={p.date} className="flex justify-between text-sm"><span>{dayYearLabel(p.date)}</span><span className="font-semibold">{usd(p.usd)}</span></div>)}
            </div>
          )}
          {err && <div className="text-sm text-red-600">{err}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-sm font-semibold text-gray-600 bg-gray-100">Cancel</button>
            <button type="button" onClick={submit} disabled={busy || !who || !(Number(planned) > 0)} className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-emerald-600 disabled:opacity-40 flex items-center gap-1.5">
              {busy && <Loader2 size={13} className="animate-spin" />} Approve & tell finance
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function eventChange(e) {
  const fmtNative = (v) => { if (!v) return '—'; const [a, c] = String(v).split(' '); return c ? nativeMoney(a, c) : v; };
  if (e.kind === 'budget_increase' || e.kind === 'budget_approved') return e.old_value ? `${usd(e.old_value)} → ${usd(e.new_value)}` : usd(e.new_value);
  if (e.kind === 'historical_change') return `${usd(e.old_value)} → ${usd(e.new_value)} (${monthLabel(e.expense_month)})`;
  if (['line_added', 'line_removed', 'amount_changed', 'currency_changed'].includes(e.kind)) return `${fmtNative(e.old_value)} → ${fmtNative(e.new_value)}`;
  if (e.kind === 'actual_changed') return `${e.old_value ?? '—'} → ${e.new_value ?? '—'}`;
  if (e.old_value != null || e.new_value != null) return `${e.old_value ?? '—'} → ${e.new_value ?? '—'}`;
  return '';
}

/** The Finance tab: approval, the decision log, payments planned, missing invoices, the finance sheet, shift dates, re-edits. */
export function FinanceTab({ production, fin, isAdmin, isEditor, onChanged }) {
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState('');
  const [onlyMoney, setOnlyMoney] = useState(true);
  if (!fin) return <div className="py-16 text-center text-gray-400 text-sm">Finance details aren’t available here.</div>;
  const MONEY = new Set(['budget_approved', 'budget_unapproved', 'budget_increase', 'line_added', 'line_removed', 'amount_changed', 'currency_changed', 'historical_change', 'postponed', 'completed', 'paused', 'reopened', 'locked', 'unlocked', 'rights_renewed', 'finance_confirmed', 'line_moved', 'sub_production', 'sync_conflict', 'invoice_flagged']);
  const events = (fin.events || []).filter(e => !onlyMoney || MONEY.has(e.kind));
  async function run(name, fn) { setBusy(name); try { await fn(); await onChanged?.(); } catch (e) { alert(e.message); } setBusy(''); }

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
      <div className="xl:col-span-2 brand-card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-800">Decision log</h3>
            <p className="text-xs text-gray-400">Every change to the money, who made it and why. Finance sees the same log.</p>
          </div>
          <label className="text-xs text-gray-500 flex items-center gap-1.5"><input type="checkbox" checked={onlyMoney} onChange={e => setOnlyMoney(e.target.checked)} /> Budget changes only</label>
        </div>
        {events.length === 0 ? (
          <div className="py-12 text-center text-sm text-gray-400">Nothing logged yet.</div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-[620px] overflow-y-auto">
            {events.map(e => (
              <div key={e.id} className="px-5 py-2.5 flex gap-3 text-sm">
                <div className="w-20 shrink-0 text-xs text-gray-400 pt-0.5">{dayLabel(e.created_at)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-800">{EVENT_LABEL[e.kind] || e.kind}</span>
                    {e.label && e.label !== production.project_name && <span className="text-gray-500 truncate">· {e.label}</span>}
                    {e.notify && <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${e.notified_at ? 'bg-blue-50 text-blue-600' : 'bg-gray-100 text-gray-500'}`}>{e.notified_at ? 'Finance emailed' : e.notify === 'bundle' ? 'Email in a few minutes' : 'Emailing…'}</span>}
                    {e.in_buffer && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700">inside the 10%</span>}
                  </div>
                  <div className="text-xs text-gray-600 mt-0.5">
                    {eventChange(e)}{e.delta_usd != null && Math.abs(Number(e.delta_usd)) >= 1 && !['budget_increase', 'historical_change'].includes(e.kind) ? ` · ${signedUsd(e.delta_usd)}` : ''}
                  </div>
                  {(e.reason || e.approved_by || e.note) && (
                    <div className="text-xs text-gray-500 mt-0.5">
                      {e.reason && <b>{REASON_LABEL[e.reason] || e.reason}</b>}{e.approved_by && ` · approved by ${e.approved_by}`}{e.note && ` · “${e.note}”`}
                      {e.meta?.work_this_month === true && ' · work this month'}{e.meta?.work_this_month === false && ' · no work this month'}
                    </div>
                  )}
                  <div className="text-[10px] text-gray-400 mt-0.5">{e.user_name || 'CP'}{e.source && e.source !== 'cp' ? ` · via ${e.source}` : ''}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div className="brand-card">
          <h3 className="font-bold text-gray-800 mb-2 flex items-center gap-2"><Receipt size={15} /> Totals</h3>
          {(fin.totals?.per_currency || []).map(c => (
            <div key={c.currency} className="flex justify-between text-sm"><span className="text-gray-500">Budget in {c.currency}</span><span className="font-semibold">{nativeMoney(c.amount, c.currency)}</span></div>
          ))}
          <div className="flex justify-between text-sm mt-1 pt-1 border-t border-gray-100"><span className="text-gray-500">Total in USD</span><span className="font-bold">{usd(fin.totals?.usd)}</span></div>
          <div className="text-[11px] text-gray-400 mt-1">₪{fin.totals?.rate?.rate}/$ · Bank of Israel {dayYearLabel(fin.totals?.rate?.date)}</div>
        </div>

        {fin.payment_plan?.length > 0 && (
          <div className="brand-card">
            <h3 className="font-bold text-gray-800 mb-1">Payments planned</h3>
            <p className="text-[11px] text-gray-400 mb-2">Net+30 · invoices by the 28th are paid on the 29th</p>
            {fin.payment_plan.map(p => (
              <div key={p.date} className="flex justify-between text-sm py-0.5"><span>{dayYearLabel(p.date)}</span><span className="font-semibold">{usd(p.usd)} <span className="text-[11px] text-gray-400 font-normal">· {p.count} line{p.count === 1 ? '' : 's'}</span></span></div>
            ))}
          </div>
        )}

        {fin.missing_invoices?.length > 0 && (
          <div className="brand-card">
            <h3 className="font-bold text-amber-700 mb-2 flex items-center gap-2"><AlertTriangle size={15} /> Invoices missing ({fin.missing_invoices.length})</h3>
            {fin.missing_invoices.map(m => (
              <div key={m.id} className="flex justify-between text-sm py-0.5 gap-2"><span className="truncate">{m.supplier || m.label}</span><span className="font-semibold shrink-0">{nativeMoney(m.amount, m.currency)}</span></div>
            ))}
          </div>
        )}

        <div className="brand-card space-y-3">
          <h3 className="font-bold text-gray-800 flex items-center gap-2"><FileSpreadsheet size={15} /> Finance sheet</h3>
          {fin.sheet?.url ? (
            <a href={fin.sheet.url} target="_blank" rel="noreferrer" className="text-sm text-blue-600 hover:underline flex items-center gap-1">Open the sheet <ExternalLink size={12} /></a>
          ) : <div className="text-sm text-gray-400">No sheet yet</div>}
          <div className="text-[11px] text-gray-400">
            {fin.sheet?.mode === 'mirror' ? 'Two-way: finance’s edits (Paid, actuals, invoices) come back into CP.' : fin.sheet?.mode === 'linked' ? 'Old-format sheet — read-only. Convert it on the Finance page.' : ''}
          </div>
          {fin.sheet?.legacy_url && <a href={fin.sheet.legacy_url} target="_blank" rel="noreferrer" className="text-xs text-gray-500 hover:underline">Old sheet</a>}
          {isEditor && fin.sheet?.mode === 'mirror' && (
            <button type="button" onClick={() => run('sync', () => financeApi.syncSheet(production.id))} disabled={!!busy} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">{busy === 'sync' ? 'Syncing…' : 'Sync now'}</button>
          )}
          {isEditor && !fin.sheet?.url && (
            <button type="button" onClick={() => run('create', () => financeApi.createSheet(production.id))} disabled={!!busy} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">{busy === 'create' ? 'Creating…' : 'Create the sheet'}</button>
          )}
        </div>

        {isEditor && !fin.locked && (
          <div className="brand-card">
            <h3 className="font-bold text-gray-800 mb-1 flex items-center gap-2"><CalendarClock size={15} /> Shift dates</h3>
            <p className="text-[11px] text-gray-400 mb-2">Moves every dated line. Moving into a later month asks why and tells finance.</p>
            <div className="flex items-center gap-2">
              <input type="number" value={days} onChange={e => setDays(e.target.value)} className="w-20 border border-gray-200 rounded-lg px-2 py-1.5 text-sm" />
              <span className="text-sm text-gray-500">days</span>
              <button type="button" disabled={!Number(days) || !!busy} onClick={() => run('shift', () => financeApi.shift(production.id, Number(days)))} className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40" style={{ background: 'var(--brand-accent)' }}>{busy === 'shift' ? 'Moving…' : 'Shift'}</button>
            </div>
          </div>
        )}

        {isAdmin && !fin.parent_id && (
          <div className="brand-card">
            <h3 className="font-bold text-gray-800 mb-1 flex items-center gap-2"><GitBranch size={15} /> Re-edits</h3>
            <p className="text-[11px] text-gray-400 mb-2">A re-edit gets its own code (e.g. {fin.code}-01), budget and sheet. Move its lines there from the Budget Table.</p>
            <button type="button" disabled={!!busy} onClick={() => {
              const name = window.prompt('Name of the re-edit', `${production.project_name} — re-edit`);
              if (name) run('sub', async () => { const p = await financeApi.createReEdit(production.id, { name }); window.location.assign(`/production/${encodeURIComponent(p.id)}`); });
            }} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50">New re-edit</button>
          </div>
        )}

        {isAdmin && fin.approved && (
          <button type="button" disabled={!!busy} onClick={() => run('unapprove', () => financeApi.unapprove(production.id))} className="text-xs text-gray-400 hover:text-red-600 underline">Remove the budget approval</button>
        )}
      </div>
    </div>
  );
}

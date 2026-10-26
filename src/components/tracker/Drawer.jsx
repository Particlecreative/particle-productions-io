import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import {
  X, ExternalLink, Plus, Trash2, Link2, Users, Flag, StickyNote, Clapperboard, Check, Sparkles, Wallet, FileSignature,
  ListChecks, Star, MessageSquare, Newspaper, Film, Lock, Loader2,
} from 'lucide-react';
import {
  stageList, stageColor, HEALTH, Face, Signal, BudgetBar, countdown, TONE, shortDate, relTime, money, addDays,
} from './parts';

const SOURCE = { cp: 'Producer', tasks: 'CP task', monday: 'Monday', budget: 'Budget', contract: 'Contract' };

function Section({ icon: Icon, title, right, children }) {
  return (
    <div className="trk-section">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={14} className="trk-muted" />
        <span className="trk-label">{title}</span>
        {right && <span className="ml-auto">{right}</span>}
      </div>
      {children}
    </div>
  );
}

/** Everything about one production; the tracker fields save as you go. */
export default function Drawer({ p, data, today, canEdit, isAdmin, onClose, onSave, onStage, onTicket, onLinkById }) {
  const tr = p.tracker || {};
  const [notes, setNotes] = useState(tr.notes || '');
  const [label, setLabel] = useState(tr.deadline_label || '');
  const [newLink, setNewLink] = useState({ title: '', url: '' });
  const [member, setMember] = useState({ kind: 'internal', name: '', role: '' });
  const [paste, setPaste] = useState('');
  const [linking, setLinking] = useState(false);
  const [saving, setSaving] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { setNotes(p.tracker?.notes || ''); setLabel(p.tracker?.deadline_label || ''); setErr(null); }, [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async (key, patch) => {
    setSaving(key); setErr(null);
    try { await onSave(p, patch); } catch (e) { setErr(e.message); } finally { setSaving(null); }
  };
  const editable = !!canEdit;
  const stageEditable = editable && (!p.locked || isAdmin);
  const cd = countdown(tr.deadline, today);
  const links = tr.links || [];
  const team = tr.team || [];
  const stages = stageList();
  const people = data.people || {};
  const dirUsers = data.directory?.users || [];
  const dirSuppliers = data.directory?.suppliers || [];

  const addLink = () => {
    let url = newLink.url.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    save('links', { links: [...links, { title: newLink.title.trim() || url, url }] });
    setNewLink({ title: '', url: '' });
  };
  const addMember = () => {
    const name = member.name.trim();
    if (!name) return;
    const pool = member.kind === 'internal' ? dirUsers : dirSuppliers;
    const hit = pool.find(x => x.name.toLowerCase() === name.toLowerCase());
    const role = member.role.trim() || (member.kind === 'external' ? hit?.role || '' : '');
    const m = { kind: member.kind, name, role, ...(hit && member.kind === 'internal' ? { user_id: hit.id } : {}), ...(hit && member.kind === 'external' ? { supplier_id: hit.id } : {}) };
    save('team', { team: [...team, m] });
    setMember({ kind: member.kind, name: '', role: '' });
  };

  const TeamCol = ({ kind, title }) => {
    const list = p.team?.[kind] || [];
    return (
      <div className="flex-1 min-w-[220px]">
        <div className="text-[11px] font-semibold mb-2" style={{ color: kind === 'internal' ? '#aab0ff' : '#ffc98a' }}>{title} · {list.length}</div>
        <div className="flex flex-col gap-2">
          {list.map((m, i) => (
            <div key={`${m.name}${i}`} className="flex items-center gap-2.5 group">
              <Face person={m} size={28} tone={kind} ring="transparent" />
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold truncate">{m.name}</div>
                <div className="text-[11px] trk-muted truncate">{[m.role, m.source !== 'tracker' ? SOURCE[m.source] : null].filter(Boolean).filter((v, j, a) => a.indexOf(v) === j).join(' · ') || '—'}</div>
              </div>
              {m.source === 'tracker' && editable && (
                <button type="button" title="Remove" onClick={() => save('team', { team: team.filter(t => !(t.id ? t.id === m.id : t.name === m.name && t.kind === m.kind)) })}
                  className="opacity-0 group-hover:opacity-100 trk-muted hover:text-white"><Trash2 size={13} /></button>
              )}
            </div>
          ))}
          {!list.length && <div className="text-[12px] trk-dim">No one yet</div>}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-[70] flex justify-end" onClick={onClose} style={{ background: 'rgba(3,11,46,.55)' }}>
      <aside className="trk trk-drawer h-full w-full max-w-[640px] overflow-y-auto trk-scroll" onClick={e => e.stopPropagation()} role="dialog" aria-label={p.name}>
        <div className="p-6 md:p-8">
          {/* Header */}
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="trk-eyebrow flex items-center gap-2">{p.id}{p.production_type ? ` · ${p.production_type}` : ''}{p.locked && <Lock size={11} />}</div>
              <h2 className="trk-title text-5xl mt-2">{p.name}</h2>
              {p.product_type?.length > 0 && <div className="mt-2 text-[13px] trk-muted">{p.product_type.join(' · ')}</div>}
            </div>
            <button type="button" onClick={onClose} className="trk-btn !p-2" aria-label="Close"><X size={16} /></button>
          </div>

          <div className="mt-5 flex flex-wrap gap-2">
            <RouterLink to={`/production/${encodeURIComponent(p.id)}`} className="trk-btn primary"><ExternalLink size={14} /> Open in CP</RouterLink>
            {saving && <span className="trk-chip gray"><Loader2 size={12} className="animate-spin" /> Saving…</span>}
            {err && <span className="trk-chip red">{err}</span>}
          </div>

          {/* Stage */}
          <div className="mt-6">
            <div className="trk-label mb-2">Stage{p.stage_days != null ? ` · ${p.stage_days}d in ${p.stage}` : ''}{p.stage_by ? ` · moved by ${p.stage_by}` : ''}</div>
            <div className="flex flex-wrap gap-1.5">
              {stages.map(s => (
                <button key={s} type="button" disabled={!stageEditable || s === p.stage} onClick={() => onStage(p, s)}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5 transition-colors"
                  style={s === p.stage
                    ? { background: stageColor(s), color: '#030b2e' }
                    : { background: 'rgba(255,255,255,.06)', color: 'var(--trk-muted)', border: '1px solid var(--trk-line)' }}>
                  {s === p.stage && <Check size={12} />}{s}
                </button>
              ))}
            </div>
          </div>

          {/* Health */}
          <div className="mt-4">
            <div className="trk-label mb-2">Health</div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(HEALTH).map(([k, h]) => (
                <button key={k} type="button" disabled={!editable} onClick={() => save('health', { health: tr.health === k ? null : k })}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-full flex items-center gap-1.5"
                  style={tr.health === k ? { background: h.color, color: '#030b2e' } : { background: 'rgba(255,255,255,.06)', color: 'var(--trk-muted)', border: '1px solid var(--trk-line)' }}>
                  <span className="w-2 h-2 rounded-full" style={{ background: tr.health === k ? '#030b2e' : h.color }} />{h.label}
                </button>
              ))}
            </div>
          </div>

          {p.signals?.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{p.signals.map(s => <Signal key={s.kind} s={s} />)}</div>}

          {/* Deadline */}
          <Section icon={Flag} title="Our deadline">
            <div className="flex items-end gap-4">
              {cd && (
                <div className="flex-none text-center min-w-[64px]">
                  <div className="trk-title text-6xl" style={{ color: TONE[cd.tone] }}>{cd.unit === 'today' ? 'NOW' : cd.n}</div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: TONE[cd.tone] }}>{cd.unit === 'today' ? 'due today' : cd.unit}</div>
                </div>
              )}
              <div className="flex-1 grid gap-2 sm:grid-cols-[150px_1fr]">
                <input type="date" className="trk-input" value={tr.deadline || ''} disabled={!editable}
                  onChange={(e) => save('deadline', { deadline: e.target.value || null })} />
                <input className="trk-input" placeholder="What’s due — e.g. Offline to Guy & Ayal" value={label} disabled={!editable}
                  onChange={(e) => setLabel(e.target.value)} onBlur={() => label !== (tr.deadline_label || '') && save('label', { deadline_label: label })}
                  onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
              </div>
            </div>
            {editable && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {[['+1 week', 7], ['+2 weeks', 14], ['+1 month', 30]].map(([t, n]) => (
                  <button key={t} type="button" className="trk-chip gray hover:text-white" onClick={() => save('deadline', { deadline: addDays(tr.deadline && tr.deadline > today ? tr.deadline : today, n) })}>{t}</button>
                ))}
                {p.dates?.delivery && <button type="button" className="trk-chip gray hover:text-white" onClick={() => save('deadline', { deadline: p.dates.delivery, deadline_label: label || 'Delivery' })}>Use delivery date · {shortDate(p.dates.delivery)}</button>}
                {tr.deadline && <button type="button" className="trk-chip gray hover:text-white" onClick={() => save('deadline', { deadline: null })}>Clear</button>}
              </div>
            )}
          </Section>

          {/* Notes */}
          <Section icon={StickyNote} title="Notes" right={tr.updated_at ? <span className="text-[11px] trk-dim">{tr.updated_by ? `${tr.updated_by} · ` : ''}{relTime(tr.updated_at)}</span> : null}>
            <textarea className="trk-input min-h-[110px] leading-relaxed" placeholder="Where it stands, what’s blocking, what’s next…" value={notes} disabled={!editable}
              onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== (tr.notes || '') && save('notes', { notes })} />
          </Section>

          {/* Links */}
          <Section icon={Link2} title="Links">
            <div className="flex flex-col gap-1.5">
              {links.map(l => (
                <div key={l.id || l.url} className="flex items-center gap-2 group">
                  <Link2 size={13} className="trk-muted flex-none" />
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="trk-link text-[13px] truncate flex-1">{l.title}</a>
                  {editable && <button type="button" title="Remove" onClick={() => save('links', { links: links.filter(x => x !== l) })} className="opacity-0 group-hover:opacity-100 trk-muted hover:text-white"><Trash2 size={13} /></button>}
                </div>
              ))}
              {(p.cp_links || []).map((l, i) => (
                <div key={`cp${i}`} className="flex items-center gap-2">
                  <Link2 size={13} className="trk-dim flex-none" />
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className="trk-link text-[13px] truncate flex-1">{l.title}</a>
                  <span className="text-[10px] trk-dim">CP · {l.category}</span>
                </div>
              ))}
              {p.cp_links_count > (p.cp_links || []).length && <div className="text-[11px] trk-dim">+{p.cp_links_count - p.cp_links.length} more on the production board</div>}
              {!links.length && !p.cp_links?.length && <div className="text-[12px] trk-dim">No links yet</div>}
            </div>
            {editable && (
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                <input className="trk-input" placeholder="Title" value={newLink.title} onChange={(e) => setNewLink(v => ({ ...v, title: e.target.value }))} />
                <input className="trk-input" placeholder="https://…" value={newLink.url} onChange={(e) => setNewLink(v => ({ ...v, url: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && addLink()} />
                <button type="button" className="trk-btn" onClick={addLink} disabled={!newLink.url.trim()}><Plus size={14} /> Add</button>
              </div>
            )}
          </Section>

          {/* Team */}
          <Section icon={Users} title="Who’s on it">
            <div className="flex flex-wrap gap-6">
              <TeamCol kind="internal" title="Internal" />
              <TeamCol kind="external" title="External" />
            </div>
            {editable && (
              <div className="mt-4 grid gap-2 sm:grid-cols-[auto_1fr_1fr_auto]">
                <div className="trk-seg">
                  {['internal', 'external'].map(k => <button key={k} type="button" className={member.kind === k ? 'on' : ''} onClick={() => setMember(m => ({ ...m, kind: k }))}>{k === 'internal' ? 'Internal' : 'External'}</button>)}
                </div>
                <input className="trk-input" list={`trk-dir-${member.kind}`} placeholder={member.kind === 'internal' ? 'Name (team member)' : 'Name (crew, supplier, agency)'} value={member.name}
                  onChange={(e) => setMember(m => ({ ...m, name: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && addMember()} />
                <input className="trk-input" placeholder="Role — e.g. Director, Editor" value={member.role}
                  onChange={(e) => setMember(m => ({ ...m, role: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && addMember()} />
                <button type="button" className="trk-btn" onClick={addMember} disabled={!member.name.trim()}><Plus size={14} /> Add</button>
                <datalist id="trk-dir-internal">{dirUsers.map(u => <option key={u.id} value={u.name} />)}{Object.values(people).map(u => <option key={`m${u.id}`} value={u.name} />)}</datalist>
                <datalist id="trk-dir-external">{dirSuppliers.map(s => <option key={s.id} value={s.name}>{s.role}</option>)}</datalist>
              </div>
            )}
            <div className="mt-2 text-[11px] trk-dim">The producer, CP task owners, the studio on linked Monday tickets and crew from the budget join automatically.</div>
          </Section>

          {/* Monday tickets */}
          {data.monday && (
            <Section icon={Clapperboard} title={`Monday tickets · ${p.tickets?.length || 0}`}>
              <div className="flex flex-col gap-2">
                {(p.tickets || []).map(t => <TicketRow key={t.id} t={t} p={p} data={data} editable={editable} onTicket={onTicket} />)}
                {!p.tickets?.length && <div className="text-[12px] trk-dim">No Monday tickets linked yet.</div>}
              </div>
              {editable && data.ask?.length > 0 && (
                <select className="trk-input mt-3" value="" onChange={(e) => { const t = data.ask.find(x => x.id === e.target.value); if (t) onTicket(t, { production_id: p.id }); }}>
                  <option value="">Link a ticket that needs a production ({data.ask.length})…</option>
                  {data.ask.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              )}
              {editable && (
                <form className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]"
                  onSubmit={async (e) => { e.preventDefault(); if (!paste.trim()) return; setLinking(true); if (await onLinkById(p, paste)) setPaste(''); setLinking(false); }}>
                  <input className="trk-input" placeholder="Paste a Monday ticket link to link it here" value={paste} onChange={(e) => setPaste(e.target.value)} />
                  <button type="submit" className="trk-btn" disabled={!paste.trim() || linking}>{linking ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Link</button>
                </form>
              )}
              <div className="mt-2 text-[11px] trk-dim">TV &amp; SP tickets and tickets named after the production link themselves; anything else, paste it here.</div>
            </Section>
          )}

          {/* CP facts */}
          <Section icon={Film} title="From the CP">
            <div className="grid sm:grid-cols-2 gap-3">
              <Fact icon={Flag} label="Planned">{p.dates?.planned_start ? `${shortDate(p.dates.planned_start)} → ${shortDate(p.dates.planned_end) || '…'}` : '—'}</Fact>
              <Fact icon={Film} label="Shoot">{p.shoot?.days?.length ? p.shoot.days.map(shortDate).join(', ') : '—'}</Fact>
              <Fact icon={Flag} label="Delivery / on air">{[p.dates?.delivery && `Delivery ${shortDate(p.dates.delivery)}`, p.dates?.air && `Air ${shortDate(p.dates.air)}`].filter(Boolean).join(' · ') || '—'}</Fact>
              <Fact icon={Clapperboard} label="Gantt">{p.milestone?.current ? `Now: ${p.milestone.current.title}` : p.milestone?.next ? `Next: ${p.milestone.next.title} · ${shortDate(p.milestone.next.start)}` : '—'}</Fact>
              <Fact icon={Wallet} label="Budget">
                {p.budget?.planned || p.budget?.actual ? (
                  <>
                    <BudgetBar budget={p.budget} compact />
                    <span className="block mt-1">{money(p.budget.actual)} of {p.budget.planned ? money(p.budget.planned) : '—'}{p.budget.unpaid ? ` · ${p.budget.unpaid} unpaid` : ''}</span>
                  </>
                ) : '—'}
              </Fact>
              <Fact icon={FileSignature} label="Contract">{p.contract ? `${p.contract.status}${p.contract.provider ? ` · ${p.contract.provider}` : ''}` : '—'}</Fact>
              <Fact icon={ListChecks} label="Tasks">
                {p.tasks?.open ? (
                  <>
                    {p.tasks.open} open{p.tasks.overdue ? <span style={{ color: '#ffb3c2' }}> · {p.tasks.overdue} overdue</span> : ''}
                    {p.tasks.next.map((t, i) => <span key={i} className="block trk-muted truncate">{t.title} · {shortDate(t.due_date)}{t.assignee ? ` · ${t.assignee}` : ''}</span>)}
                  </>
                ) : 'None open'}
              </Fact>
              <Fact icon={Star} label="Casting">{p.casting?.count ? `${p.casting.count} talent${p.casting.warnings ? ` · ${p.casting.warnings} expiring` : ''}` : '—'}</Fact>
            </div>
            {p.latest_update && (
              <div className="mt-4 trk-glass p-3.5">
                <div className="flex items-center gap-2 text-[11px] trk-muted"><MessageSquare size={12} /> Latest update · {p.latest_update.author || 'Someone'} · {relTime(p.latest_update.at)}{p.latest_update.count > 1 ? ` · ${p.latest_update.count} in total` : ''}</div>
                <div className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-wrap">{p.latest_update.body}</div>
              </div>
            )}
            {p.weekly && (
              <div className="mt-3 trk-glass p-3.5">
                <div className="flex items-center gap-2 text-[11px] trk-muted"><Newspaper size={12} /> CP weekly · week of {shortDate(p.weekly.week_start)}</div>
                {p.weekly.note && <div className="mt-1.5 text-[13px]">{p.weekly.note}</div>}
                {p.weekly.bullets.length > 0 && <ul className="mt-1.5 text-[13px] list-disc pl-5 space-y-0.5">{p.weekly.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>}
              </div>
            )}
          </Section>
        </div>
      </aside>
    </div>
  );
}

function Fact({ icon: Icon, label, children }) {
  return (
    <div className="trk-glass p-3 min-w-0">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] trk-muted"><Icon size={11} />{label}</div>
      <div className="mt-1 text-[13px]">{children}</div>
    </div>
  );
}

export function TicketRow({ t, p, data, editable, onTicket, compact }) {
  const people = data.people || {};
  const tv = t.tv || {};
  return (
    <div className="flex items-center gap-2.5 trk-glass px-3 py-2.5">
      <span className="w-2 h-8 rounded-full flex-none" style={{ background: t.status?.color || '#c4c4c4', opacity: t.open ? 1 : 0.5 }} />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold truncate" title={t.name}>{t.name}</div>
        <div className="text-[11px] trk-muted flex items-center gap-1.5 flex-wrap">
          <span style={{ color: t.status?.color }}>{t.status?.label || '—'}</span>
          {t.timeline?.to && <span>· {shortDate(t.timeline.from)} → {shortDate(t.timeline.to)}</span>}
          {!compact && tv.source === 'auto' && <span title={`Matched automatically: ${tv.why || ''}`} className="flex items-center gap-0.5"><Sparkles size={10} /> auto</span>}
          {!compact && tv.source === 'confirmed' && <span className="flex items-center gap-0.5"><Check size={10} /> {tv.decided_by || 'confirmed'}</span>}
        </div>
      </div>
      <span className="flex -space-x-1.5">{t.people.map(id => people[id] && <Face key={id} person={people[id]} size={22} ring="var(--trk-navy-2)" />)}</span>
      {t.links?.frame && <a href={t.links.frame} target="_blank" rel="noopener noreferrer" className="trk-chip gray hover:text-white" title="Frame.io">F.io</a>}
      {t.monday_url && <a href={t.monday_url} target="_blank" rel="noopener noreferrer" className="trk-muted hover:text-white" title="Open on Monday"><ExternalLink size={13} /></a>}
      {editable && p && (
        <select value="" title="Change the production" className="text-[12px] w-6 bg-transparent trk-muted hover:text-white cursor-pointer appearance-none text-center"
          onChange={(e) => {
            const v = e.target.value;
            if (v === '__confirm') onTicket(t, { production_id: p.id });
            else if (v === '__none') onTicket(t, { decision: 'none' });
            else if (v === '__clear') onTicket(t, { decision: 'clear' });
            else if (v) onTicket(t, { production_id: v });
          }}>
          <option value="">⋯</option>
          {tv.source === 'auto' && <option value="__confirm">Confirm it belongs here</option>}
          {(data.productions || []).filter(x => x.id !== p.id && !/^completed/i.test(x.stage)).map(x => <option key={x.id} value={x.id}>Move to {x.id} · {x.name}</option>)}
          <option value="__none">Not a production ticket</option>
          {tv.source === 'confirmed' && <option value="__clear">Undo my choice</option>}
        </select>
      )}
    </div>
  );
}


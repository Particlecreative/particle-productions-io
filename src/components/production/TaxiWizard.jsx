import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  X, Car, Send, Loader2, MapPin, Phone, Clock, Users, Copy, Check,
  Sparkles, ArrowRight, RotateCcw, Home, AlertTriangle,
} from 'lucide-react';
import { updateProduction } from '../../lib/dataService';
import TaxiMap from './TaxiMap';
import clsx from 'clsx';

const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

const TAXI_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

const QUICK_ACTIONS = [
  { label: 'Add rides home after wrap', text: 'Add return trips to take everyone home after wrap.' },
  { label: 'Use fewer taxis', text: 'Try to do it with fewer taxis, up to 4 passengers each.' },
  { label: 'Arrive 30 min early', text: 'Have everyone arrive 30 minutes before call time.' },
  { label: 'Group by neighborhood', text: 'Regroup the taxis by neighborhood so pickups are on the way.' },
];

function initials(name = '?') {
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('') || '?';
}

// Plain text of one taxi ride — handy to paste to a driver / dispatcher.
function rideToText(t, plan) {
  const lines = [`${t.label}${t.leg === 'from_set' ? ' (home after wrap)' : ''}`];
  if (t.pickup_time) lines.push(`First pickup: ${t.pickup_time}`);
  (t.passengers || []).forEach((p, i) => {
    const bits = [`${p.order || i + 1}. ${p.name}`];
    if (p.pickup_time) bits.push(`@ ${p.pickup_time}`);
    if (p.pickup_address) bits.push(`— ${p.pickup_address}`);
    if (p.phone) bits.push(`(${p.phone})`);
    lines.push('  ' + bits.join(' '));
  });
  const dest = plan?.shoot_location;
  if (t.leg !== 'from_set' && dest) lines.push(`→ ${dest}${t.arrive_by ? ` by ${t.arrive_by}` : ''}`);
  if (t.est_km || t.est_cost_ils) lines.push(`~${t.est_km ? `${t.est_km} km` : ''}${t.est_cost_ils ? ` · ₪${t.est_cost_ils}` : ''}`.trim());
  return lines.join('\n');
}

export default function TaxiWizard({ production, people = [], cast = [], onClose }) {
  const saved = production?.taxi_plan && typeof production.taxi_plan === 'object' ? production.taxi_plan : null;
  const [messages, setMessages] = useState(saved?.messages || []);
  const [plan, setPlan] = useState(saved?.plan || null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  const [planView, setPlanView] = useState('list'); // 'list' | 'map'
  const scrollRef = useRef(null);
  const kickedOff = useRef(false);

  const shoot = useMemo(() => ({
    location: production?.location || production?.shoot_location || '',
    date: production?.planned_start || '',
  }), [production]);

  const rosterCount = (people?.length || 0) + (cast?.length || 0);

  const scrollDown = useCallback(() => {
    setTimeout(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, 60);
  }, []);

  const send = useCallback(async (text, { hidden = false } = {}) => {
    if (!text.trim() || loading) return;
    setError('');
    const userMsg = { role: 'user', content: text.trim(), hidden };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput('');
    setLoading(true);
    scrollDown();
    try {
      const res = await fetch(`${API}/api/taxi/${production.id}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        body: JSON.stringify({
          messages: next.map(m => ({ role: m.role, content: m.content })),
          people, cast, shoot,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || `Server error (${res.status})`);
      const data = await res.json();
      const assistantMsg = { role: 'assistant', content: data.reply || 'Updated the plan.' };
      const finalMsgs = [...next, assistantMsg];
      const finalPlan = data.plan || plan;
      setMessages(finalMsgs);
      if (data.plan) setPlan(data.plan);
      scrollDown();
      // Persist (non-critical)
      try { updateProduction(production.id, { taxi_plan: { messages: finalMsgs, plan: finalPlan, updated_at: new Date().toISOString() } }); } catch {}
    } catch (e) {
      setError(e.message || 'Something went wrong');
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ I couldn't reach the planner: ${e.message}. Try again in a moment.` }]);
      scrollDown();
    } finally {
      setLoading(false);
    }
  }, [messages, loading, people, cast, shoot, production, plan, scrollDown]);

  // Auto-draft a first plan on open when there's nothing saved yet.
  useEffect(() => {
    if (kickedOff.current) return;
    kickedOff.current = true;
    if (!saved && rosterCount > 0) {
      send('Plan the taxis to get everyone on the roster to set on time. If the call time is unknown, assume a sensible one and tell me what you assumed.', { hidden: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleMessages = messages.filter(m => !m.hidden);
  const taxis = plan?.taxis || [];
  const totalPax = taxis.reduce((s, t) => s + (t.passengers?.length || 0), 0);

  function copyRide(key, text) {
    navigator.clipboard?.writeText(text).then(() => { setCopied(key); setTimeout(() => setCopied(''), 1500); });
  }
  function copyAll() {
    const txt = [
      plan?.summary || 'Transport plan',
      plan?.shoot_location ? `Destination: ${plan.shoot_location}` : '',
      plan?.call_time ? `Call: ${plan.call_time}` : '',
      '',
      ...taxis.map(t => rideToText(t, plan)),
    ].filter(Boolean).join('\n\n');
    copyRide('__all__', txt);
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-0 sm:p-4">
      <div className="bg-white dark:bg-gray-900 w-full h-full sm:h-[90vh] sm:max-w-6xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #ef4444)' }}>
              <Car size={18} />
            </div>
            <div>
              <h2 className="text-base font-black text-gray-800 dark:text-gray-100 flex items-center gap-1.5">
                Taxi Wizard <Sparkles size={13} className="text-amber-500" />
              </h2>
              <p className="text-[10px] text-gray-400">{production?.project_name || production?.id} · {rosterCount} people</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 min-h-0 flex flex-col md:flex-row">
          {/* ── Chat column ── */}
          <div className="flex flex-col md:w-[42%] md:border-r border-gray-100 dark:border-gray-800 min-h-0 max-h-[45%] md:max-h-none">
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {/* Greeting */}
              <div className="ai-msg-in flex gap-2">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>
                  <Car size={13} />
                </div>
                <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-gray-700 dark:text-gray-200 max-w-[85%]">
                  Hi! I'm your Taxi Wizard 🚕 I've got your roster of <b>{rosterCount}</b> {rosterCount === 1 ? 'person' : 'people'}. Tell me the <b>call time</b> and shoot address (or anything special) and I'll sort the rides. Or just say <i>"plan it"</i>.
                </div>
              </div>

              {visibleMessages.map((m, i) => (
                m.role === 'user' ? (
                  <div key={i} className="ai-msg-in flex justify-end">
                    <div className="rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-sm text-white max-w-[85%] whitespace-pre-wrap" style={{ background: 'var(--brand-accent, #6366f1)' }}>
                      {m.content}
                    </div>
                  </div>
                ) : (
                  <div key={i} className="ai-msg-in flex gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>
                      <Car size={13} />
                    </div>
                    <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-sm px-3.5 py-2.5 text-sm text-gray-700 dark:text-gray-200 max-w-[85%] whitespace-pre-wrap">
                      {m.content}
                    </div>
                  </div>
                )
              ))}

              {loading && (
                <div className="flex gap-2">
                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0" style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>
                    <Car size={13} />
                  </div>
                  <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-1">
                    <span className="ai-dot" /><span className="ai-dot" style={{ animationDelay: '0.15s' }} /><span className="ai-dot" style={{ animationDelay: '0.3s' }} />
                  </div>
                </div>
              )}
            </div>

            {/* Quick actions */}
            {plan && !loading && (
              <div className="px-3 pb-1.5 flex gap-1.5 flex-wrap">
                {QUICK_ACTIONS.map(qa => (
                  <button key={qa.label} onClick={() => send(qa.text)}
                    className="text-[10px] font-semibold px-2.5 py-1 rounded-full border border-gray-200 dark:border-gray-700 text-gray-500 hover:border-amber-300 hover:text-amber-700 hover:bg-amber-50 transition-colors">
                    {qa.label}
                  </button>
                ))}
              </div>
            )}

            {/* Composer */}
            <div className="p-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
              <div className="flex items-end gap-2 bg-gray-50 dark:bg-gray-800 rounded-2xl px-3 py-2 border border-gray-200 dark:border-gray-700 focus-within:border-amber-400 transition-colors">
                <textarea
                  rows={1}
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); } }}
                  placeholder="e.g. Call is 07:00, Dana drives herself, pick up the two actors together in Florentin…"
                  className="flex-1 bg-transparent resize-none outline-none text-sm text-gray-700 dark:text-gray-200 max-h-28"
                />
                <button onClick={() => send(input)} disabled={!input.trim() || loading}
                  className="p-2 rounded-xl text-white disabled:opacity-40 transition-all active:scale-95 shrink-0"
                  style={{ background: 'linear-gradient(135deg,#f59e0b,#ef4444)' }}>
                  {loading ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                </button>
              </div>
            </div>
          </div>

          {/* ── Plan column ── */}
          <div className="flex-1 min-h-0 flex flex-col bg-gray-50/60 dark:bg-gray-900/40">
            {/* Plan header */}
            <div className="px-5 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-black text-gray-800 dark:text-gray-100">
                  {plan?.summary || 'Transport plan'}
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400 flex-wrap">
                  <span className="flex items-center gap-1"><Car size={11} /> {taxis.length} {taxis.length === 1 ? 'taxi' : 'taxis'}</span>
                  <span className="flex items-center gap-1"><Users size={11} /> {totalPax} riding</span>
                  {plan?.call_time && <span className="flex items-center gap-1"><Clock size={11} /> call {plan.call_time}</span>}
                  {plan?.shoot_location && <span className="flex items-center gap-1 truncate max-w-[220px]"><MapPin size={11} /> {plan.shoot_location}</span>}
                </div>
              </div>
              {taxis.length > 0 && (
                <div className="flex items-center gap-2">
                  {/* List / Map toggle */}
                  <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden text-xs font-semibold">
                    <button onClick={() => setPlanView('list')}
                      className={clsx('px-2.5 py-1.5 transition-colors', planView === 'list' ? 'bg-amber-500 text-white' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800')}>
                      List
                    </button>
                    <button onClick={() => setPlanView('map')}
                      className={clsx('px-2.5 py-1.5 transition-colors flex items-center gap-1', planView === 'map' ? 'bg-amber-500 text-white' : 'text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800')}>
                      <MapPin size={11} /> Map
                    </button>
                  </div>
                  <button onClick={copyAll}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 hover:border-amber-300 hover:text-amber-700 transition-colors">
                    {copied === '__all__' ? <><Check size={12} /> Copied</> : <><Copy size={12} /> Copy all</>}
                  </button>
                </div>
              )}
            </div>

            {/* Plan body */}
            {planView === 'map' && taxis.length > 0 ? (
            <div className="flex-1 min-h-0 p-3">
              <TaxiMap plan={plan} />
            </div>
            ) : (
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {taxis.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 py-16">
                  <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center mb-3">
                    <Car size={28} className="text-amber-400" />
                  </div>
                  <p className="text-sm font-semibold text-gray-500">{loading ? 'Planning your rides…' : 'No plan yet'}</p>
                  <p className="text-xs text-gray-400 mt-0.5 max-w-[240px]">Tell me about the shoot in the chat and the rides will appear here.</p>
                </div>
              ) : (
                <>
                  {taxis.map((t, i) => {
                    const color = TAXI_COLORS[i % TAXI_COLORS.length];
                    const key = `t-${i}`;
                    return (
                      <div key={key} className="fs-card-in bg-white dark:bg-gray-800 rounded-2xl border border-gray-100 dark:border-gray-700 overflow-hidden shadow-sm"
                        style={{ animationDelay: `${Math.min(i, 10) * 30}ms` }}>
                        {/* Ride header */}
                        <div className="flex items-center gap-2.5 px-4 py-2.5" style={{ background: `${color}12` }}>
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0" style={{ background: color }}>
                            {i + 1}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate flex items-center gap-1.5">
                              {t.label || `Taxi ${i + 1}`}
                              {t.leg === 'from_set' && <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-violet-600 bg-violet-100 rounded-full px-1.5 py-0.5"><Home size={8} /> home</span>}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5 flex-wrap">
                              {t.pickup_time && <span className="flex items-center gap-0.5"><Clock size={9} /> {t.pickup_time}</span>}
                              {t.arrive_by && <span className="flex items-center gap-0.5"><ArrowRight size={9} /> by {t.arrive_by}</span>}
                              {t.est_km ? <span>~{t.est_km} km</span> : null}
                              {t.est_cost_ils ? <span className="font-semibold text-gray-500">₪{t.est_cost_ils}</span> : null}
                              <span className="text-gray-300">· {(t.passengers?.length || 0)} pax</span>
                            </div>
                          </div>
                          <button onClick={() => copyRide(key, rideToText(t, plan))}
                            className="p-1.5 rounded-lg text-gray-400 hover:bg-white/60 dark:hover:bg-gray-700 transition-colors shrink-0" title="Copy ride for driver">
                            {copied === key ? <Check size={13} className="text-green-500" /> : <Copy size={13} />}
                          </button>
                        </div>
                        {/* Passengers */}
                        <div className="px-3 py-2 space-y-0.5">
                          {(t.passengers || []).map((p, pi) => (
                            <div key={pi} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                              <div className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 text-[10px] font-bold flex items-center justify-center shrink-0">
                                {p.order || pi + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="text-[13px] font-semibold text-gray-800 dark:text-gray-100 truncate">
                                  {p.name} {p.role && <span className="text-[10px] font-normal text-gray-400">· {p.role}</span>}
                                </div>
                                {(p.pickup_address || p.note) && (
                                  <div className="text-[10px] text-gray-400 truncate">{p.pickup_address}{p.note ? ` — ${p.note}` : ''}</div>
                                )}
                              </div>
                              {p.pickup_time && <span className="text-[10px] text-gray-400 shrink-0">{p.pickup_time}</span>}
                              {p.phone && (
                                <a href={`tel:${p.phone}`} className="p-1.5 rounded-lg text-gray-400 hover:text-green-600 hover:bg-green-50 transition-colors shrink-0" title={`Call ${p.name}`}>
                                  <Phone size={12} />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                        {t.route_note && (
                          <div className="px-4 pb-2.5 text-[10px] text-gray-400">{t.route_note}</div>
                        )}
                      </div>
                    );
                  })}

                  {/* Unassigned */}
                  {plan?.unassigned?.length > 0 && (
                    <div className="bg-amber-50/70 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800/50 rounded-2xl px-4 py-3">
                      <div className="text-[11px] font-bold text-amber-700 flex items-center gap-1.5 mb-1.5"><AlertTriangle size={12} /> Not in a taxi</div>
                      <div className="space-y-1">
                        {plan.unassigned.map((u, i) => (
                          <div key={i} className="text-xs text-amber-800/80 dark:text-amber-200/80">
                            <b>{u.name}</b>{u.reason ? ` — ${u.reason}` : ''}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  {plan?.notes?.length > 0 && (
                    <div className="text-[11px] text-gray-400 px-1 space-y-1">
                      {plan.notes.map((n, i) => <div key={i} className="flex gap-1.5"><span className="text-gray-300">•</span>{n}</div>)}
                    </div>
                  )}
                </>
              )}
            </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

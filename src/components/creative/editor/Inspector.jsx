import { useEffect, useMemo, useState } from 'react';
import {
  Star, EyeOff, Eye, ImageIcon, RotateCcw, Trash2, Sparkles, Loader2, Search, Link2, Save, RefreshCw, UserX, UserCheck, AlertTriangle,
  ArrowUp, ArrowDown, Minus, Plus, ListChecks, Images, LayoutGrid, Film, Clapperboard, Ban,
} from 'lucide-react';
import { SPECS, COMMON_SCHEMA, decorate, personShown } from '../slides/specs';
import { DIVISIONS, divisionOf, personCandidates, productionMatchScore } from '../slides/divisions';
import { displayName, shortDate, relTime } from '../deck/format';

const TABS = [['slide', 'Slide'], ['tickets', 'Tickets'], ['deck', 'Deck']];

export default function Inspector({ tab, setTab, slide, ctx }) {
  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200" style={{ width: 340 }}>
      <div className="flex border-b border-gray-200 px-2 pt-2 gap-1">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" onClick={() => setTab(k)}
            className={`px-3 py-2 text-sm font-semibold rounded-t-lg ${tab === k ? 'text-[#030b2e] border-b-2 border-[#0808f8]' : 'text-gray-400 hover:text-gray-600'}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'slide' && slide && <SlideTab slide={slide} ctx={ctx} />}
        {tab === 'tickets' && <TicketsTab slide={slide} ctx={ctx} />}
        {tab === 'deck' && <DeckTab ctx={ctx} />}
      </div>
    </div>
  );
}

// ── Slide tab ───────────────────────────────────────────────────────────────
function Field({ label, children, hint }) {
  return (
    <label className="block mb-4">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

function TextInput({ value, onCommit, placeholder, multiline = false, rows = 3, disabled }) {
  const [draft, setDraft] = useState(null);
  const v = draft ?? value ?? '';
  const commit = () => { if (draft !== null && draft !== (value ?? '')) onCommit(draft); setDraft(null); };
  const props = {
    value: v, placeholder, disabled,
    onChange: (e) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e) => { e.stopPropagation(); if (!multiline && e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); } if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur(); } },
    className: 'w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:border-[#4a55ff] focus:ring-2 focus:ring-[#4a55ff]/20 outline-none disabled:bg-gray-50',
  };
  return multiline ? <textarea rows={rows} {...props} /> : <input type="text" {...props} />;
}

function SchemaControl({ def, value, onChange, disabled }) {
  if (def.type === 'segmented') {
    return (
      <div className="flex flex-wrap gap-1 p-1 rounded-lg bg-gray-100">
        {def.options.map(([v, label]) => (
          <button key={v} type="button" disabled={disabled} onClick={() => onChange(v)}
            className={`flex-1 text-xs font-semibold px-2 py-1.5 rounded-md ${value === v ? 'bg-white shadow text-[#030b2e]' : 'text-gray-500 hover:text-gray-700'}`}>
            {label}
          </button>
        ))}
      </div>
    );
  }
  if (def.type === 'select') {
    return (
      <select value={value} disabled={disabled} onChange={e => onChange(e.target.value)} className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200">
        {def.options.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
      </select>
    );
  }
  if (def.type === 'toggle') {
    return (
      <button type="button" disabled={disabled} onClick={() => onChange(!value)}
        className={`relative w-10 h-6 rounded-full transition-colors ${value ? 'bg-[#0808f8]' : 'bg-gray-300'}`}>
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${value ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    );
  }
  if (def.type === 'number') {
    return <input type="number" min={def.min} max={def.max} value={value ?? 0} disabled={disabled}
      onChange={e => onChange(Math.max(def.min ?? -Infinity, Math.min(def.max ?? Infinity, Number(e.target.value) || 0)))}
      onKeyDown={e => e.stopPropagation()}
      className="w-24 text-sm px-3 py-2 rounded-lg border border-gray-200" />;
  }
  return <TextInput value={value} onCommit={onChange} disabled={disabled} />;
}

function SlideTab({ slide, ctx }) {
  const spec = SPECS[slide.type];
  const ro = !ctx.editable;
  // General updates are edited in the CP weekly itself (below), not as deck-only text
  const hasBullets = ['exec_summary', 'closing', 'division_next'].includes(slide.type);
  const bullets = slide.type === 'division_next' ? (slide.vm.focus || [])
    : (slide.type === 'exec_summary' || slide.type === 'closing') ? slide.vm.bullets : (slide.vm.updates || []).map(u => u.text);
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs font-bold uppercase tracking-wider px-2 py-1 rounded-md bg-[#030b2e] text-white">{spec?.label || slide.type}</span>
        {slide.edited && <span className="text-[11px] text-amber-600 font-semibold">Edited</span>}
        <div className="ml-auto flex gap-1">
          <button type="button" disabled={ro} onClick={() => ctx.toggleHidden(slide.key)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500" title={slide.hidden ? 'Show slide' : 'Hide slide'}>
            {slide.hidden ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          {slide.edited && <button type="button" disabled={ro} onClick={() => ctx.resetSlide(slide.key)} className="p-1.5 rounded-md hover:bg-gray-100 text-gray-500" title="Reset to generated"><RotateCcw size={16} /></button>}
          {slide.custom && <button type="button" disabled={ro} onClick={() => ctx.deleteCustom(slide.key)} className="p-1.5 rounded-md hover:bg-red-50 text-red-500" title="Delete slide"><Trash2 size={16} /></button>}
        </div>
      </div>
      {slide.autoHidden && !slide.hidden && (
        <div className="mb-4 text-xs px-3 py-2 rounded-lg bg-amber-50 text-amber-800">
          {slide.vm?.hiddenProduction ? 'This production is left out of the deck (Tickets tab to bring it back).' : 'This slide has no data this week, so it’s skipped when presenting. Set “If empty” below to show it anyway.'}
        </div>
      )}

      {(spec?.textSlots || []).map(slot => (
        <Field key={slot} label={slot === 'eyebrow' ? 'Eyebrow' : slot === 'title' ? 'Title' : 'Subtitle'}>
          <TextInput value={slide.text[slot]} disabled={ro} multiline={slot === 'subtitle'} rows={2}
            placeholder={slide.generatedText?.[slot] || ''} onCommit={(v) => ctx.setText(slide.key, slot, v)} />
        </Field>
      ))}

      {hasBullets && (
        <Field label={slide.type === 'cp_updates' ? 'Updates (one per line)' : slide.type === 'division_next' ? 'Focus this week (one per line)' : 'Bullets (one per line)'}
          hint={slide.type === 'exec_summary' && slide.vm.source !== 'edited' ? (slide.vm.source === 'ai' ? 'Written by Claude — editing locks your version.' : 'Auto-written from the data. Use “Write with Claude” for a sharper summary.')
            : slide.type === 'division_next' && slide.vm.focusSource !== 'edited' ? (slide.vm.focusSource === 'ai' ? 'Written by Claude from this division’s plan.' : 'Auto-written from what’s planned. Use “Write with Claude” for sharper bullets.') : null}>
          <TextInput multiline rows={6} disabled={ro} value={bullets.join('\n')} onCommit={(v) => ctx.setBullets(slide.key, v.split('\n').map(s => s.trim()).filter(Boolean))} />
          {slide.type !== 'cp_updates' && (
            <button type="button" disabled={ro || ctx.narrativeBusy} onClick={() => ctx.regenerateNarrative(slide.key)}
              className="mt-2 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full text-white disabled:opacity-50" style={{ background: '#0808f8' }}>
              {ctx.narrativeBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Write with Claude
            </button>
          )}
        </Field>
      )}

      {slide.type === 'cp_updates' && <CpGeneralUpdates slide={slide} ctx={ctx} ro={ro} />}

      {slide.type === 'custom' && (
        <Field label="Body">
          <TextInput multiline rows={6} disabled={ro} value={slide.vm.body} onCommit={(v) => ctx.setBody(slide.key, v)} />
        </Field>
      )}

      <div className="h-px bg-gray-100 my-5" />
      {[...(spec?.schema || []), ...COMMON_SCHEMA, ...(SPECS[slide.type]?.isEmpty ? [{ key: 'whenEmpty', type: 'segmented', label: 'If empty', options: [['hide', 'Skip'], ['celebrate', 'Show']] }] : [])]
        .filter((d, i, arr) => arr.findIndex(x => x.key === d.key) === i)
        .map(def => (
          <Field key={def.key} label={def.label}>
            <SchemaControl def={def} value={slide.options[def.key]} disabled={ro} onChange={(v) => ctx.setOption(slide.key, def.key, v)} />
          </Field>
        ))}

      <div className="h-px bg-gray-100 my-5" />
      <Field label="Speaker notes" hint="Only you see these (presenter console & N while presenting). Never on share links.">
        <TextInput multiline rows={5} disabled={ro} value={slide.notes} onCommit={(v) => ctx.setNotes(slide.key, v)} placeholder="What to say on this slide…" />
      </Field>
    </div>
  );
}

// ── Tickets tab ─────────────────────────────────────────────────────────────
function ticketsForSlide(slide, snapshot, overrides) {
  const S = snapshot.sections || {};
  if (!slide) return { title: 'All delivered', ids: S.delivered || [] };
  const dv = slide.options?.division;
  const inDiv = (ids) => (dv ? ids.filter(id => divisionOf(snapshot.items?.[id]) === dv) : ids);
  if (slide.type === 'division_next' || slide.type === 'planned_next') return { title: 'Planned this week', ids: inDiv(S.planned_next_week || []) };
  if (slide.type === 'division_overview') return { title: `${DIVISIONS[dv]?.label || ''} · delivered last week`, ids: inDiv(S.delivered || []) };
  if (slide.type === 'risks') return { title: 'At risk', ids: [...new Set([...(S.stuck || []), ...(S.overdue || []), ...(S.fixes || []), ...(S.reopened || [])])] };
  return { title: 'All delivered last week', ids: S.delivered || [] };
}

function Thumb({ it, media }) {
  const thumb = media.cover(it);
  return (
    <div className="w-11 h-12 rounded-lg overflow-hidden flex-none" style={{ background: it.product?.color || '#0a1445' }}>
      {thumb && <img src={thumb} alt="" className="w-full h-full object-contain" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
    </div>
  );
}

/** One ticket row: thumbnail + title, quick actions, and (expanded) caption / media / showcase. */
function TicketRow({ it, ctx, slideKey, extra, muted }) {
  const { overrides, media } = ctx;
  const ov = overrides.tickets?.[it.id] || {};
  const selected = ctx.selectedTicket === it.id;
  const ro = !ctx.editable;
  return (
    <div className={`rounded-xl border ${selected ? 'border-[#4a55ff] bg-[#4a55ff]/5' : 'border-gray-200'} ${ov.hidden || muted ? 'opacity-55' : ''}`}>
      <div className="flex gap-2.5 p-2 cursor-pointer items-center" onClick={() => ctx.setSelectedTicket(selected ? null : it.id)}>
        <Thumb it={it} media={media} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-gray-800 leading-tight line-clamp-2">{ov.caption || it.title}</div>
          <div className="text-[11px] text-gray-500 mt-0.5 truncate">
            {[divisionOf(it) === 'tv' ? 'TV' : null, it.product?.label !== '-' ? it.product?.label : null, it.delivered_at ? `Delivered ${shortDate(new Date(it.delivered_at).toISOString().slice(0, 10))}` : it.status?.label].filter(Boolean).join(' · ')}
          </div>
        </div>
        <div className="flex gap-0.5 flex-none" onClick={e => e.stopPropagation()}>
          {extra}
          <button type="button" disabled={ro} title="Highlight (★)" onClick={() => ctx.setTicket(it.id, { highlighted: !ov.highlighted })} className={`p-1 rounded ${ov.highlighted ? 'text-[#0808f8]' : 'text-gray-300 hover:text-gray-500'}`}><Star size={15} fill={ov.highlighted ? '#0808f8' : 'none'} /></button>
        </div>
      </div>
      {selected && (
        <div className="px-2 pb-2.5 flex flex-col gap-2">
          <TextInput value={ov.caption || ''} disabled={ro} placeholder={`Caption (default: ${it.title})`} onCommit={(v) => ctx.setTicket(it.id, { caption: v })} />
          <button type="button" disabled={ro || !it.media_refs?.length} onClick={() => ctx.openMediaPicker(it.id)}
            className="flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#030b2e] text-white disabled:opacity-40">
            <ImageIcon size={14} /> {it.media_refs?.length ? 'Choose images from Figma / Dropbox / Frame.io' : 'No Figma / Dropbox / Frame.io on this ticket'}
          </button>
          <div className="flex gap-2">
            <button type="button" disabled={ro} onClick={() => ctx.addShowcase(it.id, slideKey)} className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50"><Images size={13} /> Showcase slide</button>
            <button type="button" disabled={ro} title={ov.hidden ? 'Show everywhere' : 'Hide from the whole deck'} onClick={() => ctx.setTicket(it.id, { hidden: !ov.hidden })} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-600">{ov.hidden ? <Eye size={13} /> : <EyeOff size={13} />} {ov.hidden ? 'Unhide' : 'Hide'}</button>
          </div>
          {ov.cover && <button type="button" disabled={ro} onClick={() => ctx.setTicket(it.id, { cover: null, gallery: [] })} className="text-[11px] text-gray-500 hover:text-gray-800">Use automatic cover</button>}
          {it.monday_url && <a href={it.monday_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#0808f8] flex items-center gap-1"><Link2 size={11} /> Open in Monday</a>}
        </div>
      )}
    </div>
  );
}

function OrderBtns({ ro, onUp, onDown, onRemove }) {
  return (
    <>
      <button type="button" disabled={ro || !onUp} onClick={onUp} title="Move earlier" className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-25"><ArrowUp size={14} /></button>
      <button type="button" disabled={ro || !onDown} onClick={onDown} title="Move later" className="p-1 rounded text-gray-400 hover:text-gray-700 disabled:opacity-25"><ArrowDown size={14} /></button>
      <button type="button" disabled={ro} onClick={onRemove} title="Remove from this slide" className="p-1 rounded text-gray-400 hover:text-red-600"><Minus size={14} /></button>
    </>
  );
}

function AddBtn({ ro, onClick }) {
  return <button type="button" disabled={ro} onClick={onClick} title="Show on the slide" className="p-1 rounded text-[#0808f8] hover:bg-[#0808f8]/10"><Plus size={15} /></button>;
}

const Section = ({ title, children, right }) => (
  <div className="mb-4">
    <div className="flex items-center mb-2">
      <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">{title}</span>
      {right && <span className="ml-auto">{right}</span>}
    </div>
    <div className="flex flex-col gap-2">{children}</div>
  </div>
);

/** Person slides: hand-pick which projects to present and in what order (any number). */
function PersonProjects({ slide, ctx }) {
  const { snapshot, overrides } = ctx;
  const uid = slide.params.uid;
  const ro = !ctx.editable;
  const person = snapshot.people?.[uid];
  const cand = useMemo(() => personCandidates(snapshot, uid), [snapshot, uid]);
  const sel = overrides.people?.[uid]?.selection;
  const manual = Array.isArray(sel);
  const shown = personShown(snapshot, overrides, uid).ids;
  const base = manual ? sel.filter(id => snapshot.items?.[id]) : shown;
  const set = (ids) => ctx.setPersonSelection(uid, ids);
  const move = (id, d) => { const a = [...base]; const i = a.indexOf(id); const j = i + d; if (i < 0 || j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set(a); };
  const inSel = new Set(base);
  const groups = [['Delivered last week', cand.delivered], ['In progress', cand.active], ['Also worked on last week', cand.worked]]
    .map(([t, ids]) => [t, ids.filter(id => !inSel.has(id))]).filter(([, ids]) => ids.length);
  const personHidden = !!overrides.people?.[uid]?.hidden;
  const perPage = overrides.people?.[uid]?.perPage ?? slide.options.perPage ?? 8;
  return (
    <div>
      <div className="text-sm font-bold text-gray-900">{displayName(person?.name || '')}</div>
      <div className="text-[11px] text-gray-500 mb-3">{manual ? `Hand-picked · ${base.length} project${base.length === 1 ? '' : 's'}` : 'Automatic · everything delivered last week (★ first)'}</div>
      <button type="button" onClick={() => ctx.openProjectChooser(uid)}
        className="w-full mb-4 flex items-center justify-center gap-2 text-sm font-semibold px-3 py-2.5 rounded-xl text-white shadow-sm" style={{ background: '#0808f8' }}>
        <LayoutGrid size={15} /> Open the project chooser
      </button>
      <div className="flex gap-2 mb-3">
        {manual
          ? <button type="button" disabled={ro} onClick={() => set(null)} className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center gap-1.5"><RotateCcw size={13} /> Back to automatic</button>
          : <button type="button" disabled={ro} onClick={() => set(base)} className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg text-white flex items-center justify-center gap-1.5" style={{ background: '#0808f8' }}><ListChecks size={13} /> Pick projects</button>}
        <button type="button" disabled={ro} onClick={() => ctx.setPerson(uid, { hidden: !personHidden })} title={personHidden ? 'Show this person' : 'Hide this person'}
          className="text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5">{personHidden ? <UserCheck size={13} /> : <UserX size={13} />}</button>
      </div>
      <Field label="Projects per slide" hint="More projects than this continue on another slide.">
        <input type="number" min={1} max={12} value={perPage} disabled={ro} onKeyDown={e => e.stopPropagation()}
          onChange={e => ctx.setPerson(uid, { perPage: Math.max(1, Math.min(12, Number(e.target.value) || 1)) })}
          className="w-24 text-sm px-3 py-2 rounded-lg border border-gray-200" />
      </Field>
      <Section title={`On the slide · ${base.length}`}>
        {base.map((id, i) => {
          const it = decorate(snapshot, overrides, id);
          return <TicketRow key={id} it={it} ctx={ctx} slideKey={slide.key}
            extra={<OrderBtns ro={ro} onUp={i > 0 ? () => move(id, -1) : null} onDown={i < base.length - 1 ? () => move(id, 1) : null} onRemove={() => set(base.filter(x => x !== id))} />} />;
        })}
        {!base.length && <div className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-xl">Nothing on the slide — add projects below.</div>}
      </Section>
      {groups.map(([title, ids]) => (
        <Section key={title} title={`${title} · ${ids.length}`}>
          {ids.map(id => <TicketRow key={id} it={decorate(snapshot, overrides, id)} ctx={ctx} slideKey={slide.key} muted extra={<AddBtn ro={ro} onClick={() => set([...base, id])} />} />)}
        </Section>
      ))}
    </div>
  );
}

/** Production slides: which Monday tickets belong to this CP production (auto-matched, editable). */
function ProductionTickets({ slide, ctx }) {
  const { snapshot, overrides } = ctx;
  const [q, setQ] = useState('');
  const p = slide.vm.p;
  const ro = !ctx.editable;
  if (!p) return <div className="text-sm text-gray-400 text-center py-8">This production is no longer in the CP weekly.</div>;
  const pid = p.production_id;
  const pov = overrides.productions?.[pid] || {};
  const manual = Array.isArray(pov.tickets);
  const linked = slide.vm.tickets;
  const set = (ids) => ctx.setProduction(pid, { tickets: ids });
  const move = (id, d) => { const a = [...linked]; const i = a.indexOf(id); const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; set(a); };
  const inSel = new Set(linked);
  const needle = q.trim().toLowerCase();
  const results = Object.values(snapshot.items || {})
    .filter(it => !inSel.has(String(it.id)) && !inSel.has(it.id))
    .map(it => ({ it, score: productionMatchScore(p, it) }))
    .filter(x => (needle ? `${x.it.name || ''} ${x.it.title} ${x.it.campaign || ''} ${x.it.product?.label || ''}`.toLowerCase().includes(needle) : x.score > 0))
    .sort((a, b) => (b.score - a.score) || (Number(divisionOf(b.it) === 'tv') - Number(divisionOf(a.it) === 'tv')) || ((b.it.delivered_at || 0) - (a.it.delivered_at || 0)))
    .slice(0, 30);
  return (
    <div>
      <div className="text-sm font-bold text-gray-900 leading-tight">{p.name}</div>
      <div className="text-[11px] text-gray-500 mb-3">{p.production_id} · {manual ? 'Tickets picked by you' : 'Tickets matched automatically by name'}</div>
      <div className="flex gap-2 mb-4">
        {manual && <button type="button" disabled={ro} onClick={() => set(null)} className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center gap-1.5"><RotateCcw size={13} /> Back to auto-match</button>}
        <button type="button" disabled={ro} onClick={() => ctx.setProduction(pid, { hidden: !pov.hidden })}
          className="flex-1 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 flex items-center justify-center gap-1.5">
          {pov.hidden ? <Eye size={13} /> : <EyeOff size={13} />} {pov.hidden ? 'Bring back into the deck' : 'Leave out of this deck'}
        </button>
      </div>
      <CpWeeklyEntry p={p} ctx={ctx} ro={ro} />
      <ProductionMedia slide={slide} ctx={ctx} p={p} pov={pov} ro={ro} />
      {(pov.show || (pov.media?.refId ? 'media' : 'tickets')) === 'tickets' && <>
      <Section title={`Linked TV tickets · ${linked.length}`}>
        {linked.map((id, i) => (
          <TicketRow key={id} it={decorate(snapshot, overrides, id)} ctx={ctx} slideKey={slide.key}
            extra={<OrderBtns ro={ro} onUp={i > 0 ? () => move(id, -1) : null} onDown={i < linked.length - 1 ? () => move(id, 1) : null} onRemove={() => set(linked.filter(x => x !== id))} />} />
        ))}
        {!linked.length && <div className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-xl">No Monday tickets linked — search below.</div>}
      </Section>
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.stopPropagation()} placeholder="Search Monday tickets to link" className="w-full text-sm pl-8 pr-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#4a55ff]" />
      </div>
      <Section title={needle ? `Results · ${results.length}` : 'Suggested'}>
        {results.map(({ it }) => <TicketRow key={it.id} it={decorate(snapshot, overrides, it.id)} ctx={ctx} slideKey={slide.key} muted extra={<AddBtn ro={ro} onClick={() => set([...linked, String(it.id)])} />} />)}
        {!results.length && <div className="text-xs text-gray-400 py-2">{needle ? 'No matching tickets.' : 'No close matches — search by campaign or product.'}</div>}
      </Section>
      </>}
    </div>
  );
}

const cpWeekLabel = (ctx) => (ctx.snapshot.cp_weekly?.week_start ? shortDate(ctx.snapshot.cp_weekly.week_start) : 'next week');
const inputCls = 'w-full min-w-0 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 outline-none focus:border-[#4a55ff] disabled:bg-gray-50';

/** Rows of { id, …fields } with add / remove — used for bullets, links and general updates. */
function RowsEditor({ rows, setRows, fields, addLabel, ro }) {
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((r, i) => (
        <div key={r.id || `n${i}`} className="flex items-start gap-1.5">
          <div className="flex-1 min-w-0 flex flex-col gap-1">
            {fields.map(f => (
              f.multiline
                ? <textarea key={f.key} rows={2} disabled={ro} value={r[f.key] || ''} placeholder={f.placeholder} onKeyDown={e => e.stopPropagation()}
                  onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))} className={`${inputCls} resize-y`} dir="auto" />
                : <input key={f.key} disabled={ro} value={r[f.key] || ''} placeholder={f.placeholder} onKeyDown={e => e.stopPropagation()}
                  onChange={e => setRows(rows.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))} className={inputCls} dir={f.key === 'text' || f.key === 'title' ? 'auto' : undefined} />
            ))}
          </div>
          <button type="button" disabled={ro} onClick={() => setRows(rows.filter((_, j) => j !== i))} className="p-1.5 mt-0.5 rounded-md text-gray-400 hover:text-red-600" title="Remove"><Trash2 size={13} /></button>
        </div>
      ))}
      <button type="button" disabled={ro} onClick={() => setRows([...rows, Object.fromEntries([['id', null], ...fields.map(f => [f.key, ''])])])}
        className="self-start text-[11px] font-semibold text-[#0808f8] flex items-center gap-1 px-1 py-0.5"><Plus size={12} /> {addLabel}</button>
    </div>
  );
}

function SaveBar({ dirty, busy, ro, onSave, onCancel, note }) {
  return (
    <div className="flex items-center gap-2 mt-2">
      <button type="button" disabled={ro || busy || !dirty} onClick={onSave} className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-40 flex items-center gap-1.5" style={{ background: '#0808f8' }}>
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save to CP weekly
      </button>
      {dirty && !busy && <button type="button" onClick={onCancel} className="text-xs font-semibold text-gray-500 px-2">Cancel</button>}
      <span className="text-[10px] text-gray-400 ml-auto">{note}</span>
    </div>
  );
}

/** A production's update in the CP weekly — edited here, saved back so the old Weekly shows the same. */
function CpWeeklyEntry({ p, ctx, ro }) {
  const init = () => ({
    long_text: p.note || '',
    bullets: (p.bullets || []).map(b => ({ id: b.id, text: b.text, link: b.link || '' })),
    links: (p.links || []).map(l => ({ id: l.id, title: l.title, url: l.url })),
  });
  const [d, setD] = useState(init);
  const [busy, setBusy] = useState(false);
  const sig = JSON.stringify([p.production_id, p.note, p.bullets, p.links]);
  useEffect(() => { setD(init()); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(d) !== JSON.stringify(init());
  const save = async () => { setBusy(true); await ctx.saveCpWeekly({ production: { production_id: p.production_id, ...d } }); setBusy(false); };
  return (
    <Section title={`Weekly update · CP weekly of ${cpWeekLabel(ctx)}`}>
      <div className="flex flex-col gap-2.5">
        <textarea rows={3} disabled={ro} value={d.long_text} onKeyDown={e => e.stopPropagation()} onChange={e => setD({ ...d, long_text: e.target.value })}
          placeholder="Notes" className={`${inputCls} resize-y`} dir="auto" />
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Bullets</div>
          <RowsEditor rows={d.bullets} setRows={(bullets) => setD({ ...d, bullets })} ro={ro} addLabel="Add bullet"
            fields={[{ key: 'text', placeholder: 'What happened' }, { key: 'link', placeholder: 'Link (optional) — https://…' }]} />
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">Links</div>
          <RowsEditor rows={d.links} setRows={(links) => setD({ ...d, links })} ro={ro} addLabel="Add link"
            fields={[{ key: 'title', placeholder: 'Title' }, { key: 'url', placeholder: 'https://…' }]} />
        </div>
        <SaveBar dirty={dirty} busy={busy} ro={ro} onSave={save} onCancel={() => setD(init())} note="Also updates the old Weekly" />
      </div>
    </Section>
  );
}

/** The CP weekly's general updates — edited here, saved back to the old Weekly. */
function CpGeneralUpdates({ slide, ctx, ro }) {
  const source = ctx.snapshot.cp_weekly?.general_updates || [];
  const init = () => source.map(u => ({ id: u.id, text: u.text || '', link: u.link || '', file: u.file || null }));
  const [rows, setRows] = useState(init);
  const [busy, setBusy] = useState(false);
  const sig = JSON.stringify(source);
  useEffect(() => { setRows(init()); }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(rows) !== JSON.stringify(init());
  const custom = Array.isArray(ctx.overrides?.slides?.[slide.key]?.bullets);
  const save = async () => { setBusy(true); await ctx.saveCpWeekly({ general_updates: rows.map(({ id, text, link }) => ({ id, text, link })) }); setBusy(false); };
  return (
    <Field label={`General updates · CP weekly of ${cpWeekLabel(ctx)}`}>
      {custom && (
        <div className="mb-2 text-[11px] px-2.5 py-2 rounded-lg bg-amber-50 text-amber-800 flex items-center gap-2">
          This deck shows its own text for this slide.
          <button type="button" disabled={ro} onClick={() => ctx.resetSlide(slide.key)} className="font-semibold underline ml-auto">Use the CP weekly</button>
        </div>
      )}
      <RowsEditor rows={rows} setRows={setRows} ro={ro} addLabel="Add update"
        fields={[{ key: 'text', placeholder: 'Update', multiline: true }, { key: 'link', placeholder: 'Link (optional) — https://…' }]} />
      {rows.some(r => r.file) && <div className="text-[10px] text-gray-400 mt-1">Files attached in the old Weekly stay as they are.</div>}
      <SaveBar dirty={dirty} busy={busy} ro={ro} onSave={save} onCancel={() => setRows(init())} note="Also updates the old Weekly" />
    </Field>
  );
}

/** What fills the right side of a production slide: TV tickets, a video / image (Frame.io or Dropbox), or nothing. */
function ProductionMedia({ slide, ctx, p, pov, ro }) {
  const pid = p.production_id;
  const show = pov.show || (pov.media?.refId ? 'media' : 'tickets');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [pick, setPick] = useState(null); // { refId, entries }
  const cur = pov.media;
  // Links the producer already put in the CP weekly, and the linked TV tickets' Frame.io / Dropbox
  const suggestions = [
    ...(p.bullets || []).filter(b => b.link).map(b => ({ url: b.link, label: b.text })),
    ...(p.links || []).map(l => ({ url: l.url, label: l.title })),
    ...(slide.vm.linked || []).flatMap(id => {
      const it = ctx.snapshot.items?.[id];
      return [it?.links?.frame, it?.links?.dropbox].filter(Boolean).map(u => ({ url: u, label: it.title || it.name }));
    }),
  ].filter((s, i, a) => /frame\.io|f\.io|dropbox\.com/i.test(s.url) && a.findIndex(x => x.url === s.url) === i).slice(0, 6);
  const choose = (refId, e) => { ctx.setProduction(pid, { show: 'media', media: { refId, key: e.key, kind: e.kind === 'video' ? 'video' : 'image', name: e.name } }); setPick(null); };
  const add = async (link) => {
    setBusy(true); setErr(null);
    try {
      const r = await ctx.addLinkMedia(link);
      const usable = (r.entries || []).filter(e => e.kind === 'video' || e.kind === 'image');
      if (r.error && !usable.length) setErr(r.error);
      else if (usable.length === 1) choose(r.refId, usable[0]);
      else if (usable.length) setPick({ refId: r.refId, entries: usable });
      else setErr('No video or image found at that link');
      setUrl('');
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const Opt = ({ k, icon: Icon, label }) => (
    <button type="button" disabled={ro} onClick={() => ctx.setProduction(pid, { show: k })}
      className={`flex-1 text-[11px] font-semibold px-2 py-1.5 rounded-lg flex items-center justify-center gap-1 ${show === k ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}><Icon size={12} /> {label}</button>
  );
  return (
    <Section title="Right side of the slide">
      <div className="flex p-1 rounded-xl bg-gray-100 mb-3">
        <Opt k="tickets" icon={Clapperboard} label="TV tickets" />
        <Opt k="media" icon={Film} label="Video / image" />
        <Opt k="none" icon={Ban} label="Nothing" />
      </div>
      {show === 'media' && (
        <div className="flex flex-col gap-2.5">
          {cur?.refId && (
            <div className="flex items-center gap-2 rounded-xl border border-gray-200 p-2">
              <div className="w-16 h-10 rounded-lg bg-gray-900 overflow-hidden flex-none">
                <img src={ctx.media.ref(cur.refId, cur.key, 'thumb')} alt="" className="w-full h-full object-cover" onError={(ev) => { ev.currentTarget.style.display = 'none'; }} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-gray-900 truncate">{cur.name || (cur.kind === 'video' ? 'Video' : 'Image')}</div>
                <div className="text-[11px] text-gray-500">{cur.kind === 'video' ? 'Plays muted on the slide' : 'Shown uncropped'}</div>
              </div>
              <button type="button" disabled={ro} onClick={() => ctx.setProduction(pid, { media: null })} className="p-1.5 rounded-md text-gray-400 hover:text-red-600" title="Remove"><Trash2 size={13} /></button>
            </div>
          )}
          {pick && (
            <div className="grid grid-cols-3 gap-1.5">
              {pick.entries.slice(0, 12).map(e => (
                <button key={e.key} type="button" onClick={() => choose(pick.refId, e)} className="relative rounded-lg overflow-hidden border border-gray-200 hover:border-[#0808f8] aspect-video bg-gray-900" title={e.name}>
                  <img src={ctx.media.ref(pick.refId, e.key, 'thumb')} alt="" className="w-full h-full object-cover" onError={(ev) => { ev.currentTarget.style.display = 'none'; }} />
                  <span className="absolute bottom-0 inset-x-0 text-[9px] text-white bg-black/50 px-1 truncate">{e.kind === 'video' ? '▶ ' : ''}{e.name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter' && url.trim()) add(url.trim()); }}
              disabled={ro || busy} placeholder="Paste a Frame.io or Dropbox link" className="flex-1 min-w-0 text-xs px-2.5 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#4a55ff]" />
            <button type="button" disabled={ro || busy || !url.trim()} onClick={() => add(url.trim())} className="text-xs font-semibold px-3 rounded-lg text-white disabled:opacity-40" style={{ background: '#0808f8' }}>
              {busy ? <Loader2 size={13} className="animate-spin" /> : 'Add'}
            </button>
          </div>
          {err && <div className="text-[11px] text-red-600">{err}</div>}
          {suggestions.length > 0 && (
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1">From the CP weekly and TV tickets</div>
              {suggestions.map(s => (
                <button key={s.url} type="button" disabled={ro || busy} onClick={() => add(s.url)}
                  className="w-full text-left text-xs px-2 py-1.5 rounded-lg hover:bg-gray-50 flex items-center gap-1.5 text-gray-700">
                  <Link2 size={12} className="text-gray-400 flex-none" /><span className="truncate">{s.label || s.url}</span>
                </button>
              ))}
            </div>
          )}
          <p className="text-[11px] text-gray-400">Until you add one, the slide shows a placeholder while editing; when presenting, the production details take the full width.</p>
        </div>
      )}
    </Section>
  );
}

/** Showcase slide: pick the project, then the images (Figma / Dropbox / Frame.io). */
function ShowcasePick({ slide, ctx }) {
  const { snapshot, overrides, media } = ctx;
  const [q, setQ] = useState('');
  const ro = !ctx.editable;
  const current = slide.vm.item;
  const S = snapshot.sections || {};
  const pool = [...new Set([...(S.delivered || []), ...(S.review || []), ...(S.in_progress || []), ...(S.fixes || [])])];
  const needle = q.trim().toLowerCase();
  const list = pool.map(id => snapshot.items?.[id]).filter(Boolean)
    .filter(it => !needle || `${it.title} ${it.subtitle || ''} ${it.product?.label || ''}`.toLowerCase().includes(needle)).slice(0, 40);
  return (
    <div>
      {current ? (
        <div className="mb-4">
          <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Showcasing</div>
          <TicketRow it={current} ctx={ctx} slideKey={slide.key} />
          <button type="button" disabled={ro || !current.media_refs?.length} onClick={() => ctx.openMediaPicker(current.id)}
            className="mt-2 w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg text-white disabled:opacity-40" style={{ background: '#0808f8' }}>
            <ImageIcon size={14} /> Choose the gallery images
          </button>
          <p className="text-[11px] text-gray-400 mt-1.5">Cover + up to 5 gallery images show on the slide, uncropped.</p>
        </div>
      ) : <div className="text-sm text-gray-600 mb-3">Pick the project to showcase:</div>}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.stopPropagation()} placeholder="Search projects" className="w-full text-sm pl-8 pr-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#4a55ff]" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {list.map(it => (
          <button key={it.id} type="button" disabled={ro} onClick={() => ctx.setShowcaseItem(slide.key, it.id)} title={it.title}
            className={`rounded-lg overflow-hidden border-2 text-left ${current?.id === it.id ? 'border-[#0808f8]' : 'border-transparent hover:border-gray-300'}`}>
            <div className="aspect-[4/5] bg-gray-100" style={{ background: it.product?.color || '#0a1445' }}>
              {media.cover(it) && <img src={media.cover(it)} alt="" loading="lazy" className="w-full h-full object-contain" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
            </div>
            <div className="px-1.5 py-1 text-[10px] text-gray-600 truncate bg-white">{it.title}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function TicketsTab({ slide, ctx }) {
  if (slide?.type === 'person') return <PersonProjects slide={slide} ctx={ctx} />;
  if (slide?.type === 'production') return <ProductionTickets slide={slide} ctx={ctx} />;
  if (slide?.type === 'showcase') return <ShowcasePick slide={slide} ctx={ctx} />;
  return <GenericTickets slide={slide} ctx={ctx} />;
}

function GenericTickets({ slide, ctx }) {
  const { snapshot, overrides } = ctx;
  const [q, setQ] = useState('');
  const scope = useMemo(() => ticketsForSlide(slide, snapshot, overrides), [slide, snapshot, overrides]);
  const list = scope.ids
    .map(id => snapshot.items?.[id] ? decorate(snapshot, overrides, id) : null).filter(Boolean)
    .filter(it => !q || `${it.title} ${it.subtitle} ${it.product?.label}`.toLowerCase().includes(q.toLowerCase()));
  const ro = !ctx.editable;
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">{scope.title} · {list.length}</div>
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.stopPropagation()} placeholder="Search tickets" className="w-full text-sm pl-8 pr-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#4a55ff]" />
      </div>
      <div className="flex flex-col gap-2">
        {list.map(it => {
          const ov = overrides.tickets?.[it.id] || {};
          return <TicketRow key={it.id} it={it} ctx={ctx} slideKey={slide?.key}
            extra={<button type="button" disabled={ro} title={ov.hidden ? 'Show in deck' : 'Hide from deck'} onClick={() => ctx.setTicket(it.id, { hidden: !ov.hidden })} className="p-1 rounded text-gray-300 hover:text-gray-500">{ov.hidden ? <Eye size={15} /> : <EyeOff size={15} />}</button>} />;
        })}
        {!list.length && <div className="text-sm text-gray-400 text-center py-8">No tickets here.</div>}
      </div>
    </div>
  );
}

// ── Deck tab ────────────────────────────────────────────────────────────────
function DeckTab({ ctx }) {
  const ro = !ctx.editable;
  const tpl = ctx.template?.slides || [];
  return (
    <div>
      {ctx.cpStale && (
        <div className="mb-4 p-3 rounded-xl bg-amber-50 text-amber-900 text-xs">
          <div className="flex items-center gap-1.5 font-semibold"><AlertTriangle size={13} /> The CP weekly changed after this deck was built.</div>
          <button type="button" disabled={ro} onClick={ctx.reimportWeekly} className="mt-2 flex items-center gap-1 font-semibold underline"><RefreshCw size={12} /> Re-import productions & updates</button>
        </div>
      )}
      <Field label="Executive summary & per-person lines" hint={ctx.report?.narrative?.generated_at ? `Last written ${relTime(ctx.report.narrative.generated_at)}` : 'Not written yet'}>
        <button type="button" disabled={ro || ctx.narrativeBusy} onClick={() => ctx.regenerateNarrative()}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-full text-white disabled:opacity-50" style={{ background: '#0808f8' }}>
          {ctx.narrativeBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} {ctx.report?.narrative ? 'Rewrite with Claude' : 'Write with Claude'}
        </button>
      </Field>
      <Field label="Share link shows source links" hint="Monday / Dropbox / Frame.io / Figma chips on the CEO link. Off by default.">
        <SchemaControl def={{ type: 'toggle' }} value={!!ctx.overrides.share?.show_links} disabled={ro} onChange={(v) => ctx.setShareLinks(v)} />
      </Field>
      <div className="h-px bg-gray-100 my-5" />
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">Template — slides in this deck</div>
      <div className="flex flex-col gap-1 mb-3">
        {tpl.map(s => (
          <label key={s.id} className="flex items-center gap-2 text-sm py-1.5 px-2 rounded-lg hover:bg-gray-50">
            <input type="checkbox" disabled={ro} checked={s.enabled !== false} onChange={(e) => ctx.setTemplateEnabled(s.id, e.target.checked)} />
            <span className="flex-1">{s.type === 'section' ? `Section · ${s.options?.title || ''}` : SPECS[s.type]?.label || s.type}</span>
            {s.repeat && <span className="text-[10px] text-gray-400">per person</span>}
          </label>
        ))}
      </div>
      <button type="button" onClick={ctx.saveAsTemplate} disabled={ctx.templateBusy}
        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">
        {ctx.templateBusy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save structure as the default template
      </button>
      <p className="text-[11px] text-gray-400 mt-1.5">Future weeks start from this slide order, options and toggles. Week-specific text and curation aren’t saved into the template.</p>
      <div className="h-px bg-gray-100 my-5" />
      <button type="button" disabled={ro} onClick={ctx.resetAll} className="text-xs text-red-600 hover:underline">Reset all edits for this week…</button>
    </div>
  );
}

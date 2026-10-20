import { useMemo, useState } from 'react';
import {
  Star, EyeOff, Eye, ImageIcon, RotateCcw, Trash2, Sparkles, Loader2, Search, Link2, Save, RefreshCw, UserX, UserCheck, AlertTriangle,
} from 'lucide-react';
import { SPECS, COMMON_SCHEMA, decorate, personTickets } from '../slides/specs';
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
  const hasBullets = ['exec_summary', 'cp_updates', 'closing'].includes(slide.type);
  const bullets = slide.type === 'exec_summary' ? slide.vm.bullets : slide.type === 'closing' ? slide.vm.bullets : (slide.vm.updates || []).map(u => u.text);
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
        <div className="mb-4 text-xs px-3 py-2 rounded-lg bg-amber-50 text-amber-800">This slide has no data this week, so it’s skipped when presenting. Set “If empty” below to show it anyway.</div>
      )}

      {(spec?.textSlots || []).map(slot => (
        <Field key={slot} label={slot === 'eyebrow' ? 'Eyebrow' : slot === 'title' ? 'Title' : 'Subtitle'}>
          <TextInput value={slide.text[slot]} disabled={ro} multiline={slot === 'subtitle'} rows={2}
            placeholder={slide.generatedText?.[slot] || ''} onCommit={(v) => ctx.setText(slide.key, slot, v)} />
        </Field>
      ))}

      {hasBullets && (
        <Field label={slide.type === 'cp_updates' ? 'Updates (one per line)' : 'Bullets (one per line)'}
          hint={slide.type === 'exec_summary' && slide.vm.source !== 'edited' ? (slide.vm.source === 'ai' ? 'Written by Claude — editing locks your version.' : 'Auto-written from the data. Use “Write with Claude” for a sharper summary.') : null}>
          <TextInput multiline rows={6} disabled={ro} value={bullets.join('\n')} onCommit={(v) => ctx.setBullets(slide.key, v.split('\n').map(s => s.trim()).filter(Boolean))} />
          {slide.type !== 'cp_updates' && (
            <button type="button" disabled={ro || ctx.narrativeBusy} onClick={() => ctx.regenerateNarrative(slide.key)}
              className="mt-2 flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full text-white disabled:opacity-50" style={{ background: '#0808f8' }}>
              {ctx.narrativeBusy ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Write with Claude
            </button>
          )}
        </Field>
      )}

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
  if (!slide) return { title: 'All delivered', ids: snapshot.sections?.delivered || [] };
  if (slide.type === 'person') {
    const t = personTickets(snapshot, { ...overrides, tickets: Object.fromEntries(Object.entries(overrides.tickets || {}).map(([k, v]) => [k, { ...v, hidden: false }])) }, slide.params.uid);
    return { title: `${displayName(snapshot.people?.[slide.params.uid]?.name || '')}’s tickets`, ids: [...t.delivered, ...t.current], uid: slide.params.uid };
  }
  if (slide.type === 'planned_next') return { title: 'Planned next week', ids: snapshot.sections?.planned_next_week || [] };
  if (slide.type === 'risks') return { title: 'At risk', ids: [...new Set([...(snapshot.sections?.stuck || []), ...(snapshot.sections?.overdue || []), ...(snapshot.sections?.fixes || []), ...(snapshot.sections?.reopened || [])])] };
  return { title: 'All delivered this week', ids: snapshot.sections?.delivered || [] };
}

function TicketsTab({ slide, ctx }) {
  const { snapshot, overrides, media } = ctx;
  const [q, setQ] = useState('');
  const scope = useMemo(() => ticketsForSlide(slide, snapshot, overrides), [slide, snapshot, overrides]);
  const list = scope.ids
    .map(id => snapshot.items?.[id] ? decorate(snapshot, overrides, id) : null).filter(Boolean)
    .filter(it => !q || `${it.title} ${it.subtitle} ${it.product?.label}`.toLowerCase().includes(q.toLowerCase()));
  const ro = !ctx.editable;
  const personHidden = scope.uid ? !!overrides.people?.[scope.uid]?.hidden : false;
  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">{scope.title} · {list.length}</div>
      {scope.uid && (
        <button type="button" disabled={ro} onClick={() => ctx.setPerson(scope.uid, { hidden: !personHidden })}
          className="w-full mb-3 flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">
          {personHidden ? <UserCheck size={14} /> : <UserX size={14} />} {personHidden ? 'Show this person in the deck' : 'Hide this person from the deck'}
        </button>
      )}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.stopPropagation()} placeholder="Search tickets" className="w-full text-sm pl-8 pr-3 py-2 rounded-lg border border-gray-200 outline-none focus:border-[#4a55ff]" />
      </div>
      <div className="flex flex-col gap-2">
        {list.map(it => {
          const ov = overrides.tickets?.[it.id] || {};
          const selected = ctx.selectedTicket === it.id;
          const thumb = media.cover(it);
          return (
            <div key={it.id} className={`rounded-xl border ${selected ? 'border-[#4a55ff] bg-[#4a55ff]/5' : 'border-gray-200'} ${ov.hidden ? 'opacity-50' : ''}`}>
              <div className="flex gap-2.5 p-2 cursor-pointer" onClick={() => ctx.setSelectedTicket(selected ? null : it.id)}>
                <div className="w-12 h-14 rounded-lg overflow-hidden flex-none" style={{ background: it.product?.color || '#0a1445' }}>
                  {thumb && <img src={thumb} alt="" className="w-full h-full object-cover" loading="lazy" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-gray-800 leading-tight line-clamp-2">{ov.caption || it.title}</div>
                  <div className="text-[11px] text-gray-500 mt-0.5 truncate">{[it.product?.label !== '-' ? it.product?.label : null, it.delivered_at ? `Delivered ${shortDate(new Date(it.delivered_at).toISOString().slice(0, 10))}` : it.status?.label].filter(Boolean).join(' · ')}</div>
                </div>
                <div className="flex flex-col gap-1 flex-none" onClick={e => e.stopPropagation()}>
                  <button type="button" disabled={ro} title="Highlight (★)" onClick={() => ctx.setTicket(it.id, { highlighted: !ov.highlighted })} className={`p-1 rounded ${ov.highlighted ? 'text-[#0808f8]' : 'text-gray-300 hover:text-gray-500'}`}><Star size={15} fill={ov.highlighted ? '#0808f8' : 'none'} /></button>
                  <button type="button" disabled={ro} title={ov.hidden ? 'Show in deck' : 'Hide from deck'} onClick={() => ctx.setTicket(it.id, { hidden: !ov.hidden })} className="p-1 rounded text-gray-300 hover:text-gray-500">{ov.hidden ? <Eye size={15} /> : <EyeOff size={15} />}</button>
                </div>
              </div>
              {selected && (
                <div className="px-2 pb-2.5 flex flex-col gap-2">
                  <TextInput value={ov.caption || ''} disabled={ro} placeholder={`Caption (default: ${it.title})`} onCommit={(v) => ctx.setTicket(it.id, { caption: v })} />
                  <button type="button" disabled={ro || !it.media_refs?.length} onClick={() => ctx.openMediaPicker(it.id)}
                    className="flex items-center justify-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg bg-[#030b2e] text-white disabled:opacity-40">
                    <ImageIcon size={14} /> {it.media_refs?.length ? 'Choose cover & files' : 'No Dropbox / Frame.io / files on this ticket'}
                  </button>
                  {ov.cover && <button type="button" disabled={ro} onClick={() => ctx.setTicket(it.id, { cover: null, gallery: [] })} className="text-[11px] text-gray-500 hover:text-gray-800">Use automatic cover</button>}
                  {it.monday_url && <a href={it.monday_url} target="_blank" rel="noopener noreferrer" className="text-[11px] text-[#0808f8] flex items-center gap-1"><Link2 size={11} /> Open in Monday</a>}
                </div>
              )}
            </div>
          );
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

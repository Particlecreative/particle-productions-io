import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, useSortable, horizontalListSortingStrategy, arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { X, Check, Star, ImageIcon, Images, Search, Play, EyeOff, RotateCcw, Film, PenTool, ArrowRight, GripVertical } from 'lucide-react';
import { personCandidates, divisionOf } from '../slides/divisions';
import { personShown, decorate } from '../slides/specs';
import { displayName, shortDate, formatBadge, ensureContrast } from '../deck/format';

const PER_PAGE = [4, 6, 8, 10, 12];
const ROLES = [['design', 'Design', PenTool], ['video', 'Video', Film]];

function Avatar({ person, size = 36 }) {
  const [failed, setFailed] = useState(false);
  const initials = displayName(person?.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className="rounded-full overflow-hidden flex items-center justify-center flex-none font-bold text-white" style={{ width: size, height: size, fontSize: size * 0.36, background: 'linear-gradient(135deg,#0808f8,#4a55ff)' }}>
      {person?.photo && !failed ? <img src={person.photo} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : initials}
    </span>
  );
}

function Thumb({ it, media, className = '' }) {
  const src = media.cover(it);
  const [ok, setOk] = useState(true);
  return (
    <div className={`relative overflow-hidden bg-[#0a1445] ${className}`}>
      {src && ok && <img src={src} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover scale-125 blur-xl opacity-50" onError={() => setOk(false)} />}
      {src && ok
        ? <img src={src} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-contain" onError={() => setOk(false)} />
        : <div className="absolute inset-0 flex items-center justify-center" style={{ background: `radial-gradient(120% 90% at 20% 10%, ${it.product?.color || '#4a55ff'}88, transparent 60%), #0a1445` }}>
          {it.board === 'video' ? <Film size={26} className="text-white/70" /> : <PenTool size={26} className="text-white/70" />}
        </div>}
    </div>
  );
}

/** One chosen project in the "on the slide" strip — drag to reorder. */
function SortableChip({ id, index, it, media, onRemove, disabled }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id, disabled });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, zIndex: isDragging ? 5 : undefined }}
      className={`relative flex-none w-[92px] rounded-lg overflow-hidden ring-1 ring-gray-200 bg-white ${isDragging ? 'shadow-xl ring-[#0808f8]' : ''}`}>
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing" title="Drag to reorder">
        <Thumb it={it} media={media} className="aspect-[4/5]" />
        <span className="absolute top-1 left-1 w-5 h-5 rounded-full bg-[#0808f8] text-white text-[10px] font-bold flex items-center justify-center">{index + 1}</span>
        <span className="absolute bottom-1 left-1 text-white/80"><GripVertical size={12} /></span>
      </div>
      {!disabled && (
        <button type="button" onClick={onRemove} title="Remove from the slide"
          className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 hover:bg-red-600 text-white flex items-center justify-center"><X size={11} /></button>
      )}
      <div className="px-1.5 py-1 text-[10px] font-medium text-gray-700 truncate">{it.caption || it.title}</div>
    </div>
  );
}

function ProjectCard({ it, media, selectedIndex, onToggle, ov, ro, onStar, onImages, onShowcase }) {
  const sel = selectedIndex >= 0;
  const badge = formatBadge(it);
  const product = it.product?.label && it.product.label !== '-' ? it.product.label : null;
  const sub = it.delivered_at ? `Delivered ${shortDate(new Date(it.delivered_at).toISOString().slice(0, 10))}` : it.status?.label;
  return (
    <div role="button" tabIndex={0} aria-pressed={sel}
      onClick={ro ? undefined : onToggle}
      onKeyDown={(e) => { if (!ro && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onToggle(); } }}
      className={`group relative rounded-xl overflow-hidden bg-white text-left outline-none transition-shadow ${ro ? '' : 'cursor-pointer'} ${sel ? 'ring-[3px] ring-[#0808f8] shadow-lg shadow-[#0808f8]/15' : 'ring-1 ring-gray-200 hover:ring-gray-400 focus-visible:ring-2 focus-visible:ring-[#4a55ff]'}`}>
      <div className="relative">
        <Thumb it={it} media={media} className="aspect-[4/5]" />
        <span className={`absolute top-2 left-2 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${sel ? 'bg-[#0808f8] text-white' : 'bg-white/85 text-transparent group-hover:text-gray-400 border border-white'}`}>
          {sel ? selectedIndex + 1 : <Check size={14} />}
        </span>
        <span className="absolute bottom-2 left-2 flex gap-1">
          {badge && <span className="px-1.5 py-0.5 rounded bg-black/65 text-white text-[10px] font-bold">{badge}</span>}
          {divisionOf(it) === 'tv' && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: '#ff8a3d', color: '#1a0b00' }}>TV</span>}
          {it.board === 'video' && <span className="px-1.5 py-0.5 rounded bg-black/65 text-white"><Play size={10} fill="#fff" /></span>}
        </span>
        {ov.hidden && <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 mx-3 text-center text-[11px] font-semibold py-1 rounded bg-black/70 text-white flex items-center justify-center gap-1"><EyeOff size={11} /> Hidden from the deck</span>}
        {!ro && (
          <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
            <IconBtn title={ov.highlighted ? 'Remove star' : 'Star — shows first'} on={ov.highlighted} onClick={onStar}><Star size={13} fill={ov.highlighted ? '#fff' : 'none'} /></IconBtn>
            <IconBtn title="Choose images (Figma / Dropbox / Frame.io)" onClick={onImages} disabled={!it.media_refs?.length}><ImageIcon size={13} /></IconBtn>
            <IconBtn title="Make a showcase slide" onClick={onShowcase}><Images size={13} /></IconBtn>
          </div>
        )}
        {ov.highlighted && <span className="absolute top-2 right-2 group-hover:opacity-0 w-6 h-6 rounded-full bg-[#4a55ff] flex items-center justify-center"><Star size={12} color="#fff" fill="#fff" /></span>}
      </div>
      <div className="px-2.5 pt-2 pb-2.5">
        <div className="text-[13px] font-semibold text-gray-900 leading-snug line-clamp-2 min-h-[2.4em]">{ov.caption || it.title}</div>
        <div className="mt-1 text-[11px] text-gray-500 flex items-center gap-1.5 min-w-0">
          {product && <span className="w-2 h-2 rounded-full flex-none" style={{ background: ensureContrast(it.product?.color || '#8c93ff', '#ffffff', 2) }} />}
          <span className="truncate">{[product, sub].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ children, onClick, title, on, disabled }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onClick={onClick}
      className={`w-7 h-7 rounded-full flex items-center justify-center shadow disabled:opacity-40 ${on ? 'bg-[#0808f8] text-white' : 'bg-white text-gray-700 hover:bg-gray-100'}`}>
      {children}
    </button>
  );
}

/**
 * Full-screen picker: every designer and video editor in one place. Click projects to put them
 * on the person's slides (in click order), drag to reorder, choose how many per slide.
 * Edits apply live (autosave + undo), like everything else in the editor.
 */
export default function ProjectChooser({ ctx, slides, initialUid, onClose, onShowSlide }) {
  const { snapshot, overrides, media } = ctx;
  const ro = !ctx.editable;
  const people = useMemo(() => {
    const bp = snapshot.metrics?.by_person || {};
    return ROLES.map(([role, label, Icon]) => ({
      role, label, Icon,
      list: Object.values(snapshot.people || {}).filter(p => p.role === role)
        .sort((a, b) => ((bp[b.id]?.delivered || 0) - (bp[a.id]?.delivered || 0)) || a.name.localeCompare(b.name)),
    })).filter(g => g.list.length);
  }, [snapshot]);
  const firstUid = people[0]?.list[0]?.id;
  const [uid, setUid] = useState(initialUid && snapshot.people?.[initialUid] ? initialUid : firstUid);
  const [q, setQ] = useState('');
  const [product, setProduct] = useState(null);
  useEffect(() => { setQ(''); setProduct(null); }, [uid]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !document.querySelector('[data-media-picker-open]')) { e.stopImmediatePropagation(); onClose(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  const person = snapshot.people?.[uid];
  const cand = useMemo(() => (uid ? personCandidates(snapshot, uid) : { delivered: [], active: [], worked: [] }), [snapshot, uid]);
  const pov = overrides.people?.[uid] || {};
  const manual = Array.isArray(pov.selection);
  const shown = uid ? personShown(snapshot, overrides, uid).ids : [];
  const selected = manual ? pov.selection.filter(id => snapshot.items?.[id]) : shown;
  const perPage = pov.perPage || slides.find(s => s.type === 'person' && s.params?.uid === uid)?.options?.perPage || 8;
  const slideCount = Math.min(6, Math.max(1, Math.ceil(selected.length / perPage)));

  const setSel = (ids) => ctx.setPersonSelection(uid, ids);
  const toggle = (id) => {
    if ((overrides.tickets?.[id] || {}).hidden) ctx.setTicket(id, { hidden: false });
    setSel(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };
  const all = [...cand.delivered, ...cand.active, ...cand.worked];
  const products = useMemo(() => {
    const m = new Map();
    for (const id of all) { const p = snapshot.items[id]?.product; if (p?.label && p.label !== '-') m.set(p.label, { label: p.label, color: p.color, n: (m.get(p.label)?.n || 0) + 1 }); }
    return [...m.values()].sort((a, b) => b.n - a.n);
  }, [all.join(','), snapshot]); // eslint-disable-line react-hooks/exhaustive-deps
  const needle = q.trim().toLowerCase();
  const match = (id) => {
    const it = snapshot.items[id];
    if (product && it.product?.label !== product) return false;
    return !needle || `${it.title} ${it.subtitle || ''} ${it.name || ''} ${it.product?.label || ''}`.toLowerCase().includes(needle);
  };
  const groups = [
    ['Delivered last week', cand.delivered],
    ['In progress', cand.active],
    ['Also worked on last week', cand.worked],
  ].map(([t, ids]) => [t, ids.filter(match)]).filter(([, ids]) => ids.length);
  const personKey = slides.find(s => s.type === 'person' && s.params?.uid === uid)?.key;
  const countFor = (p) => {
    const o = overrides.people?.[p.id] || {};
    return { n: Array.isArray(o.selection) ? o.selection.length : personShown(snapshot, overrides, p.id).ids.length, manual: Array.isArray(o.selection), hidden: !!o.hidden };
  };

  return createPortal(
    <div className="fixed inset-0 z-[85] flex" style={{ background: 'rgba(3,11,46,.55)' }} onClick={onClose}>
      <div className="m-3 md:m-6 flex-1 bg-white rounded-2xl shadow-2xl flex overflow-hidden min-w-0" onClick={(e) => e.stopPropagation()}>
        {/* People */}
        <aside className="w-60 flex-none border-r border-gray-200 bg-gray-50 overflow-y-auto hidden sm:block">
          <div className="px-4 pt-4 pb-3">
            <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#0808f8]">Creative Weekly</div>
            <div className="text-lg font-bold text-[#030b2e] leading-tight">Choose projects</div>
            <div className="text-xs text-gray-500 mt-0.5">What each person presents</div>
          </div>
          {people.map(g => (
            <div key={g.role} className="mb-3">
              <div className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-gray-400 flex items-center gap-1.5"><g.Icon size={12} /> {g.label}</div>
              {g.list.map(p => {
                const c = countFor(p);
                const on = p.id === uid;
                return (
                  <button key={p.id} type="button" onClick={() => setUid(p.id)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-left ${on ? 'bg-white shadow-sm border-y border-gray-200' : 'hover:bg-white/70'}`}>
                    <Avatar person={p} size={32} />
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm truncate ${on ? 'font-bold text-[#030b2e]' : 'font-medium text-gray-700'}`}>{displayName(p.name)}</span>
                      <span className="block text-[11px] text-gray-400">{c.hidden ? 'Hidden from deck' : `${c.n} project${c.n === 1 ? '' : 's'} · ${c.manual ? 'picked' : 'auto'}`}</span>
                    </span>
                    {c.manual && !c.hidden && <span className="w-2 h-2 rounded-full bg-[#0808f8]" title="Hand-picked" />}
                  </button>
                );
              })}
            </div>
          ))}
        </aside>

        {/* Projects */}
        <main className="flex-1 min-w-0 flex flex-col">
          <header className="px-5 py-3.5 border-b border-gray-200 flex items-center gap-3 flex-wrap">
            {person && <Avatar person={person} size={44} />}
            <div className="min-w-0 mr-auto">
              <div className="text-base font-bold text-[#030b2e] truncate">{displayName(person?.name || '')}</div>
              <div className="text-xs text-gray-500 flex items-center gap-2">
                {cand.delivered.length} delivered · {cand.active.length} in progress
                {!ro && (
                  <button type="button" onClick={() => ctx.setPerson(uid, { hidden: !pov.hidden })}
                    className={`font-semibold ${pov.hidden ? 'text-[#0808f8]' : 'text-gray-400 hover:text-gray-700'}`}>
                    {pov.hidden ? 'Hidden from the deck — show again' : 'Hide from deck'}
                  </button>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-lg bg-gray-100" title="Automatic shows everything they delivered (★ first)">
              <button type="button" disabled={ro} onClick={() => setSel(null)} className={`text-xs font-semibold px-3 py-1.5 rounded-md ${!manual ? 'bg-white shadow text-[#030b2e]' : 'text-gray-500'}`}>Automatic</button>
              <button type="button" disabled={ro} onClick={() => !manual && setSel(selected)} className={`text-xs font-semibold px-3 py-1.5 rounded-md ${manual ? 'bg-white shadow text-[#030b2e]' : 'text-gray-500'}`}>Hand-picked</button>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-gray-500">Per slide</span>
              <div className="flex p-1 rounded-lg bg-gray-100">
                {PER_PAGE.map(n => (
                  <button key={n} type="button" disabled={ro} onClick={() => ctx.setPerson(uid, { perPage: n })}
                    className={`text-xs font-semibold w-8 py-1.5 rounded-md ${perPage === n ? 'bg-white shadow text-[#030b2e]' : 'text-gray-500 hover:text-gray-700'}`}>{n}</button>
                ))}
              </div>
            </div>
            <button type="button" onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" aria-label="Close"><X size={18} /></button>
          </header>

          {/* Chosen, in order */}
          <div className="px-5 py-3 border-b border-gray-200 bg-[#f6f7fb]">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500">On {displayName(person?.name || '').split(' ')[0]}’s slide{slideCount > 1 ? 's' : ''} · {selected.length}</span>
              <span className="text-[11px] text-gray-400">{selected.length ? `→ ${slideCount} slide${slideCount > 1 ? 's' : ''} · drag to reorder` : ''}</span>
              {manual && selected.length > 0 && !ro && <button type="button" onClick={() => setSel([])} className="ml-auto text-[11px] font-semibold text-gray-500 hover:text-red-600">Clear all</button>}
            </div>
            {selected.length ? (
              <DndContext sensors={sensors} collisionDetection={closestCenter}
                onDragEnd={({ active, over }) => { if (over && active.id !== over.id) setSel(arrayMove(selected, selected.indexOf(active.id), selected.indexOf(over.id))); }}>
                <SortableContext items={selected} strategy={horizontalListSortingStrategy}>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {selected.map((id, i) => (
                      <SortableChip key={id} id={id} index={i} it={decorate(snapshot, overrides, id)} media={media} disabled={ro}
                        onRemove={() => setSel(selected.filter(x => x !== id))} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            ) : (
              <div className="text-sm text-gray-400 py-4 text-center rounded-xl border border-dashed border-gray-300 bg-white">Click projects below to put them on the slide.</div>
            )}
          </div>

          {/* Filters */}
          <div className="px-5 pt-3 pb-2 flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.stopPropagation()} placeholder="Search projects"
                className="w-56 text-sm pl-8 pr-3 py-1.5 rounded-full border border-gray-200 outline-none focus:border-[#4a55ff]" />
            </div>
            <button type="button" onClick={() => setProduct(null)} className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${!product ? 'bg-[#030b2e] text-white border-[#030b2e]' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>All</button>
            {products.map(p => (
              <button key={p.label} type="button" onClick={() => setProduct(product === p.label ? null : p.label)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border flex items-center gap-1.5 ${product === p.label ? 'bg-[#030b2e] text-white border-[#030b2e]' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                <span className="w-2 h-2 rounded-full" style={{ background: p.color || '#8c93ff' }} />{p.label}<span className="opacity-60">{p.n}</span>
              </button>
            ))}
            {!ro && cand.delivered.length > 0 && (
              <button type="button" onClick={() => setSel([...selected, ...cand.delivered.filter(id => !selected.includes(id))])}
                className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-full text-[#0808f8] hover:bg-[#0808f8]/5">+ Add everything delivered</button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-5 pb-6">
            {groups.map(([title, ids]) => (
              <section key={title} className="mt-3">
                <div className="text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-2">{title} · {ids.length}</div>
                <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(168px, 1fr))' }}>
                  {ids.map(id => {
                    const it = decorate(snapshot, overrides, id);
                    const ov = overrides.tickets?.[id] || {};
                    return (
                      <ProjectCard key={id} it={it} media={media} ov={ov} ro={ro} selectedIndex={selected.indexOf(id)}
                        onToggle={() => toggle(id)}
                        onStar={() => ctx.setTicket(id, { highlighted: !ov.highlighted })}
                        onImages={() => ctx.openMediaPicker(id)}
                        onShowcase={() => { ctx.addShowcase(id, personKey); onClose(); }} />
                    );
                  })}
                </div>
              </section>
            ))}
            {!groups.length && <div className="text-sm text-gray-400 text-center py-16">{all.length ? 'Nothing matches this filter.' : 'No projects for this person last week.'}</div>}
          </div>

          <footer className="px-5 py-3 border-t border-gray-200 flex items-center gap-3">
            <span className="text-xs text-gray-400 flex items-center gap-1.5"><RotateCcw size={12} /> Changes save automatically · ⌘Z to undo</span>
            {personKey && <button type="button" onClick={() => { onShowSlide(personKey); onClose(); }} className="ml-auto text-sm font-semibold px-4 py-2 rounded-full border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5">Show the slide <ArrowRight size={14} /></button>}
            <button type="button" onClick={onClose} className={`${personKey ? '' : 'ml-auto'} text-sm font-semibold px-5 py-2 rounded-full text-white`} style={{ background: '#0808f8' }}>Done</button>
          </footer>
        </main>
      </div>
    </div>,
    document.body
  );
}

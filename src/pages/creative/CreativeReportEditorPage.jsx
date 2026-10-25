import '../../components/creative/deck.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ChevronLeft, ChevronRight, Play, Share2, History, RefreshCw, Lock, Unlock, Loader2, Check, AlertTriangle,
  CloudOff, Undo2, Redo2, ChevronDown, MonitorPlay, Sparkles, X, Wand2, Trash2, LayoutGrid,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import { creativeApi } from '../../lib/creativeReportService';
import { MotionProvider } from '../../components/creative/motion/Motion';
import { DeckProvider } from '../../components/creative/deck/DeckContext';
import DeckShell from '../../components/creative/deck/DeckShell';
import SlideStage from '../../components/creative/deck/SlideStage';
import SlideRenderer from '../../components/creative/deck/SlideRenderer';
import SlideRail from '../../components/creative/editor/SlideRail';
import Inspector from '../../components/creative/editor/Inspector';
import MediaPicker from '../../components/creative/editor/MediaPicker';
import ProjectChooser from '../../components/creative/editor/ProjectChooser';
import { ShareDialog, VersionsDrawer, DiffToast, AddSlideMenu } from '../../components/creative/editor/Dialogs';
import { useDeckModel } from '../../components/creative/deck/useDeckModel';
import { useAutosave, requestFullscreen } from '../../components/creative/deck/hooks';
import * as O from '../../components/creative/deck/overrides';
import { addDays, weekLabelOf, timeOfDay, relTime } from '../../components/creative/deck/format';
import { ParticleOnlyGate, EditorsOnly, confirmDeleteDeck } from './CreativeReportsPage';
import { useDeckOverlays } from '../../components/creative/ui/Overlays';

function SaveIndicator({ status, lastSavedAt }) {
  const map = {
    idle: [null, lastSavedAt ? `Saved ${timeOfDay(lastSavedAt)}` : 'All changes saved', 'text-gray-400'],
    saved: [Check, `Saved ${timeOfDay(lastSavedAt)}`, 'text-gray-400'],
    dirty: [null, 'Unsaved changes', 'text-gray-400'],
    saving: [Loader2, 'Saving…', 'text-gray-500'],
    error: [CloudOff, 'Offline — retrying', 'text-amber-600'],
    conflict: [AlertTriangle, 'Edited elsewhere', 'text-red-600'],
    locked: [Lock, 'Final — locked', 'text-gray-500'],
  };
  const [Icon, label, cls] = map[status] || map.idle;
  return <span className={`text-xs flex items-center gap-1.5 ${cls}`}>{Icon && <Icon size={13} className={status === 'saving' ? 'animate-spin' : ''} />}{label}</span>;
}

export default function CreativeReportEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { isEditor, isAdmin } = useAuth();
  const { brand } = useBrand();

  const [payload, setPayload] = useState(null);
  const [overrides, setOverrides] = useState({});
  const [template, setTemplate] = useState(null);
  const [narrative, setNarrative] = useState(null);
  const [picks, setPicks] = useState({});
  const [currentKey, setCurrentKey] = useState(null);
  const [tab, setTab] = useState('slide');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [pickerFor, setPickerFor] = useState(null);
  const [chooserFor, setChooserFor] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [diff, setDiff] = useState(null);
  const [busy, setBusy] = useState({});
  const [preview, setPreview] = useState(null);
  const [animate, setAnimate] = useState(0);
  const [conflict, setConflict] = useState(null);
  const [error, setError] = useState(null);
  const [presentMenu, setPresentMenu] = useState(false);
  const [toast, setToast] = useState(null);
  const overlays = useDeckOverlays();

  const revision = useRef(0);
  const latest = useRef({ overrides: {}, template: null, narrative: null });
  const history = useRef({ past: [], future: [], lastField: null, lastAt: 0 });

  const autosave = useAutosave({
    save: async ({ keepalive }) => {
      const cur = latest.current;
      try {
        const res = await creativeApi.save(id, { base_revision: revision.current, overrides: cur.overrides, template: cur.template, narrative: cur.narrative }, { keepalive });
        if (res?.revision) revision.current = res.revision;
      } catch (e) {
        if (e.status === 409) setConflict(e.data || {});
        throw e;
      }
    },
  });

  const flash = (text) => { setToast(text); setTimeout(() => setToast(null), 2600); };

  // ── Load ──
  const hydrate = useCallback((p) => {
    setPayload(p);
    setOverrides(p.report.overrides || {});
    setTemplate(p.report.template || { slides: [] });
    setNarrative(p.report.narrative || null);
    latest.current = { overrides: p.report.overrides || {}, template: p.report.template, narrative: p.report.narrative };
    revision.current = p.report.revision;
    history.current = { past: [], future: [], lastField: null, lastAt: 0 };
  }, []);

  useEffect(() => {
    let alive = true;
    setPayload(null);
    creativeApi.get(id).then(p => {
      if (!alive) return;
      hydrate(p);
      creativeApi.picks(id).then(r => alive && setPicks(r?.picks || {})).catch(() => {});
      creativeApi.warm(id).catch(() => {});
    }).catch(e => alive && setError(e.status === 404 ? 'This deck no longer exists.' : e.message));
    return () => { alive = false; };
  }, [id, hydrate]);

  const report = useMemo(() => (payload ? { ...payload.report, template, narrative } : null), [payload, template, narrative]);
  const model = useDeckModel({
    report: preview ? preview.report : report,
    overrides: preview ? preview.overrides : overrides,
    mediaToken: payload?.media?.token,
    picks,
  });
  const slide = model.slides.find(s => s.key === currentKey) || model.slides[0] || null;
  useEffect(() => {
    if (!currentKey && model.slides.length) {
      const back = location.state?.slideIndex;      setCurrentKey((back != null && model.visible[back]?.key) || model.slides[0].key);
    }
  }, [model.slides, model.visible, currentKey, location.state]);

  const final = payload?.report?.status === 'final';
  const editable = isEditor && !final && !preview && !conflict;

  // ── Edits (with undo history; same-field edits within 1.2s coalesce) ──
  const commit = useCallback((next, field) => {
    const cur = latest.current;
    const h = history.current;
    const now = Date.now();
    if (!(field && h.lastField === field && now - h.lastAt < 1200)) {
      h.past.push({ overrides: cur.overrides, template: cur.template });
      if (h.past.length > 50) h.past.shift();
    }
    h.future = [];
    h.lastField = field;
    h.lastAt = now;
    latest.current = { ...cur, ...next };
    if (next.overrides) setOverrides(next.overrides);
    if (next.template) setTemplate(next.template);
    autosave.markDirty();
  }, [autosave]);
  const applyOv = useCallback((fn, field) => {
    if (!editable) return;
    const prev = latest.current.overrides;
    const next = fn(prev);
    if (next !== prev) commit({ overrides: next }, field);
  }, [editable, commit]);

  const undo = useCallback(() => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev || !editable) return;
    h.future.push({ overrides: latest.current.overrides, template: latest.current.template });
    h.lastField = null;
    latest.current = { ...latest.current, ...prev };
    setOverrides(prev.overrides); setTemplate(prev.template);
    autosave.markDirty();
  }, [editable, autosave]);
  const redo = useCallback(() => {
    const h = history.current;
    const nxt = h.future.pop();
    if (!nxt || !editable) return;
    h.past.push({ overrides: latest.current.overrides, template: latest.current.template });
    latest.current = { ...latest.current, ...nxt };
    setOverrides(nxt.overrides); setTemplate(nxt.template);
    autosave.markDirty();
  }, [editable, autosave]);

  const ctx = useMemo(() => ({
    editable,
    snapshot: model.snapshot,
    overrides: model.overrides,
    media: model.media,
    template,
    report,
    cpStale: !!payload?.cp_weekly_stale,
    selectedTicket,
    setSelectedTicket,
    narrativeBusy: !!busy.narrative,
    templateBusy: !!busy.template,
    setText: (key, slot, v) => applyOv(ov => O.setSlideField(ov, key, slot, v), `${key}.${slot}`),
    setBullets: (key, bullets) => applyOv(ov => O.setSlideField(ov, key, 'bullets', bullets), `${key}.bullets`),
    setBody: (key, body) => applyOv(ov => O.setSlideField(ov, key, 'body', body), `${key}.body`),
    setOption: (key, opt, v) => applyOv(ov => O.setSlideOption(ov, key, opt, v)),
    setNotes: (key, v) => applyOv(ov => O.setSlideField(ov, key, 'notes', v || undefined), `${key}.notes`),
    toggleHidden: (key) => applyOv(ov => O.toggleHidden(ov, key)),
    resetSlide: (key) => applyOv(ov => O.resetSlide(ov, key)),
    deleteCustom: (key) => {
      const idx = model.slides.findIndex(s => s.key === key);
      applyOv(ov => O.deleteCustom(ov, key));
      setCurrentKey(model.slides[Math.max(0, idx - 1)]?.key || null);
    },
    setTicket: (tid, patch) => applyOv(ov => O.setTicket(ov, tid, patch), patch.caption !== undefined ? `t.${tid}.caption` : null),
    setPerson: (uid, patch) => applyOv(ov => O.setPerson(ov, uid, patch)),
    setPersonSelection: (uid, ids) => applyOv(ov => O.setPersonSelection(ov, uid, ids)),
    setProduction: (pid, patch) => applyOv(ov => O.setProduction(ov, pid, patch)),
    setShowcaseItem: (key, itemId) => applyOv(ov => O.updateCustom(ov, key, { item: String(itemId) })),
    addShowcase: (itemId, after) => {
      let key;
      applyOv(ov => { const [next, k] = O.addCustom(ov, { type: 'showcase', after: after || null, item: String(itemId) }); key = k; return next; });
      setTimeout(() => { if (key) { setCurrentKey(key); setTab('tickets'); } }, 0);
    },
    setShareLinks: (v) => applyOv(ov => ({ ...ov, share: { ...(ov.share || {}), show_links: !!v } })),
    openMediaPicker: (tid) => setPickerFor(tid),
    /** Add a Frame.io / Dropbox link as media (the server stores it in the snapshot) → { refId, entries, error } */
    addLinkMedia: async (url) => {
      await autosave.flush();
      const r = await creativeApi.linkMedia(id, url);
      setPayload(prev => ({ ...prev, report: { ...prev.report, snapshot: r.report.snapshot, revision: r.report.revision }, media: r.media || prev.media }));
      revision.current = r.report.revision;
      return { refId: r.refId, entries: r.entries || [], error: r.error || null };
    },
    mediaListing: (refId) => creativeApi.mediaListing(id, refId),
    openProjectChooser: (uid) => setChooserFor(uid || '__first'),
    setTemplateEnabled: (specId, enabled) => {
      if (!editable) return;
      const tpl = latest.current.template || { slides: [] };
      commit({ template: { ...tpl, slides: tpl.slides.map(s => (s.id === specId ? { ...s, enabled } : s)) } });
    },
    regenerateNarrative: async (slideKey) => {
      setBusy(b => ({ ...b, narrative: true }));
      try {
        await autosave.flush();
        const res = await creativeApi.narrative(id, true);
        setNarrative(res.narrative);
        latest.current = { ...latest.current, narrative: res.narrative };
        if (res.revision) revision.current = res.revision;
        if (slideKey && latest.current.overrides?.slides?.[slideKey]?.bullets) {
          applyOv(ov => O.setSlideField(ov, slideKey, 'bullets', undefined));
        }
        flash('Summary written by Claude');
      } catch (e) { flash(e.message); } finally { setBusy(b => ({ ...b, narrative: false })); }
    },
    reimportWeekly: async () => {
      await autosave.flush();
      const p = await creativeApi.importWeekly(id);
      setPayload(prev => ({ ...prev, report: { ...prev.report, snapshot: p.report.snapshot, revision: p.report.revision }, cp_weekly_stale: false }));
      revision.current = p.report.revision;
      flash('CP weekly re-imported');
    },
    saveAsTemplate: async () => {
      setBusy(b => ({ ...b, template: true }));
      try {
        const tpl = latest.current.template || { slides: [] };
        const seen = new Map();
        for (const s of model.slides) if (!s.custom && !seen.has(s.specId)) seen.set(s.specId, seen.size);
        const ov = latest.current.overrides || {};
        const slides = [...tpl.slides]
          .sort((a, b) => (seen.get(a.id) ?? 999) - (seen.get(b.id) ?? 999))
          .map(s => ({ ...s, enabled: s.enabled !== false && !(ov.hidden?.[s.id]), options: { ...(s.options || {}), ...(ov.slides?.[s.id]?.options || {}) } }));
        await creativeApi.saveTemplate({ template: { version: tpl.version || 1, slides } });
        flash('Saved as the default template for future weeks');
      } catch (e) { flash(e.message); } finally { setBusy(b => ({ ...b, template: false })); }
    },
    resetAll: () => {
      if (!window.confirm('Reset all edits for this week? (A version is saved first, so you can restore.)')) return;
      creativeApi.saveVersion(id, 'Before reset').catch(() => {});
      applyOv(() => ({}));
    },
  }), [editable, model, template, report, payload, selectedTicket, busy, applyOv, commit, autosave, id]);

  // ── Canvas deck context ──
  const canvasValue = useMemo(() => ({
    reportId: id,
    isPublic: false,
    brand: { name: brand?.name || 'Particle', logo_url: brand?.logo_url || null },
    mode: 'edit',
    layout: 'canvas',
    motionLevel: animate ? 'full' : 'static',
    editable,
    buildStep: 99,
    snapshot: model.snapshot,
    overrides: model.overrides,
    narrative: model.narrative,
    media: model.media,
    pageOf: model.pageOf,
    editText: editable ? ctx.setText : undefined,
    editBullets: editable ? ctx.setBullets : undefined,
    editBody: editable ? ctx.setBody : undefined,
    onTicket: (it) => { setSelectedTicket(it.id); setTab('tickets'); },
    openViewer: overlays.api.openViewer,
    openProduct: overlays.api.openProduct,
  }), [id, brand, animate, editable, model, ctx, overlays.api]);
  const thumbValue = useMemo(() => ({ ...canvasValue, mode: 'thumb', motionLevel: 'static', editable: false, editText: undefined, editBullets: undefined, editBody: undefined, onTicket: undefined, openViewer: undefined, openProduct: undefined }), [canvasValue]);

  // ── Actions ──
  const go = (delta) => {
    const i = model.slides.findIndex(s => s.key === slide?.key);
    const n = model.slides[Math.max(0, Math.min(model.slides.length - 1, i + delta))];
    if (n) { setCurrentKey(n.key); setAnimate(0); }
  };
  const present = (fromStart, withConsole = false) => {
    requestFullscreen(); // must run inside the click gesture
    autosave.flush();
    if (withConsole) window.open(`/creative-reports/${id}/present?view=console`, `cr-console-${id}`, 'popup,width=1280,height=820');
    const vi = fromStart ? 0 : Math.max(0, model.visible.findIndex(s => s.key === slide?.key));
    navigate(`/creative-reports/${id}/present?slide=${vi + 1}`, { state: { payload: { ...payload, report: { ...report, overrides } }, picks } });
  };
  const refresh = async () => {
    setBusy(b => ({ ...b, refresh: true }));
    try {
      await autosave.flush();
      const r = await creativeApi.refresh(id);
      setPayload(prev => ({ ...prev, report: { ...prev.report, ...r.report }, media: r.media || prev.media, cp_weekly_stale: false }));
      revision.current = r.report.revision;
      setDiff(r.diff);
      creativeApi.picks(id).then(x => setPicks(x?.picks || {})).catch(() => {});
    } catch (e) { flash(e.message); } finally { setBusy(b => ({ ...b, refresh: false })); }
  };
  const setFinal = async (on) => {
    setBusy(b => ({ ...b, final: true }));
    try {
      await autosave.flush();
      const r = on ? await creativeApi.finalize(id) : await creativeApi.unfinalize(id);
      setPayload(prev => ({ ...prev, report: { ...prev.report, status: r.report.status, revision: r.report.revision } }));
      revision.current = r.report.revision;
      autosave.setStatus(on ? 'locked' : 'idle');
    } catch (e) { flash(e.message); } finally { setBusy(b => ({ ...b, final: false })); }
  };
  const switchWeek = async (delta) => {
    const ws = addDays(payload.report.week_start, 7 * delta);
    await autosave.flush();
    const r = await creativeApi.byWeek(ws).catch(() => null);
    if (r?.report) { navigate(`/creative-reports/${r.report.id}`); return; }
    if (!window.confirm(`There’s no deck for ${weekLabelOf(ws)} yet. Generate it now?`)) return;
    setBusy(b => ({ ...b, week: true }));
    try {
      const g = await creativeApi.generate(ws);
      navigate(`/creative-reports/${g.report.id}`);
    } catch (e) {
      if (e.status === 409 && e.data?.id) navigate(`/creative-reports/${e.data.id}`); else flash(e.message);
    } finally { setBusy(b => ({ ...b, week: false })); }
  };
  const addSlide = (type) => {
    const after = slide?.key || null;
    let key;
    applyOv(ov => { const [next, k] = O.addCustom(ov, { type, after }); key = k; return next; });
    setDialog(null);
    setTimeout(() => { if (key) { setCurrentKey(key); if (type === 'showcase') setTab('tickets'); } }, 0);
  };
  const addTemplateType = (type) => {
    if (!editable) return;
    const tpl = latest.current.template || { slides: [] };
    const sid = `${type}_${Date.now().toString(36)}`;
    const idx = tpl.slides.findIndex(s => s.type === 'closing');
    const slides = [...tpl.slides];
    slides.splice(idx >= 0 ? idx : slides.length, 0, { id: sid, type, enabled: true, options: {} });
    commit({ template: { ...tpl, slides } });
    setDialog(null);
    setTimeout(() => setCurrentKey(sid), 0);
  };

  // ── Editor keyboard ──
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target;
      const typing = t?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t?.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); autosave.flush(); flash('Saved'); return; }
      if (typing || dialog || pickerFor || chooserFor || overlays.open) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
      else if (e.key === 'p' || e.key === 'P') { e.preventDefault(); present(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (error) {
    return (
      <div className="max-w-lg mx-auto mt-20 text-center">
        <AlertTriangle className="mx-auto text-amber-500" />
        <p className="mt-3 text-gray-700">{error}</p>
        <button type="button" onClick={() => navigate('/creative-reports')} className="mt-4 text-sm font-semibold text-[#0808f8]">Back to Creative Weekly</button>
      </div>
    );
  }
  if (!payload || !slide) {
    return <div className="h-[70vh] flex items-center justify-center text-gray-400"><Loader2 className="animate-spin" /></div>;
  }

  const wk = payload.report.snapshot?.week;
  const pickerItem = pickerFor ? model.snapshot.items?.[pickerFor] : null;

  return (
    <ParticleOnlyGate>
      <EditorsOnly>
        <div className="-m-6 flex flex-col bg-white" style={{ height: 'calc(100% + 3rem)', minHeight: 'calc(100vh - 64px)' }}>
          {/* Top bar */}
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-white flex-wrap">
            <button type="button" onClick={async () => { await autosave.flush(); navigate('/creative-reports'); }} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500" title="Back"><ArrowLeft size={18} /></button>
            <div className="flex items-center gap-1">
              <button type="button" disabled={busy.week} onClick={() => switchWeek(-1)} className="p-1 rounded-md hover:bg-gray-100 text-gray-500" title="Previous week"><ChevronLeft size={16} /></button>
              <div className="px-1">
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[#0808f8]">Creative Weekly · Week {wk?.number}</div>
                <div className="text-sm font-bold text-[#030b2e] leading-tight">{wk?.label}{wk?.partial ? <span className="ml-1.5 text-[10px] font-semibold text-amber-600">IN PROGRESS</span> : null}</div>
              </div>
              <button type="button" disabled={busy.week} onClick={() => switchWeek(1)} className="p-1 rounded-md hover:bg-gray-100 text-gray-500" title="Next week">{busy.week ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}</button>
            </div>
            <span className={`ml-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${final ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{final ? 'Final' : 'Draft'}</span>
            <div className="ml-2"><SaveIndicator status={final ? 'locked' : autosave.status} lastSavedAt={autosave.lastSavedAt} /></div>

            <div className="ml-auto flex items-center gap-1.5">
              <button type="button" onClick={undo} disabled={!editable} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-30" title="Undo (⌘Z)"><Undo2 size={16} /></button>
              <button type="button" onClick={redo} disabled={!editable} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 disabled:opacity-30" title="Redo (⇧⌘Z)"><Redo2 size={16} /></button>
              <span className="w-px h-6 bg-gray-200 mx-1" />
              <button type="button" onClick={refresh} disabled={busy.refresh || final} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700 disabled:opacity-40" title={`Data from ${relTime(payload.report.generated_at)}`}>
                <RefreshCw size={14} className={busy.refresh ? 'animate-spin' : ''} /> Refresh live data
              </button>
              <button type="button" onClick={() => setChooserFor(slide.type === 'person' ? slide.params.uid : '__first')} title="Choose what each designer and video editor presents"
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700"><LayoutGrid size={14} /> Projects</button>
              <button type="button" onClick={() => setDialog('versions')} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700"><History size={14} /> History</button>
              {isAdmin && (
                <button type="button" title="Delete this deck" className="p-2 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"
                  onClick={async () => {
                    try {
                      await autosave.flush().catch(() => {});
                      if (await confirmDeleteDeck(payload.report)) navigate('/creative-reports', { replace: true });
                    } catch (e) { flash(e.message); }
                  }}>
                  <Trash2 size={15} />
                </button>
              )}
              <button type="button" onClick={() => setFinal(!final)} disabled={busy.final || !isEditor} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg hover:bg-gray-100 text-gray-700">
                {final ? <Unlock size={14} /> : <Lock size={14} />} {final ? 'Unlock' : 'Mark final'}
              </button>
              <button type="button" onClick={() => setDialog('share')} className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border border-gray-200 hover:border-gray-300 text-gray-800"><Share2 size={14} /> Share</button>
              <div className="relative flex">
                <button type="button" onClick={() => present(false)} className="flex items-center gap-1.5 text-xs font-bold px-4 py-2 rounded-l-lg text-white" style={{ background: '#0808f8' }}><Play size={14} fill="#fff" /> Present</button>
                <button type="button" onClick={() => setPresentMenu(v => !v)} className="px-2 rounded-r-lg text-white border-l border-white/25" style={{ background: '#0808f8' }}><ChevronDown size={14} /></button>
                {presentMenu && (
                  <div className="absolute right-0 top-full mt-1 w-60 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50" onMouseLeave={() => setPresentMenu(false)}>
                    <button type="button" onClick={() => { setPresentMenu(false); present(false); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"><Play size={14} /> From this slide <span className="ml-auto text-[10px] text-gray-400">P</span></button>
                    <button type="button" onClick={() => { setPresentMenu(false); present(true); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"><Play size={14} /> From the start</button>
                    <button type="button" onClick={() => { setPresentMenu(false); present(true, true); }} className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"><MonitorPlay size={14} /> With presenter console</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Banners */}
          {preview && (
            <div className="px-4 py-2 bg-indigo-50 text-indigo-900 text-sm flex items-center gap-3">
              <History size={15} /> Previewing version {preview.version.version_number}{preview.version.label ? ` — ${preview.version.label}` : ''} (read-only)
              <button type="button" className="ml-auto font-semibold" onClick={async () => { const r = await creativeApi.restoreVersion(id, preview.version.id); setPreview(null); hydrate({ ...payload, ...r, report: r.report }); flash('Version restored'); }}>Restore this version</button>
              <button type="button" className="font-semibold text-indigo-600" onClick={() => setPreview(null)}>Back to current</button>
            </div>
          )}
          {conflict && (
            <div className="px-4 py-2 bg-red-50 text-red-800 text-sm flex items-center gap-3">
              <AlertTriangle size={15} /> This deck was edited somewhere else (another tab or person).
              <button type="button" className="ml-auto font-semibold" onClick={() => window.location.reload()}>Reload their version</button>
              <button type="button" className="font-semibold text-red-600" onClick={() => { revision.current = conflict.revision ?? revision.current; setConflict(null); autosave.markDirty(); }}>Keep mine (overwrite)</button>
            </div>
          )}
          {final && !preview && (
            <div className="px-4 py-2 bg-emerald-50 text-emerald-900 text-sm flex items-center gap-3">
              <Lock size={14} /> This deck is final. Unlock it to edit — the share link always shows the saved version.
            </div>
          )}
          {!report.narrative && !preview && editable && (
            <div className="px-4 py-2 bg-[#0808f8]/5 text-[#030b2e] text-sm flex items-center gap-3">
              <Wand2 size={15} className="text-[#0808f8]" /> The executive summary is auto-written from the numbers.
              <button type="button" onClick={() => ctx.regenerateNarrative()} disabled={busy.narrative} className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full text-white" style={{ background: '#0808f8' }}>
                {busy.narrative ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />} Write it with Claude
              </button>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 min-h-0 flex">
            <MotionProvider>
              <DeckProvider value={thumbValue}>
                <SlideRail
                  slides={model.slides}
                  selectedKey={slide.key}
                  onSelect={(k) => { setCurrentKey(k); setAnimate(0); }}
                  onReorder={(keys) => applyOv(ov => O.setOrder(ov, keys))}
                  onToggleHidden={(k) => ctx.toggleHidden(k)}
                  onAdd={() => editable && setDialog('add')}
                />
              </DeckProvider>
            </MotionProvider>

            <div className="flex-1 min-w-0 flex flex-col" style={{ background: '#e9ebf3' }}>
              <div className="flex-1 min-h-0 relative">
                <SlideStage style={{ position: 'absolute', inset: 0 }} inset={28}>
                  <div style={{ width: 1920, height: 1080, borderRadius: 18, overflow: 'hidden', boxShadow: '0 30px 80px -30px rgba(3,11,46,.55), 0 0 0 1px rgba(3,11,46,.08)' }}>
                    <DeckShell value={canvasValue}>
                      <div key={`${slide.key}:${animate}`}>
                        <SlideRenderer slide={slide} active />
                      </div>
                      {overlays.element}
                    </DeckShell>
                  </div>
                </SlideStage>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 text-xs">
                  {slide.hidden && <span className="px-2 py-1 rounded-full bg-gray-800 text-white">Hidden — skipped when presenting</span>}
                  {slide.type === 'person' && (
                    <button type="button" onClick={() => setChooserFor(slide.params.uid)} className="px-3 py-1.5 rounded-full text-white shadow flex items-center gap-1.5 font-semibold" style={{ background: '#0808f8' }}>
                      <LayoutGrid size={12} /> Choose projects
                    </button>
                  )}
                  <button type="button" onClick={() => setAnimate(a => a + 1)} className="px-3 py-1.5 rounded-full bg-white/90 shadow text-gray-700 hover:text-gray-900 flex items-center gap-1.5"><Play size={12} /> Preview animation</button>
                  {editable && <span className="px-3 py-1.5 rounded-full bg-white/70 text-gray-500">Click any text on the slide to edit it</span>}
                </div>
              </div>
            </div>

            <Inspector tab={tab} setTab={setTab} slide={slide} ctx={ctx} />
          </div>

          {dialog === 'share' && (
            <ShareDialog report={payload.report} onClose={() => setDialog(null)}
              onChanged={(patch) => setPayload(prev => ({ ...prev, report: { ...prev.report, ...patch } }))}
              showLinks={!!overrides.share?.show_links} setShowLinks={(v) => ctx.setShareLinks(v)} />
          )}
          {dialog === 'versions' && (
            <VersionsDrawer reportId={id} onClose={() => setDialog(null)}
              onPreview={async (v) => {
                const full = (await creativeApi.version(id, v.id)).version;
                setPreview({ version: full, report: { ...report, snapshot: full.snapshot, template: full.template, narrative: full.narrative }, overrides: full.overrides || {} });
                setDialog(null);
              }}
              onRestored={(r) => { hydrate({ ...payload, ...r, report: r.report }); flash('Version restored'); }} />
          )}
          {dialog === 'add' && (
            <AddSlideMenu onClose={() => setDialog(null)} onAdd={addSlide} onAddTemplateType={addTemplateType}
              existingTypes={new Set((template?.slides || []).filter(s => s.enabled !== false).map(s => s.type))} />
          )}
          {chooserFor && (
            <ProjectChooser ctx={ctx} slides={model.slides} initialUid={chooserFor === '__first' ? null : chooserFor}
              onClose={() => setChooserFor(null)} onShowSlide={(k) => { setCurrentKey(k); setAnimate(0); }} />
          )}
          {pickerItem && (
            <MediaPicker reportId={id} item={pickerItem} snapshot={model.snapshot} media={model.media}
              value={overrides.tickets?.[pickerFor]} onClose={() => setPickerFor(null)}
              onSave={({ cover, gallery }) => ctx.setTicket(pickerFor, { cover: cover || null, gallery })} />
          )}
          {diff && <DiffToast diff={diff} onClose={() => setDiff(null)} />}
          {toast && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[95] px-4 py-2.5 rounded-full bg-[#030b2e] text-white text-sm shadow-xl flex items-center gap-2">
              {toast}<button type="button" onClick={() => setToast(null)} className="opacity-60"><X size={13} /></button>
            </div>
          )}
        </div>
      </EditorsOnly>
    </ParticleOnlyGate>
  );
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Table2, Volume2, Layout, Maximize2, X, ChevronLeft, ChevronRight,
  Printer, Loader2, MessageSquare, Send, Check,
} from 'lucide-react';
import clsx from 'clsx';

const API = import.meta.env.VITE_API_URL || '';

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-500',
  review: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-400',
};

const VIEWS = [
  { key: 'table', label: 'Table', icon: Table2 },
  { key: 'vo', label: 'VO / Audio', icon: Volume2 },
  { key: 'storyboard', label: 'Storyboard', icon: Layout },
];

export default function ScriptSharePage() {
  const { token } = useParams();
  const [script, setScript] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('table');
  const [presentMode, setPresentMode] = useState(false);
  const [presentIndex, setPresentIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expandedAudio, setExpandedAudio] = useState({});
  const saveTimer = useRef(null);
  const touchStartX = useRef(null);

  // ── Comments state ────────────────────────────────────────────────────────
  const [comments, setComments] = useState([]);
  const [showComments, setShowComments] = useState(false);
  const [pendingComment, setPendingComment] = useState(null); // {scene_id, cell, selected_text}
  const [newCommentText, setNewCommentText] = useState('');
  const [commenterName, setCommenterName] = useState(() => localStorage.getItem('cp_commenter_name') || '');
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [submittingComment, setSubmittingComment] = useState(false);
  const [commentSubmitted, setCommentSubmitted] = useState(false);
  const [selectionBtn, setSelectionBtn] = useState(null); // {scene_id, cell, selected_text, rect}
  const commentInputRef = useRef(null);

  const readOnly = script?.share_mode !== 'edit';
  const canComment = ['comment', 'edit'].includes(script?.share_mode);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/scripts/share/${token}`);
        if (!res.ok) { setError('Script not found or link has expired.'); setLoading(false); return; }
        const data = await res.json();
        setScript(data);
        setScenes(Array.isArray(data.scenes) ? data.scenes : []);
        const savedView = localStorage.getItem(`script_view_${data.id}`);
        if (savedView) setView(savedView);
        // Load comments if mode allows
        if (['comment', 'edit'].includes(data.share_mode)) {
          const cr = await fetch(`${API}/api/scripts/share/${token}/comments`);
          if (cr.ok) setComments(await cr.json());
        }
      } catch {
        setError('Failed to load script.');
      }
      setLoading(false);
    })();
  }, [token]);

  const loadComments = useCallback(async () => {
    const res = await fetch(`${API}/api/scripts/share/${token}/comments`);
    if (res.ok) setComments(await res.json());
  }, [token]);

  // Auto-save for edit mode
  const debounceSave = useCallback((updatedScenes) => {
    if (readOnly) return;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await fetch(`${API}/api/scripts/share/${token}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scenes: updatedScenes }),
        });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (e) { console.error(e); }
      setSaving(false);
    }, 800);
  }, [token, readOnly]);

  function handleCellChange(sceneId, field, value) {
    if (readOnly) return;
    const updated = scenes.map(s => s.id === sceneId ? { ...s, [field]: value } : s);
    setScenes(updated);
    debounceSave(updated);
  }

  function handleSetView(v) {
    setView(v);
    if (script) localStorage.setItem(`script_view_${script.id}`, v);
  }

  // Text selection → floating comment button
  function handleTextMouseUp(sceneId, cell) {
    if (!canComment) return;
    const sel = window.getSelection();
    if (!sel || sel.toString().trim() === '') { setSelectionBtn(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setSelectionBtn({ scene_id: sceneId, cell, selected_text: sel.toString().trim(), rect });
  }

  function openCommentPanel(info) {
    setPendingComment(info);
    setNewCommentText('');
    setCommentSubmitted(false);
    setShowComments(true);
    // Check if name is needed
    if (!commenterName.trim()) setShowNamePrompt(true);
    setTimeout(() => commentInputRef.current?.focus(), 100);
  }

  async function submitComment() {
    if (!newCommentText.trim()) return;
    if (!commenterName.trim()) { setShowNamePrompt(true); return; }
    setSubmittingComment(true);
    try {
      const res = await fetch(`${API}/api/scripts/share/${token}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...pendingComment,
          text: newCommentText.trim(),
          author_name: commenterName.trim(),
        }),
      });
      if (res.ok) {
        localStorage.setItem('cp_commenter_name', commenterName.trim());
        setNewCommentText('');
        setPendingComment(null);
        setCommentSubmitted(true);
        await loadComments();
        setTimeout(() => setCommentSubmitted(false), 2000);
      }
    } catch (e) { console.error(e); }
    setSubmittingComment(false);
  }

  function getSceneCommentCount(sceneId) {
    return comments.filter(c => c.scene_id === sceneId && c.status !== 'resolved').length;
  }

  // Present mode keyboard nav
  useEffect(() => {
    if (!presentMode) return;
    function handleKey(e) {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setPresentIndex(i => Math.min(i + 1, scenes.length - 1));
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setPresentIndex(i => Math.max(i - 1, 0));
      if (e.key === 'Escape') setPresentMode(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [presentMode, scenes.length]);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <Loader2 size={32} className="animate-spin text-gray-400" />
    </div>
  );

  if (error || !script) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="text-5xl mb-4">📜</div>
        <h1 className="text-xl font-black text-gray-700 mb-2">Script Not Found</h1>
        <p className="text-sm text-gray-400">{error || 'This link is invalid or has expired.'}</p>
      </div>
    </div>
  );

  const scene = scenes[presentIndex];

  return (
    <>
      {/* Present Mode Overlay */}
      {presentMode && (
        <div
          className="fixed inset-0 z-50 bg-black flex flex-col"
          onTouchStart={e => { touchStartX.current = e.touches[0].clientX; }}
          onTouchEnd={e => {
            if (touchStartX.current === null) return;
            const dx = e.changedTouches[0].clientX - touchStartX.current;
            touchStartX.current = null;
            if (dx > 60) setPresentIndex(i => Math.max(i - 1, 0));
            if (dx < -60) setPresentIndex(i => Math.min(i + 1, scenes.length - 1));
          }}
        >
          <div className="flex items-center justify-between px-8 py-4 text-white/50 text-sm">
            <span className="font-bold text-white text-base">{script.title}</span>
            <span>Scene {presentIndex + 1} / {scenes.length}</span>
            <button onClick={() => setPresentMode(false)} className="text-white/60 hover:text-white">
              <X size={20} />
            </button>
          </div>

          {scene && (
            <div className="flex-1 flex flex-col items-center justify-center px-16 gap-8">
              <div className="text-white/40 text-sm font-mono uppercase tracking-widest">
                {scene.location || 'No location'}
              </div>
              <div className="grid grid-cols-2 gap-16 w-full max-w-5xl">
                <div>
                  <div className="text-white/40 text-xs uppercase tracking-widest mb-3 font-semibold">What We See</div>
                  <p className="text-white text-xl leading-relaxed">{scene.what_we_see || '—'}</p>
                </div>
                <div>
                  <div className="text-indigo-400 text-xs uppercase tracking-widest mb-3 font-semibold">What We Hear</div>
                  <p className="text-indigo-200 text-xl leading-relaxed italic">{scene.what_we_hear || '—'}</p>
                </div>
              </div>
              {scene.images?.length > 0 && (
                <div className="flex gap-3 overflow-x-auto max-w-full pb-2">
                  {scene.images.map(img => (
                    <img key={img.id} src={img.url} alt="" className="h-28 w-auto rounded-xl object-cover shrink-0" />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Nav */}
          <div className="flex items-center justify-center gap-6 px-8 py-6">
            <button
              onClick={() => setPresentIndex(i => Math.max(i - 1, 0))}
              disabled={presentIndex === 0}
              className="w-12 h-12 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-colors"
            >
              <ChevronLeft size={32} />
            </button>
            <div className="flex gap-1.5">
              {scenes.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPresentIndex(i)}
                  className={clsx('w-2.5 h-2.5 rounded-full transition-all', i === presentIndex ? 'bg-white scale-125' : 'bg-white/30')}
                />
              ))}
            </div>
            <button
              onClick={() => setPresentIndex(i => Math.min(i + 1, scenes.length - 1))}
              disabled={presentIndex === scenes.length - 1}
              className="w-12 h-12 flex items-center justify-center rounded-full text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-20 transition-colors"
            >
              <ChevronRight size={32} />
            </button>
          </div>
        </div>
      )}

      {/* Main page */}
      <div className="min-h-screen bg-gray-50 scripts-share-page">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 scripts-no-print">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex flex-col">
                <h1 className="text-lg font-black text-gray-900">{script.title}</h1>
                {script.project_name && (
                  <span className="text-xs text-gray-400">{script.project_name}</span>
                )}
              </div>
              <span className={clsx('text-xs font-semibold px-2.5 py-1 rounded-full', STATUS_COLORS[script.status])}>
                {script.status}
              </span>
              {!readOnly && (
                <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-semibold">Edit enabled</span>
              )}
              {canComment && script.share_mode === 'comment' && (
                <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold">💬 Comment enabled</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Save indicator */}
              {!readOnly && (
                <span className="text-xs text-gray-400 min-w-[44px]">
                  {saving ? 'Saving...' : saved ? '✓ Saved' : ''}
                </span>
              )}

              {/* View toggle */}
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                {VIEWS.map(v => {
                  const Icon = v.icon;
                  return (
                    <button
                      key={v.key}
                      onClick={() => handleSetView(v.key)}
                      title={v.label}
                      className={clsx(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                        view === v.key ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'
                      )}
                    >
                      <Icon size={13} />
                      <span className="hidden sm:inline">{v.label}</span>
                    </button>
                  );
                })}
              </div>

              {canComment && (
                <button
                  onClick={() => { setShowComments(true); setPendingComment(null); }}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border',
                    showComments ? 'bg-amber-500 text-white border-amber-500' : 'border-amber-200 text-amber-700 hover:bg-amber-50'
                  )}
                >
                  <MessageSquare size={13} />
                  <span className="hidden sm:inline">Comments</span>
                  {comments.filter(c => c.status !== 'resolved').length > 0 && (
                    <span className="bg-amber-600 text-white text-[10px] rounded-full px-1.5 py-0.5 font-bold">
                      {comments.filter(c => c.status !== 'resolved').length}
                    </span>
                  )}
                </button>
              )}
              <button
                onClick={() => { setPresentIndex(0); setPresentMode(true); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-800 hover:bg-gray-900 text-white text-xs font-medium transition-colors"
              >
                <Maximize2 size={13} /> Present
              </button>
              <button
                onClick={() => window.print()}
                className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 text-gray-500 transition-colors"
              >
                <Printer size={15} />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto p-6">

          {/* ── TABLE VIEW ──────────────────────────────────── */}
          {view === 'table' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
              <table className="w-full scripts-table min-w-[640px]">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-widest text-gray-400 font-bold">
                  <tr>
                    <th className="w-12 px-3 py-3 text-center">#</th>
                    <th className="w-40 px-3 py-3 text-left">Location</th>
                    <th className="px-3 py-3 text-left">What We See</th>
                    <th className="px-3 py-3 text-left">What We Hear</th>
                    <th className="w-48 px-3 py-3 text-left">Visuals</th>
                    {canComment && <th className="w-10 px-2 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {scenes.map((scene, idx) => {
                    const sceneComments = getSceneCommentCount(scene.id);
                    return (
                    <tr key={scene.id} className="border-t border-gray-100 align-top hover:bg-gray-50/50 group">
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs font-bold text-gray-400">{idx + 1}</span>
                      </td>
                      <td className="w-40 px-3 py-3" onMouseUp={() => handleTextMouseUp(scene.id, 'location')}>
                        {readOnly ? (
                          <span className="text-xs font-mono text-gray-600 select-text">{scene.location || '—'}</span>
                        ) : (
                          <textarea value={scene.location || ''} onChange={e => handleCellChange(scene.id, 'location', e.target.value)}
                            className="w-full resize-none border-0 outline-none bg-transparent text-xs font-mono text-gray-600 min-h-[60px]" rows={2} />
                        )}
                      </td>
                      <td className="px-3 py-3" onMouseUp={() => handleTextMouseUp(scene.id, 'what_we_see')}>
                        {readOnly ? (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap select-text">{scene.what_we_see || '—'}</p>
                        ) : (
                          <textarea value={scene.what_we_see || ''} onChange={e => handleCellChange(scene.id, 'what_we_see', e.target.value)}
                            className="w-full resize-none border-0 outline-none bg-transparent text-sm text-gray-700 min-h-[80px]" rows={4} />
                        )}
                      </td>
                      <td className="px-3 py-3" onMouseUp={() => handleTextMouseUp(scene.id, 'what_we_hear')}>
                        {readOnly ? (
                          <p className="text-sm text-indigo-700 italic whitespace-pre-wrap select-text">{scene.what_we_hear || '—'}</p>
                        ) : (
                          <textarea value={scene.what_we_hear || ''} onChange={e => handleCellChange(scene.id, 'what_we_hear', e.target.value)}
                            className="w-full resize-none border-0 outline-none bg-transparent text-sm text-indigo-700 italic min-h-[80px]" rows={4} />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(scene.images || []).map(img => (
                            <img key={img.id} src={img.url} alt=""
                              className="w-16 h-12 object-cover rounded-lg cursor-pointer hover:scale-105 transition-transform scripts-visuals"
                              onClick={() => window.open(img.url, '_blank')} />
                          ))}
                        </div>
                      </td>
                      {canComment && (
                        <td className="px-2 py-3">
                          <button
                            onClick={() => openCommentPanel({ scene_id: scene.id, cell: null, selected_text: null })}
                            className={clsx('flex items-center gap-1 text-[11px] rounded-lg px-1.5 py-1 transition-colors',
                              sceneComments > 0 ? 'text-amber-600 bg-amber-50' : 'text-gray-300 hover:text-amber-500 opacity-0 group-hover:opacity-100')}
                          >
                            <MessageSquare size={12} />
                            {sceneComments > 0 && <span className="font-bold">{sceneComments}</span>}
                          </button>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                  {scenes.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-sm text-gray-400">No scenes</td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>
          )}

          {/* ── VO / AUDIO VIEW ────────────────────────────── */}
          {view === 'vo' && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <table className="w-full scripts-table">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-widest text-gray-400 font-bold">
                  <tr>
                    <th className="w-12 px-4 py-3 text-center">#</th>
                    <th className="w-44 px-4 py-3 text-left">Location</th>
                    <th className="px-4 py-3 text-left">What We Hear</th>
                    {canComment && <th className="w-10 px-2 py-3" />}
                  </tr>
                </thead>
                <tbody>
                  {scenes.map((scene, idx) => {
                    const sceneComments = getSceneCommentCount(scene.id);
                    return (
                    <tr key={scene.id} className="border-t border-gray-100 align-top hover:bg-gray-50/50 group">
                      <td className="px-4 py-4 text-center">
                        <span className="text-xs font-bold text-gray-400">{idx + 1}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs font-mono text-gray-500">{scene.location || '—'}</span>
                      </td>
                      <td className="px-4 py-4" onMouseUp={() => handleTextMouseUp(scene.id, 'what_we_hear')}>
                        {readOnly ? (
                          <p className="text-base text-indigo-800 italic leading-relaxed whitespace-pre-wrap select-text">{scene.what_we_hear || '—'}</p>
                        ) : (
                          <textarea value={scene.what_we_hear || ''} onChange={e => handleCellChange(scene.id, 'what_we_hear', e.target.value)}
                            className="w-full resize-none border-0 outline-none bg-transparent text-base text-indigo-800 italic min-h-[80px] leading-relaxed" rows={3} />
                        )}
                      </td>
                      {canComment && (
                        <td className="px-2 py-4">
                          <button onClick={() => openCommentPanel({ scene_id: scene.id, cell: 'what_we_hear', selected_text: null })}
                            className={clsx('flex items-center gap-1 text-[11px] rounded-lg px-1.5 py-1 transition-colors',
                              sceneComments > 0 ? 'text-amber-600 bg-amber-50' : 'text-gray-300 hover:text-amber-500 opacity-0 group-hover:opacity-100')}>
                            <MessageSquare size={12} />{sceneComments > 0 && <span className="font-bold">{sceneComments}</span>}
                          </button>
                        </td>
                      )}
                    </tr>
                    );
                  })}
                  {scenes.length === 0 && (
                    <tr><td colSpan={canComment ? 4 : 3} className="py-12 text-center text-sm text-gray-400">No scenes</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── STORYBOARD VIEW ────────────────────────────── */}
          {view === 'storyboard' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {scenes.map((scene, idx) => {
                const sceneComments = getSceneCommentCount(scene.id);
                return (
                <div key={scene.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden group relative">
                  <div className="bg-gray-100 aspect-video overflow-hidden">
                    {scene.images?.length > 0 ? (
                      <img src={scene.images[0].url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs font-medium">No image</div>
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-bold text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5 shrink-0">{idx + 1}</span>
                        <span className="text-[10px] font-mono text-gray-500 truncate">{scene.location || '—'}</span>
                      </div>
                      {canComment && (
                        <button onClick={() => openCommentPanel({ scene_id: scene.id, cell: null, selected_text: null })}
                          className={clsx('flex items-center gap-1 text-[11px] rounded-lg px-1.5 py-1 transition-colors shrink-0',
                            sceneComments > 0 ? 'text-amber-600 bg-amber-50' : 'text-gray-300 hover:text-amber-500')}>
                          <MessageSquare size={11} />{sceneComments > 0 && <span className="font-bold">{sceneComments}</span>}
                        </button>
                      )}
                    </div>
                    {scene.what_we_see && (
                      <p className="text-xs text-gray-700 line-clamp-2 leading-relaxed">{scene.what_we_see}</p>
                    )}
                    {scene.what_we_hear && (
                      <button className="text-left w-full mt-1" onClick={() => setExpandedAudio(prev => ({ ...prev, [scene.id]: !prev[scene.id] }))}>
                        <p className={clsx('text-xs text-indigo-600 italic', expandedAudio[scene.id] ? '' : 'line-clamp-2')}>{scene.what_we_hear}</p>
                        {scene.what_we_hear.length > 80 && (
                          <span className="text-[10px] text-indigo-400">{expandedAudio[scene.id] ? 'less ▲' : 'more ▼'}</span>
                        )}
                      </button>
                    )}
                    {scene.images?.length > 1 && (
                      <div className="flex gap-1 mt-2 overflow-x-auto">
                        {scene.images.slice(1).map(img => (
                          <img key={img.id} src={img.url} alt="" className="h-8 w-10 object-cover rounded flex-shrink-0" />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                );
              })}
              {scenes.length === 0 && <div className="col-span-full py-16 text-center text-sm text-gray-400">No scenes</div>}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-white px-6 py-4 mt-8 scripts-no-print">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-gray-400">
            <span>Powered by CP Panel</span>
            {script.updated_at && <span>Last updated {new Date(script.updated_at).toLocaleDateString()}</span>}
          </div>
        </div>
      </div>

      {/* ── Floating text selection comment button ── */}
      {selectionBtn && canComment && (
        <div
          className="fixed z-50 transform -translate-x-1/2"
          style={{ top: selectionBtn.rect.top + window.scrollY - 40, left: selectionBtn.rect.left + selectionBtn.rect.width / 2 }}
        >
          <button
            onMouseDown={e => { e.preventDefault(); openCommentPanel(selectionBtn); setSelectionBtn(null); }}
            className="flex items-center gap-1.5 bg-gray-900 text-white text-xs font-semibold px-3 py-1.5 rounded-full shadow-xl hover:bg-gray-700 transition-colors"
          >
            <MessageSquare size={11} /> Comment
          </button>
        </div>
      )}

      {/* ── Comments Sidebar ── */}
      {showComments && canComment && (
        <div className="fixed inset-y-0 right-0 z-40 w-80 bg-white border-l border-gray-200 shadow-2xl flex flex-col scripts-no-print">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2">
              <MessageSquare size={14} className="text-amber-500" /> Comments
              {comments.filter(c => c.status !== 'resolved').length > 0 && (
                <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {comments.filter(c => c.status !== 'resolved').length}
                </span>
              )}
            </h3>
            <button onClick={() => setShowComments(false)} className="text-gray-400 hover:text-gray-600"><X size={16} /></button>
          </div>

          {/* Name prompt */}
          {showNamePrompt && (
            <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
              <p className="text-xs font-semibold text-amber-800 mb-2">What's your name?</p>
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={commenterName}
                  onChange={e => setCommenterName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && commenterName.trim()) { localStorage.setItem('cp_commenter_name', commenterName.trim()); setShowNamePrompt(false); commentInputRef.current?.focus(); } }}
                  placeholder="Your name"
                  className="flex-1 border border-amber-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-amber-400 bg-white"
                />
                <button
                  onClick={() => { if (commenterName.trim()) { localStorage.setItem('cp_commenter_name', commenterName.trim()); setShowNamePrompt(false); commentInputRef.current?.focus(); } }}
                  className="bg-amber-500 text-white text-xs px-3 py-1.5 rounded-lg font-semibold hover:bg-amber-600 transition-colors"
                >OK</button>
              </div>
            </div>
          )}

          {/* Comment context */}
          {pendingComment?.selected_text && (
            <div className="px-4 py-2 bg-indigo-50 border-b border-indigo-100">
              <p className="text-[10px] text-indigo-400 font-semibold uppercase tracking-wide mb-1">Commenting on:</p>
              <p className="text-xs text-indigo-700 italic line-clamp-2">"{pendingComment.selected_text}"</p>
            </div>
          )}
          {pendingComment?.scene_id && !pendingComment?.selected_text && (
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
              <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">
                Scene {(scenes.findIndex(s => s.id === pendingComment.scene_id) + 1)} —{' '}
                {scenes.find(s => s.id === pendingComment.scene_id)?.location || 'No location'}
              </p>
            </div>
          )}

          {/* Comment input */}
          <div className="px-4 py-3 border-b border-gray-100 bg-white">
            <textarea
              ref={commentInputRef}
              value={newCommentText}
              onChange={e => setNewCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) submitComment(); }}
              placeholder="Write a comment... (⌘↵ to send)"
              className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none resize-none h-20 focus:border-amber-400 focus:ring-1 focus:ring-amber-200"
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[11px] text-gray-400">{commenterName || 'Anonymous'}</span>
              <div className="flex gap-2">
                {pendingComment && <button onClick={() => { setPendingComment(null); setNewCommentText(''); }} className="text-xs text-gray-400 hover:text-gray-600">Cancel</button>}
                <button
                  onClick={submitComment}
                  disabled={submittingComment || !newCommentText.trim() || showNamePrompt}
                  className="flex items-center gap-1.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors"
                >
                  {commentSubmitted ? <><Check size={12} /> Sent!</> : submittingComment ? <Loader2 size={12} className="animate-spin" /> : <><Send size={12} /> Send</>}
                </button>
              </div>
            </div>
          </div>

          {/* Comments list */}
          <div className="flex-1 overflow-y-auto py-2">
            {comments.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-gray-400">
                <MessageSquare size={24} className="mx-auto mb-2 opacity-30" />
                No comments yet. Be the first!
              </div>
            ) : (
              comments.map(c => {
                const scene = scenes.find(s => s.id === c.scene_id);
                const cellLabel = { what_we_see: 'What We See', what_we_hear: 'What We Hear', location: 'Location' }[c.cell] || '';
                return (
                  <div key={c.id} className={clsx('px-4 py-3 border-b border-gray-50 hover:bg-gray-50/50', c.status === 'resolved' && 'opacity-40')}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-gray-800">{c.author_name}</span>
                      <span className="text-[10px] text-gray-400">{new Date(c.created_at).toLocaleDateString()}</span>
                    </div>
                    {(scene || cellLabel) && (
                      <div className="flex items-center gap-1 mb-1.5">
                        {scene && <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">Scene {scenes.indexOf(scene) + 1}{scene.location ? ` · ${scene.location}` : ''}</span>}
                        {cellLabel && <span className="text-[10px] bg-indigo-50 text-indigo-500 rounded px-1.5 py-0.5">{cellLabel}</span>}
                      </div>
                    )}
                    {c.selected_text && (
                      <p className="text-[11px] text-gray-400 italic border-l-2 border-gray-200 pl-2 mb-1.5 line-clamp-2">"{c.selected_text}"</p>
                    )}
                    <p className="text-sm text-gray-700 leading-relaxed">{c.text}</p>
                    {c.status === 'resolved' && <span className="text-[10px] text-green-600 font-semibold mt-1 inline-block">✓ Resolved</span>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Print CSS */}
      <style>{`
        @media print {
          .scripts-no-print { display: none !important; }
          .scripts-table { width: 100%; border-collapse: collapse; }
          .scripts-table tr { page-break-inside: avoid; }
          .scripts-table td, .scripts-table th { border: 1px solid #ccc; padding: 8px; vertical-align: top; font-size: 11px; }
          .scripts-visuals { max-width: 90px; max-height: 70px; object-fit: cover; }
        }
      `}</style>
    </>
  );
}

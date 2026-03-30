import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Table2, Volume2, Layout, Maximize2, X, ChevronLeft, ChevronRight,
  Printer, ExternalLink, Loader2, GripVertical,
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
  // Touch swipe for present mode
  const touchStartX = useRef(null);

  const readOnly = script?.share_mode !== 'edit';

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${API}/api/scripts/share/${token}`);
        if (!res.ok) { setError('Script not found or link has expired.'); setLoading(false); return; }
        const data = await res.json();
        setScript(data);
        setScenes(Array.isArray(data.scenes) ? data.scenes : []);
        // Restore view preference
        const saved = localStorage.getItem(`script_view_${data.id}`);
        if (saved) setView(saved);
      } catch {
        setError('Failed to load script.');
      }
      setLoading(false);
    })();
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
                <span className="text-xs bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full font-semibold">
                  Edit enabled
                </span>
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
                  </tr>
                </thead>
                <tbody>
                  {scenes.map((scene, idx) => (
                    <tr key={scene.id} className="border-t border-gray-100 align-top hover:bg-gray-50/50">
                      <td className="px-3 py-3 text-center">
                        <span className="text-xs font-bold text-gray-400">{idx + 1}</span>
                      </td>
                      <td className="w-40 px-3 py-3">
                        {readOnly ? (
                          <span className="text-xs font-mono text-gray-600">{scene.location || '—'}</span>
                        ) : (
                          <textarea
                            value={scene.location || ''}
                            onChange={e => handleCellChange(scene.id, 'location', e.target.value)}
                            className="w-full resize-none border-0 outline-none bg-transparent text-xs font-mono text-gray-600 min-h-[60px]"
                            rows={2}
                          />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {readOnly ? (
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{scene.what_we_see || '—'}</p>
                        ) : (
                          <textarea
                            value={scene.what_we_see || ''}
                            onChange={e => handleCellChange(scene.id, 'what_we_see', e.target.value)}
                            className="w-full resize-none border-0 outline-none bg-transparent text-sm text-gray-700 min-h-[80px]"
                            rows={4}
                          />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {readOnly ? (
                          <p className="text-sm text-indigo-700 italic whitespace-pre-wrap">{scene.what_we_hear || '—'}</p>
                        ) : (
                          <textarea
                            value={scene.what_we_hear || ''}
                            onChange={e => handleCellChange(scene.id, 'what_we_hear', e.target.value)}
                            className="w-full resize-none border-0 outline-none bg-transparent text-sm text-indigo-700 italic min-h-[80px]"
                            rows={4}
                          />
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(scene.images || []).map(img => (
                            <img
                              key={img.id}
                              src={img.url}
                              alt=""
                              className="w-16 h-12 object-cover rounded-lg cursor-pointer hover:scale-105 transition-transform scripts-visuals"
                              onClick={() => window.open(img.url, '_blank')}
                            />
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
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
                  </tr>
                </thead>
                <tbody>
                  {scenes.map((scene, idx) => (
                    <tr key={scene.id} className="border-t border-gray-100 align-top hover:bg-gray-50/50">
                      <td className="px-4 py-4 text-center">
                        <span className="text-xs font-bold text-gray-400">{idx + 1}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs font-mono text-gray-500">{scene.location || '—'}</span>
                      </td>
                      <td className="px-4 py-4">
                        {readOnly ? (
                          <p className="text-base text-indigo-800 italic leading-relaxed whitespace-pre-wrap">
                            {scene.what_we_hear || '—'}
                          </p>
                        ) : (
                          <textarea
                            value={scene.what_we_hear || ''}
                            onChange={e => handleCellChange(scene.id, 'what_we_hear', e.target.value)}
                            className="w-full resize-none border-0 outline-none bg-transparent text-base text-indigo-800 italic min-h-[80px] leading-relaxed"
                            rows={3}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                  {scenes.length === 0 && (
                    <tr>
                      <td colSpan={3} className="py-12 text-center text-sm text-gray-400">No scenes</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── STORYBOARD VIEW ────────────────────────────── */}
          {view === 'storyboard' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {scenes.map((scene, idx) => (
                <div key={scene.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                  {/* Images */}
                  <div className="bg-gray-100 aspect-video overflow-hidden">
                    {scene.images?.length > 0 ? (
                      <img src={scene.images[0].url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs font-medium">
                        No image
                      </div>
                    )}
                  </div>
                  {/* Info */}
                  <div className="p-3">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-[10px] font-bold text-gray-400 bg-gray-100 rounded-full px-1.5 py-0.5">
                        {idx + 1}
                      </span>
                      <span className="text-[10px] font-mono text-gray-500 truncate">{scene.location || '—'}</span>
                    </div>
                    {scene.what_we_see && (
                      <p className="text-xs text-gray-700 line-clamp-2 leading-relaxed">{scene.what_we_see}</p>
                    )}
                    {scene.what_we_hear && (
                      <button
                        className="text-left w-full mt-1"
                        onClick={() => setExpandedAudio(prev => ({ ...prev, [scene.id]: !prev[scene.id] }))}
                      >
                        <p className={clsx('text-xs text-indigo-600 italic', expandedAudio[scene.id] ? '' : 'line-clamp-2')}>
                          {scene.what_we_hear}
                        </p>
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
              ))}
              {scenes.length === 0 && (
                <div className="col-span-full py-16 text-center text-sm text-gray-400">No scenes</div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-white px-6 py-4 mt-8 scripts-no-print">
          <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-gray-400">
            <span>Powered by CP Panel</span>
            {script.updated_at && (
              <span>Last updated {new Date(script.updated_at).toLocaleDateString()}</span>
            )}
          </div>
        </div>
      </div>

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

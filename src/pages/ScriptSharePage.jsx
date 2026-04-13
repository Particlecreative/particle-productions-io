import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import {
  Table2, Volume2, Layout, Maximize2, X, ChevronLeft, ChevronRight,
  Printer, Loader2, MessageSquare, Send, Check, Play, Pause, Download,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import clsx from 'clsx';
import { CommentSidebar, NameModal } from '../components/scripts/CommentPanel';

// Sanitize and render rich text (muted spans, bold, italic, colors)
const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'span', 'br', 'font', 'div', 'p'],
  ALLOWED_ATTR: ['style', 'class', 'data-muted', 'color'],
};
function RichTextDisplay({ html, className }) {
  if (!html) return <span className={className}>—</span>;
  const clean = DOMPurify.sanitize(html, PURIFY_CONFIG);
  return <span className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}

// Editable rich text cell for share page edit mode — renders HTML instead of showing raw tags
function EditableRichText({ html, onChange, className, placeholder }) {
  const ref = useRef(null);
  const lastHtml = useRef(html);

  useEffect(() => {
    if (ref.current && html !== lastHtml.current) {
      ref.current.innerHTML = DOMPurify.sanitize(html || '', PURIFY_CONFIG);
      lastHtml.current = html;
    }
  }, [html]);

  // Set initial HTML
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = DOMPurify.sanitize(html || '', PURIFY_CONFIG);
    }
  }, []); // eslint-disable-line

  function handleInput() {
    const newHtml = ref.current?.innerHTML || '';
    lastHtml.current = newHtml;
    onChange(newHtml);
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onInput={handleInput}
      className={`${className} outline-none min-h-[60px] whitespace-pre-wrap`}
      data-placeholder={placeholder}
    />
  );
}

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
  const [playingSceneId, setPlayingSceneId] = useState(null);
  const [downloadingVO, setDownloadingVO] = useState(false);
  const [lightbox, setLightbox] = useState(null); // { url, name }
  const [fullVOUrl, setFullVOUrl] = useState(null);
  const [fullVOPlaying, setFullVOPlaying] = useState(false);
  const [fullVOProgress, setFullVOProgress] = useState(0);
  const [fullVODuration, setFullVODuration] = useState(0);
  const fullVORef = useRef(null);
  const audioRef = useRef(null);
  const saveTimer = useRef(null);
  const touchStartX = useRef(null);

  // ── Voice picker state ─────────────────────────────────────────────────────
  const [voiceId, setVoiceId] = useState(null); // loaded from script.voice_settings
  const [voiceSpeed, setVoiceSpeed] = useState(1.0);
  const [voiceStability, setVoiceStability] = useState(0.5);
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [accountVoices, setAccountVoices] = useState([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceSearch, setVoiceSearch] = useState('');
  const [genderFilter, setGenderFilter] = useState('');
  const [previewingVoice, setPreviewingVoice] = useState(null);
  const previewAudioRef = useRef(null);

  // ── Comments state ────────────────────────────────────────────────────────
  const [comments, setComments] = useState([]);
  const [showComments, setShowComments] = useState(false);
  const [pendingComment, setPendingComment] = useState(null);
  const [commenterName, setCommenterName] = useState(() => localStorage.getItem('cp_commenter_name') || '');
  const [showNameModal, setShowNameModal] = useState(false);
  const [selectionBtn, setSelectionBtn] = useState(null);

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
        // Load voice settings from script
        if (data.voice_settings) {
          if (data.voice_settings.voice_id) setVoiceId(data.voice_settings.voice_id);
          if (data.voice_settings.speed) setVoiceSpeed(data.voice_settings.speed);
          if (data.voice_settings.stability) setVoiceStability(data.voice_settings.stability);
        }
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
      // Auto-print if ?print=1 query param
      const params = new URLSearchParams(window.location.search);
      if (params.get('print') === '1') {
        setTimeout(() => window.print(), 600);
      }
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

  // ── Voice functions ──
  async function loadVoices() {
    if (accountVoices.length > 0) return;
    setLoadingVoices(true);
    try {
      const res = await fetch(`${API}/api/scripts/share/${token}/voices`);
      const data = await res.json();
      if (data.voices) setAccountVoices(data.voices);
    } catch (e) { console.error('Failed to load voices:', e); }
    setLoadingVoices(false);
  }

  async function saveVoiceSettings(vid, spd, stab) {
    try {
      await fetch(`${API}/api/scripts/share/${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenes, voice_settings: { voice_id: vid, speed: spd, stability: stab } }),
      });
    } catch (e) { console.error('Failed to save voice settings:', e); }
  }

  async function handlePreviewVoice(vid) {
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
    if (previewingVoice === vid) { setPreviewingVoice(null); return; }
    setPreviewingVoice(vid);
    try {
      const res = await fetch(`${API}/api/scripts/share/${token}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene_id: scenes[0]?.id, voice_id: vid, speed: voiceSpeed, stability: voiceStability }),
      });
      const data = await res.json();
      if (data.audio_base64) {
        const audio = new Audio(`data:${data.mime_type};base64,${data.audio_base64}`);
        previewAudioRef.current = audio;
        audio.onended = () => { setPreviewingVoice(null); previewAudioRef.current = null; };
        audio.play();
      } else { setPreviewingVoice(null); }
    } catch { setPreviewingVoice(null); }
  }

  // ── TTS Playback (share page) ──
  async function handlePlayScene(sceneId) {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (playingSceneId === sceneId) { setPlayingSceneId(null); return; }
    setPlayingSceneId(sceneId);
    try {
      const res = await fetch(`${API}/api/scripts/share/${token}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene_id: sceneId, voice_id: voiceId || undefined, speed: voiceSpeed, stability: voiceStability }),
      });
      const data = await res.json();
      if (!data.audio_base64) { setPlayingSceneId(null); return; }
      const audio = new Audio(`data:${data.mime_type};base64,${data.audio_base64}`);
      audioRef.current = audio;
      audio.onended = () => { setPlayingSceneId(null); audioRef.current = null; };
      audio.onerror = () => { setPlayingSceneId(null); audioRef.current = null; };
      audio.play();
    } catch { setPlayingSceneId(null); }
  }

  async function handlePlayFullVO() {
    if (fullVORef.current && fullVOUrl) {
      if (fullVOPlaying) { fullVORef.current.pause(); setFullVOPlaying(false); }
      else { fullVORef.current.play(); setFullVOPlaying(true); }
      return;
    }
    if (downloadingVO) return;
    setDownloadingVO(true);
    try {
      const res = await fetch(`${API}/api/scripts/share/${token}/tts-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice_id: voiceId || undefined, speed: voiceSpeed, stability: voiceStability }),
      });
      if (!res.ok) { setDownloadingVO(false); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setFullVOUrl(url);
      const audio = new Audio(url);
      fullVORef.current = audio;
      audio.onloadedmetadata = () => setFullVODuration(audio.duration);
      audio.ontimeupdate = () => setFullVOProgress(audio.currentTime);
      audio.onended = () => { setFullVOPlaying(false); setFullVOProgress(0); };
      audio.play();
      setFullVOPlaying(true);
    } catch {}
    setDownloadingVO(false);
  }

  function handleStopFullVO() {
    if (fullVORef.current) { fullVORef.current.pause(); fullVORef.current.currentTime = 0; fullVORef.current = null; }
    setFullVOPlaying(false); setFullVOProgress(0); setFullVOUrl(null);
  }

  function handleSeekFullVO(e) {
    if (fullVORef.current && fullVODuration > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      fullVORef.current.currentTime = pct * fullVODuration;
    }
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
    setShowComments(true);
    // Show name modal if no name set — don't steal focus
    if (!commenterName.trim()) setShowNameModal(true);
  }

  async function handleSubmitComment(data) {
    if (!data.text?.trim()) return;
    if (!commenterName.trim()) { setShowNameModal(true); return; }
    try {
      await fetch(`${API}/api/scripts/share/${token}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, author_name: commenterName.trim() }),
      });
      setPendingComment(null);
      await loadComments();
    } catch (e) { console.error(e); }
  }

  async function handleReplyComment(parentId, text) {
    if (!text.trim() || !commenterName.trim()) return;
    const parent = comments.find(c => c.id === parentId);
    try {
      await fetch(`${API}/api/scripts/share/${token}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scene_id: parent?.scene_id, text, author_name: commenterName.trim(), parent_comment_id: parentId }),
      });
      await loadComments();
    } catch (e) { console.error(e); }
  }

  async function handleResolveComment(commentId, status) {
    try {
      await fetch(`${API}/api/scripts/share/${token}/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolved_by_name: commenterName.trim() || 'Anonymous' }),
      });
      await loadComments();
    } catch (e) { console.error(e); }
  }

  function getSceneCommentCount(sceneId) {
    return comments.filter(c => c.scene_id === sceneId && !c.parent_comment_id && c.status !== 'resolved').length;
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
            <span className="flex items-center gap-2">
              {scene?.highlight_color && <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: scene.highlight_color }} />}
              Scene {presentIndex + 1} / {scenes.length}
            </span>
            <button onClick={() => setPresentMode(false)} className="text-white/60 hover:text-white">
              <X size={20} />
            </button>
          </div>

          {scene && (
            <div className="flex-1 flex items-center justify-center px-6 py-4 overflow-hidden">
              <div className="w-full max-w-6xl flex gap-6 items-stretch" style={{ maxHeight: 'calc(100vh - 160px)' }}>
                {/* Image — large, dominant */}
                <div className="flex-1 min-w-0 flex items-center justify-center rounded-2xl overflow-hidden bg-white/5">
                  {scene.images?.length > 0 ? (
                    <img
                      src={scene.images[0].url} alt=""
                      className="w-full h-full object-contain rounded-2xl cursor-pointer transition-transform hover:scale-[1.02]"
                      style={{ maxHeight: 'calc(100vh - 180px)' }}
                      onClick={() => setLightbox({ url: scene.images[0].url, name: scene.images[0].prompt || '' })}
                    />
                  ) : (
                    <div className="w-full aspect-video flex items-center justify-center text-white/20 text-lg">No visual</div>
                  )}
                </div>

                {/* Text panel — right side */}
                <div className="w-[340px] flex-shrink-0 flex flex-col justify-center gap-5">
                  <div className="text-white/30 text-[10px] font-mono uppercase tracking-[0.2em]">
                    {scene.location || 'No location'}
                  </div>

                  <div>
                    <div className="text-white/40 text-[10px] uppercase tracking-widest mb-2 font-semibold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-white/40" /> What We See
                    </div>
                    <RichTextDisplay html={scene.what_we_see} className="text-white/90 text-base leading-relaxed block" />
                  </div>

                  <div className="bg-white/5 rounded-xl px-4 py-3">
                    <div className="text-indigo-400 text-[10px] uppercase tracking-widest mb-2 font-semibold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" /> What We Hear
                    </div>
                    <RichTextDisplay html={scene.what_we_hear} className="text-indigo-200 text-base leading-relaxed italic block" />
                    {scene.what_we_hear?.trim() && (
                      <button onClick={(e) => { e.stopPropagation(); handlePlayScene(scene.id); }}
                        className={clsx('mt-2 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full transition-colors',
                          playingSceneId === scene.id ? 'bg-indigo-500/30 text-indigo-200' : 'text-indigo-400 hover:text-indigo-200 hover:bg-indigo-500/20')}>
                        {playingSceneId === scene.id ? <><Loader2 size={11} className="animate-spin" /> Playing…</> : <><Play size={11} /> Play VO</>}
                      </button>
                    )}
                  </div>

                  {/* Thumbnail strip for multi-image scenes */}
                  {scene.images?.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pt-1">
                      {scene.images.map((img, imgIdx) => (
                        <img key={img.id} src={img.url} alt=""
                          className={clsx('h-12 w-16 object-cover rounded-lg shrink-0 cursor-pointer transition-all border-2',
                            imgIdx === 0 ? 'border-white/40' : 'border-transparent hover:border-white/30')}
                          onClick={() => setLightbox({ url: img.url, name: img.prompt || '' })} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
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
                  className={clsx('w-2.5 h-2.5 rounded-full transition-all', i === presentIndex ? 'scale-125' : 'opacity-40')}
                  style={{ backgroundColor: scenes[i]?.highlight_color || 'white' }}
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
        {/* Image Lightbox */}
        {lightbox && (
          <div className="fixed inset-0 z-[100] bg-black/85 flex flex-col items-center justify-center p-6 animate-fade-in" onClick={() => setLightbox(null)}>
            <div className="relative max-w-5xl w-full flex flex-col items-center" onClick={e => e.stopPropagation()}>
              <img src={lightbox.url} alt={lightbox.name || 'Visual'} className="max-w-full max-h-[80vh] rounded-xl shadow-2xl object-contain" />
              <button onClick={() => setLightbox(null)} className="absolute -top-2 -right-2 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg text-gray-500 hover:text-gray-800 transition-colors z-10">
                <X size={16} />
              </button>
              {lightbox.name && (
                <div className="mt-3 max-w-lg text-center">
                  <p className="text-white/70 text-xs leading-relaxed">{lightbox.name}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Header — brand themed */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 scripts-no-print">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {script.brand_name && (
                <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-2 py-0.5 bg-gray-100 rounded">{script.brand_name}</span>
              )}
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
                <span className="text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold">Comment enabled</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Voice picker — edit mode only */}
              {!readOnly && (
                <button onClick={() => { setShowVoicePicker(true); loadVoices(); }}
                  className="flex items-center gap-1 text-[10px] px-2.5 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-100 transition-colors font-semibold"
                  title="Voice settings">
                  <Volume2 size={11} />
                  {accountVoices.find(v => v.voice_id === voiceId)?.name || 'Voice'}
                </button>
              )}

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
              {/* Full VO Player */}
              {fullVOUrl ? (
                <div className="flex items-center gap-1.5 bg-indigo-100 rounded-lg px-2.5 py-1.5">
                  <button onClick={handlePlayFullVO} className="text-indigo-600 hover:text-indigo-800">
                    {fullVOPlaying ? <Pause size={14} /> : <Play size={14} />}
                  </button>
                  <div className="w-24 h-1.5 bg-indigo-200 rounded-full cursor-pointer relative" onClick={handleSeekFullVO}>
                    <div className="h-full bg-indigo-600 rounded-full transition-all" style={{ width: `${fullVODuration > 0 ? (fullVOProgress / fullVODuration) * 100 : 0}%` }} />
                  </div>
                  <span className="text-[10px] font-mono text-indigo-600">{Math.floor(fullVOProgress)}s/{Math.floor(fullVODuration)}s</span>
                  <button onClick={handleStopFullVO} className="text-indigo-400 hover:text-red-500"><X size={12} /></button>
                </div>
              ) : (
                <button
                  onClick={handlePlayFullVO}
                  disabled={downloadingVO}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
                >
                  {downloadingVO ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                  {downloadingVO ? 'Generating...' : 'Play Full VO'}
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

          {canComment && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-3 text-sm scripts-no-print">
              <MessageSquare size={16} className="text-amber-500 shrink-0" />
              <span className="text-amber-800 text-xs">
                <strong>You can leave feedback.</strong> Select any text to comment on it, or click the <strong>💬</strong> button next to any scene row.
              </span>
              <button onClick={() => { setShowComments(true); setPendingComment(null); }}
                className="ml-auto shrink-0 text-xs font-bold text-amber-700 hover:text-amber-900 underline">
                View all ({comments.filter(c => c.status !== 'resolved').length})
              </button>
            </div>
          )}

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
                    const hlBg = scene.highlight_color ? `${scene.highlight_color}1A` : null;
                    return (
                    <tr key={scene.id} className={`border-t border-gray-100 align-top group ${scene.highlight_color ? '' : 'hover:bg-gray-50/50'}`} style={hlBg ? { backgroundColor: hlBg } : {}}>
                      <td className="px-3 py-3 text-center">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${scene.highlight_color ? 'text-white' : 'text-gray-400'}`}
                          style={scene.highlight_color ? { backgroundColor: scene.highlight_color } : {}}>{idx + 1}</span>
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
                          <RichTextDisplay html={scene.what_we_see} className="text-sm text-gray-700 whitespace-pre-wrap select-text block" />
                        ) : (
                          <EditableRichText html={scene.what_we_see || ''} onChange={v => handleCellChange(scene.id, 'what_we_see', v)}
                            className="w-full text-sm text-gray-700" placeholder="What we see…" />
                        )}
                      </td>
                      <td className="px-3 py-3" onMouseUp={() => handleTextMouseUp(scene.id, 'what_we_hear')}>
                        {readOnly ? (
                          <RichTextDisplay html={scene.what_we_hear} className="text-sm text-indigo-700 italic whitespace-pre-wrap select-text block" />
                        ) : (
                          <EditableRichText html={scene.what_we_hear || ''} onChange={v => handleCellChange(scene.id, 'what_we_hear', v)}
                            className="w-full text-sm text-indigo-700 italic" placeholder="What we hear…" />
                        )}
                        {scene.what_we_hear?.trim() && (
                          <button onClick={(e) => { e.stopPropagation(); handlePlayScene(scene.id); }}
                            className={clsx('mt-1 flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full transition-colors',
                              playingSceneId === scene.id ? 'bg-indigo-100 text-indigo-600' : 'text-indigo-300 hover:text-indigo-600 hover:bg-indigo-50')}>
                            {playingSceneId === scene.id ? <><Loader2 size={8} className="animate-spin" /> Playing</> : <><Play size={8} /> Play</>}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-1.5">
                          {(scene.images || []).map(img => (
                            <div key={img.id} className="relative group/img">
                              {/* Hover preview */}
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none opacity-0 group-hover/img:opacity-100 transition-opacity duration-200 delay-300">
                                <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden" style={{width: 280}}>
                                  <img src={img.url} alt="" loading="lazy" className="w-full object-cover" style={{maxHeight: 200}} />
                                  {img.prompt && <p className="text-[10px] text-gray-500 px-2 py-1.5 leading-snug line-clamp-2">{img.prompt}</p>}
                                </div>
                                <div className="w-3 h-3 bg-white border-b border-r border-gray-200 rotate-45 mx-auto -mt-1.5 shadow-sm" />
                              </div>
                              <img src={img.url} alt=""
                                className="w-16 h-12 object-cover rounded-lg cursor-pointer hover:ring-2 hover:ring-indigo-300 transition-all scripts-visuals"
                                loading="lazy"
                                onClick={(e) => { e.stopPropagation(); setLightbox({ url: img.url, name: img.prompt || '' }); }} />
                            </div>
                          ))}
                        </div>
                      </td>
                      {canComment && (
                        <td className="px-2 py-3">
                          <button
                            onClick={() => openCommentPanel({ scene_id: scene.id, cell: null, selected_text: null })}
                            className={clsx('flex items-center gap-1.5 text-[11px] rounded-lg px-2 py-1.5 transition-colors border',
                              sceneComments > 0
                                ? 'text-amber-700 bg-amber-50 border-amber-200 font-bold'
                                : 'text-amber-400 border-amber-100 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200')}
                          >
                            <MessageSquare size={11} />
                            <span>{sceneComments > 0 ? sceneComments : ''}</span>
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
                    const hlBg2 = scene.highlight_color ? `${scene.highlight_color}1A` : null;
                    return (
                    <tr key={scene.id} className={`border-t border-gray-100 align-top group ${scene.highlight_color ? '' : 'hover:bg-gray-50/50'}`} style={hlBg2 ? { backgroundColor: hlBg2 } : {}}>
                      <td className="px-4 py-4 text-center">
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-md ${scene.highlight_color ? 'text-white' : 'text-gray-400'}`}
                          style={scene.highlight_color ? { backgroundColor: scene.highlight_color } : {}}>{idx + 1}</span>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-xs font-mono text-gray-500">{scene.location || '—'}</span>
                      </td>
                      <td className="px-4 py-4" onMouseUp={() => handleTextMouseUp(scene.id, 'what_we_hear')}>
                        {readOnly ? (
                          <RichTextDisplay html={scene.what_we_hear} className="text-base text-indigo-800 italic leading-relaxed whitespace-pre-wrap select-text block" />
                        ) : (
                          <EditableRichText html={scene.what_we_hear || ''} onChange={v => handleCellChange(scene.id, 'what_we_hear', v)}
                            className="w-full text-base text-indigo-800 italic leading-relaxed" placeholder="What we hear…" />
                        )}
                        {scene.what_we_hear?.trim() && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handlePlayScene(scene.id); }}
                            className={clsx('mt-2 flex items-center gap-1 text-[10px] px-2 py-1 rounded-full transition-colors',
                              playingSceneId === scene.id ? 'bg-indigo-100 text-indigo-600' : 'text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50')}
                          >
                            {playingSceneId === scene.id ? <><Loader2 size={9} className="animate-spin" /> Playing...</> : <><Play size={9} /> Play</>}
                          </button>
                        )}
                      </td>
                      {canComment && (
                        <td className="px-2 py-4">
                          <button onClick={() => openCommentPanel({ scene_id: scene.id, cell: 'what_we_hear', selected_text: null })}
                            className={clsx('flex items-center gap-1.5 text-[11px] rounded-lg px-2 py-1.5 transition-colors border',
                              sceneComments > 0
                                ? 'text-amber-700 bg-amber-50 border-amber-200 font-bold'
                                : 'text-amber-400 border-amber-100 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200')}>
                            <MessageSquare size={11} /><span>{sceneComments > 0 ? sceneComments : ''}</span>
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
                <div key={scene.id} className="bg-white rounded-2xl shadow-sm overflow-hidden group relative"
                  style={{ borderWidth: 2, borderStyle: 'solid', borderColor: scene.highlight_color || '#f3f4f6' }}>
                  <div className="bg-gray-100 aspect-video overflow-hidden">
                    {scene.images?.length > 0 ? (
                      <img src={scene.images[0].url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-300 text-xs font-medium">No image</div>
                    )}
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[10px] font-bold rounded-full px-1.5 py-0.5 shrink-0 ${scene.highlight_color ? 'text-white' : 'text-gray-400 bg-gray-100'}`}
                          style={scene.highlight_color ? { backgroundColor: scene.highlight_color } : {}}>{idx + 1}</span>
                        {readOnly ? (
                          <span className="text-[10px] font-mono text-gray-500 truncate">{scene.location || '—'}</span>
                        ) : (
                          <input value={scene.location || ''} onChange={e => handleCellChange(scene.id, 'location', e.target.value)}
                            className="text-[10px] font-mono text-gray-500 bg-transparent border-0 outline-none w-full truncate" placeholder="INT. LOCATION — DAY" />
                        )}
                      </div>
                      {canComment && (
                        <button onClick={() => openCommentPanel({ scene_id: scene.id, cell: null, selected_text: null })}
                          className={clsx('flex items-center gap-1.5 text-[11px] rounded-lg px-2 py-1.5 transition-colors border shrink-0',
                            sceneComments > 0
                              ? 'text-amber-700 bg-amber-50 border-amber-200 font-bold'
                              : 'text-amber-400 border-amber-100 hover:bg-amber-50 hover:text-amber-600 hover:border-amber-200')}>
                          <MessageSquare size={11} /><span>{sceneComments > 0 ? sceneComments : ''}</span>
                        </button>
                      )}
                    </div>

                    {/* What We See — labeled */}
                    <div>
                      <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 inline-block" /> What We See
                      </div>
                      {readOnly ? (
                        <RichTextDisplay html={scene.what_we_see} className="text-xs text-gray-700 leading-relaxed block line-clamp-3" />
                      ) : (
                        <EditableRichText html={scene.what_we_see || ''} onChange={v => handleCellChange(scene.id, 'what_we_see', v)}
                          className="text-xs text-gray-700 leading-relaxed min-h-[40px]" placeholder="What we see…" />
                      )}
                    </div>

                    {/* What We Hear — labeled, distinct color */}
                    <div className="bg-indigo-50/60 rounded-lg px-2 py-1.5 -mx-0.5">
                      <div className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider mb-0.5 flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" /> What We Hear
                      </div>
                      {readOnly ? (
                        <div onClick={() => setExpandedAudio(prev => ({ ...prev, [scene.id]: !prev[scene.id] }))}>
                          <RichTextDisplay html={scene.what_we_hear} className={clsx('text-xs text-indigo-700 italic block cursor-pointer', expandedAudio[scene.id] ? '' : 'line-clamp-2')} />
                          {(scene.what_we_hear || '').length > 80 && (
                            <span className="text-[10px] text-indigo-400">{expandedAudio[scene.id] ? 'less ▲' : 'more ▼'}</span>
                          )}
                        </div>
                      ) : (
                        <EditableRichText html={scene.what_we_hear || ''} onChange={v => handleCellChange(scene.id, 'what_we_hear', v)}
                          className="text-xs text-indigo-700 italic min-h-[40px]" placeholder="What we hear…" />
                      )}
                      {scene.what_we_hear?.trim() && (
                        <button onClick={(e) => { e.stopPropagation(); handlePlayScene(scene.id); }}
                          className={clsx('mt-1 flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded-full transition-colors',
                            playingSceneId === scene.id ? 'bg-indigo-100 text-indigo-600' : 'text-indigo-300 hover:text-indigo-600 hover:bg-indigo-50')}>
                          {playingSceneId === scene.id ? <><Loader2 size={8} className="animate-spin" /> Playing</> : <><Play size={8} /> Play</>}
                        </button>
                      )}
                    </div>

                    {scene.images?.length > 1 && (
                      <div className="flex gap-1 mt-1 overflow-x-auto">
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
            className="flex items-center gap-1.5 bg-amber-500 text-white text-sm font-bold px-4 py-2 rounded-full shadow-2xl hover:bg-amber-600 transition-colors"
          >
            <MessageSquare size={13} /> Leave feedback on this
          </button>
        </div>
      )}

      {/* ── Comments Sidebar (shared component) ── */}
      <CommentSidebar
        isOpen={showComments && canComment}
        comments={comments}
        scenes={scenes}
        pendingComment={pendingComment}
        commenterName={commenterName}
        onSubmitComment={handleSubmitComment}
        onResolve={handleResolveComment}
        onReply={handleReplyComment}
        onClose={() => { setShowComments(false); setPendingComment(null); }}
        onChangeName={() => setShowNameModal(true)}
      />

      {/* ── Name Modal ── */}
      <NameModal
        isOpen={showNameModal}
        initialName={commenterName}
        onSave={(name) => { setCommenterName(name); setShowNameModal(false); }}
      />

      {/* Print CSS */}
      {/* ── Voice Picker Modal ── */}
      {showVoicePicker && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center animate-fade-in" onClick={() => setShowVoicePicker(false)}>
          <div className="bg-white w-full max-w-sm rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="font-black text-gray-900 text-sm">Voice Settings</h3>
              <button onClick={() => setShowVoicePicker(false)}><X size={16} className="text-gray-400" /></button>
            </div>
            {/* Search + filter */}
            <div className="px-4 pb-2 flex gap-2">
              <input autoFocus value={voiceSearch} onChange={e => setVoiceSearch(e.target.value)}
                placeholder="Search voices…" className="flex-1 text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 outline-none focus:border-indigo-300" />
              <select value={genderFilter} onChange={e => setGenderFilter(e.target.value)}
                className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none">
                <option value="">All</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
            </div>
            {/* Voice list */}
            <div className="flex-1 overflow-y-auto px-4 pb-2 space-y-1.5" style={{ maxHeight: '40vh' }}>
              {loadingVoices ? (
                <div className="py-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading voices…</div>
              ) : accountVoices
                  .filter(v => (!voiceSearch || v.name.toLowerCase().includes(voiceSearch.toLowerCase())))
                  .filter(v => (!genderFilter || v.gender === genderFilter))
                  .map(v => (
                <div key={v.voice_id}
                  className={`flex items-center gap-3 p-2.5 rounded-xl border-2 transition-all cursor-pointer ${voiceId === v.voice_id ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'}`}
                  onClick={() => setVoiceId(v.voice_id)}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${voiceId === v.voice_id ? 'bg-indigo-600 text-white' : v.gender === 'male' ? 'bg-blue-100 text-blue-700' : v.gender === 'female' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'}`}>
                    {v.name?.[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${voiceId === v.voice_id ? 'text-indigo-800' : 'text-gray-800'}`}>{v.name}</p>
                    <p className="text-[10px] text-gray-400">{[v.gender, v.accent].filter(Boolean).join(' · ')}</p>
                  </div>
                  <button onClick={e => { e.stopPropagation(); handlePreviewVoice(v.voice_id); }}
                    className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-indigo-100 transition-colors shrink-0">
                    {previewingVoice === v.voice_id ? <Loader2 size={12} className="animate-spin text-indigo-500" /> : <Play size={11} className="text-gray-500" />}
                  </button>
                </div>
              ))}
            </div>
            {/* Speed + Stability */}
            <div className="px-4 py-3 border-t border-gray-100 space-y-3">
              <div>
                <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                  <span>Speed</span><span className="font-mono font-bold">{voiceSpeed.toFixed(1)}x</span>
                </div>
                <input type="range" min={0.5} max={2.0} step={0.1} value={voiceSpeed} onChange={e => setVoiceSpeed(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600 h-1.5" />
              </div>
              <div>
                <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                  <span>Stability</span><span className="font-mono font-bold">{voiceStability.toFixed(1)}</span>
                </div>
                <input type="range" min={0} max={1} step={0.1} value={voiceStability} onChange={e => setVoiceStability(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600 h-1.5" />
              </div>
            </div>
            <div className="px-4 pb-4 pt-1">
              <button
                onClick={() => {
                  saveVoiceSettings(voiceId, voiceSpeed, voiceStability);
                  setShowVoicePicker(false);
                }}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-colors">
                Save — {accountVoices.find(v => v.voice_id === voiceId)?.name || 'this voice'}
              </button>
            </div>
          </div>
        </div>
      )}

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

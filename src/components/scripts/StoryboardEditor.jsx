import { useState, useEffect, useRef, useCallback, useMemo, memo } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  GripVertical, Plus, Trash2, Copy, ChevronDown, ChevronRight, MessageSquare,
  Upload, Sparkles, Share2, Play, Pause, X, Check, History, Download, Eye, EyeOff,
  Columns3, Table2, Layout, Volume2, ChevronLeft, ChevronRight as ChevronRightIcon,
  Loader2, RefreshCw, ExternalLink, Film, Maximize2, ArrowLeft, MoreHorizontal,
  Image as ImageIcon, Wand2, CheckCircle, Clock, Settings, VolumeX, Package,
  Scissors, Palette,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import { toast } from '../../lib/toast';
import clsx from 'clsx';
import DOMPurify from 'dompurify';
import SplitModal from './SplitModal';
import UniversalBlocks from './UniversalBlocks';
import AIChatPanel from './AIChatPanel';
import VideoMatchModal from './VideoMatchModal';
import ImageGalleryModal from './ImageGalleryModal';
import { CommentSidebar, NameModal } from './CommentPanel';
import ProductionPicker from '../ui/ProductionPicker';

const API = import.meta.env.VITE_API_URL || '';

function jwt() { return localStorage.getItem('cp_auth_token'); }

// ── VO duration estimate (word count at 130 WPM) ─────────────────────────────
const VO_WPM = 130;
function stripStageDirections(text) {
  return (text || '')
    .replace(/<span[^>]*(?:data-muted|class="vo-muted")[^>]*>[\s\S]*?<\/span>/gi, '') // strip muted/non-spoken spans
    .replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}
function estimateSeconds(text) {
  // Strip muted spans FIRST (while HTML is intact), then strip remaining HTML, then stage directions
  // Use [\s\S]*? to match across nested tags inside muted spans
  const withoutMuted = (text || '')
    .replace(/<span[^>]*(?:data-muted|class="vo-muted")[^>]*>[\s\S]*?<\/span>/gi, '');
  const withoutHtml = withoutMuted.replace(/<[^>]*>/g, ' ');
  const clean = withoutHtml.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
  if (!clean) return 0;
  return Math.round((clean.split(/\s+/).length / VO_WPM) * 60);
}
function fmtSeconds(s) {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}
function fmtTimecode(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

const STATUS_COLORS = {
  draft: 'bg-gray-100 text-gray-600',
  review: 'bg-amber-100 text-amber-700',
  approved: 'bg-green-100 text-green-700',
  archived: 'bg-gray-100 text-gray-400',
};

// ── ElevenLabs voice options ──────────────────────────────────────────────────
const ELEVEN_VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', desc: 'Professional · Clear', gender: 'F' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', desc: 'Deep · Authoritative', gender: 'M' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', desc: 'Young · Dynamic', gender: 'M' },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', desc: 'Powerful · Bold', gender: 'M' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', desc: 'Warm · Storytelling', gender: 'F' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', desc: 'Warm · Conversational', gender: 'M' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', desc: 'Friendly · Upbeat', gender: 'F' },
];

// ── Sanitizer config — allows formatting + muted spans, blocks scripts ───────
const PURIFY_CONFIG = {
  ALLOWED_TAGS: ['b', 'i', 'u', 'strong', 'em', 'span', 'br', 'font', 'div', 'p'],
  ALLOWED_ATTR: ['style', 'class', 'data-muted', 'color'],
};
function sanitizeHtml(html) {
  return DOMPurify.sanitize(html || '', PURIFY_CONFIG);
}

// ── Rich text cell (contentEditable with formatting) ─────────────────────────
function RichTextCell({ value, onChange, placeholder, readOnly, className, onMouseUp }) {
  const ref = useRef(null);
  const isFocused = useRef(false);
  const lastHtml = useRef(value || '');

  // Mount: set initial HTML (sanitized)
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = sanitizeHtml(value);
    }
  }, []); // mount only

  // Sync from parent when NOT focused (e.g. scene reloaded from server)
  useEffect(() => {
    if (ref.current && !isFocused.current && value !== lastHtml.current) {
      ref.current.innerHTML = sanitizeHtml(value);
      lastHtml.current = value || '';
    }
  });

  const handleInput = useCallback(() => {
    if (ref.current) {
      const html = ref.current.innerHTML;
      // Treat '<br>' as empty
      lastHtml.current = html === '<br>' ? '' : html;
      onChange?.(lastHtml.current);
    }
  }, [onChange]);

  // MutationObserver to catch DOM changes from external tools (format toolbar mute button)
  useEffect(() => {
    if (!ref.current) return;
    const observer = new MutationObserver(() => handleInput());
    observer.observe(ref.current, { childList: true, subtree: true, characterData: true, attributes: true });
    return () => observer.disconnect();
  }, [handleInput]);

  return (
    <div className="relative">
      <div
        ref={ref}
        contentEditable={!readOnly}
        suppressContentEditableWarning
        onFocus={() => { isFocused.current = true; }}
        onBlur={() => { isFocused.current = false; }}
        onInput={handleInput}
        onMouseUp={onMouseUp}
        className={clsx('outline-none break-words', className)}
      />
      {(!value || value === '<br>' || value === '') && !readOnly && (
        <div className="absolute inset-0 pointer-events-none text-gray-300 text-sm select-none" style={{ top: 0 }}>
          {placeholder}
        </div>
      )}
    </div>
  );
}

// Resize image to max dimension for localStorage efficiency (returns base64)
function resizeImageBase64(base64, mimeType, maxDim = 800) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      if (img.width <= maxDim && img.height <= maxDim) { resolve(base64); return; }
      const scale = maxDim / Math.max(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL(mimeType || 'image/jpeg', 0.8).split(',')[1]);
    };
    img.onerror = () => resolve(base64);
    img.src = `data:${mimeType || 'image/jpeg'};base64,${base64}`;
  });
}

// Strip HTML for TTS/AI (plain text only)
function stripHtml(html) {
  return html?.replace(/<[^>]*>/g, '') || '';
}

// ── Floating formatting toolbar ───────────────────────────────────────────────
const FORMAT_COLORS = ['#1f2937', '#dc2626', '#2563eb', '#16a34a', '#9333ea', '#d97706'];

function FormatToolbar({ style, onDismiss }) {
  const fmt = (cmd, val) => { document.execCommand(cmd, false, val); };
  return (
    <div
      className="fixed z-[90] bg-gray-900 rounded-xl shadow-2xl flex items-center gap-0.5 px-1.5 py-1"
      style={style}
      onMouseDown={e => e.preventDefault()} // keep selection alive
    >
      <button onClick={() => fmt('bold')} className="w-7 h-7 flex items-center justify-center rounded-lg text-white hover:bg-white/20 font-black text-sm transition-colors" title="Bold">B</button>
      <button onClick={() => fmt('italic')} className="w-7 h-7 flex items-center justify-center rounded-lg text-white hover:bg-white/20 italic font-serif text-sm transition-colors" title="Italic">I</button>
      <button onClick={() => fmt('underline')} className="w-7 h-7 flex items-center justify-center rounded-lg text-white hover:bg-white/20 underline text-sm transition-colors" title="Underline">U</button>
      <div className="w-px h-4 bg-white/20 mx-0.5" />
      {FORMAT_COLORS.map(color => (
        <button
          key={color}
          onClick={() => fmt('foreColor', color)}
          className="w-4 h-4 rounded-full border-2 border-white/40 hover:border-white transition-colors"
          style={{ backgroundColor: color }}
          title={`Color: ${color}`}
        />
      ))}
      <div className="w-px h-4 bg-white/20 mx-0.5" />
      <button onClick={() => fmt('removeFormat')} className="w-7 h-7 flex items-center justify-center rounded-lg text-white/60 hover:bg-white/20 text-[10px] font-semibold transition-colors" title="Clear formatting">✕</button>
      <div className="w-px h-4 bg-white/20 mx-0.5" />
      <button
        onClick={() => {
          const sel = window.getSelection();
          if (!sel || sel.rangeCount === 0) return;
          const range = sel.getRangeAt(0);
          // Find the contentEditable parent to trigger input event after mutation
          let editableEl = range.startContainer;
          while (editableEl && !editableEl.contentEditable?.toString()?.includes('true')) editableEl = editableEl.parentElement;
          // Check if already muted — if so, unwrap
          const parent = range.startContainer.parentElement;
          if (parent?.dataset?.muted) {
            const text = document.createTextNode(parent.textContent);
            parent.parentNode.replaceChild(text, parent);
            // Trigger input event on the contentEditable so React state + timer update
            if (editableEl) editableEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
            return;
          }
          const span = document.createElement('span');
          span.className = 'vo-muted';
          span.dataset.muted = 'true';
          try { range.surroundContents(span); } catch { /* partial selection */ }
          // Trigger input event on the contentEditable so React state + timer update
          if (editableEl) editableEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
        }}
        className="w-7 h-7 flex items-center justify-center rounded-lg text-orange-300 hover:bg-white/20 text-xs transition-colors"
        title="Mute — exclude from voiceover"
      >
        <VolumeX size={13} />
      </button>
    </div>
  );
}

// ── Highlight colors for scenes ──────────────────────────────────────────────
const HIGHLIGHT_COLORS = [
  { name: 'None',    value: null },
  { name: 'Red',     value: '#EF4444' },
  { name: 'Orange',  value: '#F97316' },
  { name: 'Yellow',  value: '#EAB308' },
  { name: 'Green',   value: '#22C55E' },
  { name: 'Teal',    value: '#14B8A6' },
  { name: 'Blue',    value: '#3B82F6' },
  { name: 'Indigo',  value: '#6366F1' },
  { name: 'Purple',  value: '#A855F7' },
  { name: 'Pink',    value: '#EC4899' },
];

// ── SortableSceneRow ──────────────────────────────────────────────────────────
const SortableSceneRow = memo(function SortableSceneRow({ scene, index, visibleCols, onUpdate, onDelete, onDuplicate, onAddScene, commentCount, onCommentClick, onImageUpload, onImageDelete, onImageGenerate, onRegenImage, onRequestAIImage, onLightbox, onOpenGallery, density = {}, readOnly, isLastRow, onPlayTTS, isPlaying, onSmartSplit, suggestingShots, generatingSceneId }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
  const highlightBg = scene.highlight_color ? `${scene.highlight_color}1A` : null; // 1A = ~10% opacity hex
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1, ...(highlightBg ? { backgroundColor: highlightBg } : {}) };

  const [collapsed, setCollapsed] = useState(scene.collapsed || false);
  const [generatingImg, setGeneratingImg] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showImageMenu, setShowImageMenu] = useState(false);
  const fileRef = useRef();

  // Text selection comment handler
  const [selectionBtn, setSelectionBtn] = useState(null);
  const handleMouseUp = (cell) => {
    if (readOnly) return;
    const sel = window.getSelection();
    if (!sel || sel.toString().trim() === '') { setSelectionBtn(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setSelectionBtn({ scene_id: scene.id, cell, selected_text: sel.toString(), rect });
  };


  return (
    <tr ref={setNodeRef} style={style} className={`border-b border-gray-100 group align-top ${scene.highlight_color ? '' : 'hover:bg-gray-50/50'}`}>
      {/* Drag handle */}
      <td className="w-6 px-1 pt-3">
        {!readOnly && (
          <button {...attributes} {...listeners} className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-gray-500 touch-none">
            <GripVertical size={14} />
          </button>
        )}
      </td>

      {/* Scene # + collapse + highlight color */}
      <td className="w-12 px-2 pt-3 text-center">
        <div className="flex flex-col items-center gap-1 relative">
          <button onClick={() => setCollapsed(c => { const v = !c; onUpdate(scene.id, 'collapsed', v); return v; })}
            className="text-gray-400 hover:text-gray-600">
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
          {/* Scene number — click to toggle color picker, right-click too */}
          <button
            onClick={!readOnly ? () => setShowColorPicker(p => !p) : undefined}
            onContextMenu={!readOnly ? (e) => { e.preventDefault(); setShowColorPicker(p => !p); } : undefined}
            title={!readOnly ? 'Click to highlight' : undefined}
            className={`text-xs font-bold px-1.5 py-0.5 rounded-md transition-all cursor-pointer ${
              scene.highlight_color
                ? 'text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-100'
            }`}
            style={scene.highlight_color ? { backgroundColor: scene.highlight_color } : {}}
          >
            {index}
          </button>
          {/* Color picker dropdown */}
          {showColorPicker && (
            <div className="absolute left-1/2 -translate-x-1/2 top-full mt-0.5 z-50 bg-white rounded-xl shadow-xl border border-gray-200 p-2 flex flex-wrap gap-1.5 w-[140px]"
              onMouseLeave={() => setShowColorPicker(false)}>
              <div className="w-full text-[8px] font-bold text-gray-400 uppercase tracking-wider mb-0.5 px-0.5">Highlight</div>
              {HIGHLIGHT_COLORS.map(c => (
                <button
                  key={c.name}
                  onClick={() => { onUpdate(scene.id, 'highlight_color', c.value); setShowColorPicker(false); }}
                  title={c.name}
                  className={`w-6 h-6 rounded-full border-2 transition-all hover:scale-110 ${scene.highlight_color === c.value ? 'border-gray-800 ring-2 ring-gray-300 scale-110' : 'border-gray-200 hover:border-gray-400'}`}
                  style={{ backgroundColor: c.value || '#f3f4f6', ...(c.value === null ? { background: 'linear-gradient(135deg, #fff 40%, #ef4444 50%, #fff 60%)' } : {}) }}
                />
              ))}
            </div>
          )}
        </div>
      </td>

      {/* Location */}
      {visibleCols.location && (
        <td className={`w-40 px-2 ${density.rowPy || 'py-2'} align-top`}>
          {collapsed ? (
            <span className="text-xs text-gray-500 truncate block">{stripHtml(scene.location) || '—'}</span>
          ) : (
            <RichTextCell
              value={scene.location}
              onChange={v => onUpdate(scene.id, 'location', v)}
              placeholder="INT. STUDIO - DAY"
              readOnly={readOnly}
              onMouseUp={() => handleMouseUp('location')}
              className="w-full text-xs font-mono text-gray-600 min-h-[60px] leading-relaxed"
            />
          )}
        </td>
      )}

      {/* What We See */}
      {visibleCols.what_we_see && (
        <td className={`px-2 ${density.rowPy || 'py-2'} align-top`}>
          {collapsed ? (
            <span className="text-xs text-gray-600 line-clamp-1">{stripHtml(scene.what_we_see) || '—'}</span>
          ) : (
            <div className="relative" onMouseUp={() => handleMouseUp('what_we_see')}>
              <RichTextCell
                value={scene.what_we_see}
                onChange={v => onUpdate(scene.id, 'what_we_see', v)}
                placeholder="Visual directions, camera movements..."
                readOnly={readOnly}
                className="w-full text-sm text-gray-700 min-h-[80px] leading-relaxed"
              />
              {selectionBtn?.cell === 'what_we_see' && (
                <button
                  onMouseDown={e => { e.preventDefault(); onCommentClick(selectionBtn); setSelectionBtn(null); }}
                  className="absolute -top-6 right-0 flex items-center gap-1 text-xs bg-yellow-400 text-white px-2 py-0.5 rounded-full shadow z-10"
                >
                  <MessageSquare size={10} /> Comment
                </button>
              )}
            </div>
          )}
        </td>
      )}

      {/* What We Hear */}
      {visibleCols.what_we_hear && (
        <td className={`px-2 ${density.rowPy || 'py-2'} align-top`}>
          {collapsed ? (
            <span className="text-xs text-indigo-700 line-clamp-1">{stripHtml(scene.what_we_hear) || '—'}</span>
          ) : (
            <div className="relative" onMouseUp={() => handleMouseUp('what_we_hear')}>
              <RichTextCell
                value={scene.what_we_hear}
                onChange={v => onUpdate(scene.id, 'what_we_hear', v)}
                placeholder="Dialogue, voiceover, SFX..."
                readOnly={readOnly}
                className="w-full text-sm text-indigo-700 min-h-[80px] leading-relaxed italic"
              />
              {selectionBtn?.cell === 'what_we_hear' && (
                <button
                  onMouseDown={e => { e.preventDefault(); onCommentClick(selectionBtn); setSelectionBtn(null); }}
                  className="absolute -top-6 right-0 flex items-center gap-1 text-xs bg-yellow-400 text-white px-2 py-0.5 rounded-full shadow z-10"
                >
                  <MessageSquare size={10} /> Comment
                </button>
              )}
              {/* VO duration + play button */}
              {stripHtml(scene.what_we_hear)?.trim() && (
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-[10px] text-indigo-400 font-mono">~{fmtSeconds(estimateSeconds(stripHtml(scene.what_we_hear)))}</span>
                  {onPlayTTS && (
                    <button
                      onClick={() => onPlayTTS(scene.id)}
                      title="Preview VO audio"
                      className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full transition-colors ${isPlaying ? 'bg-indigo-100 text-indigo-600' : 'text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50'}`}
                    >
                      {isPlaying ? <Loader2 size={9} className="animate-spin" /> : <Play size={9} />}
                      {isPlaying ? 'Playing...' : 'Play'}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </td>
      )}

      {/* Duration */}
      {visibleCols.duration && (
        <td className="w-20 px-2 py-2 align-top">
          <input
            value={scene.duration || ''}
            onChange={e => onUpdate(scene.id, 'duration', e.target.value)}
            placeholder="5s"
            readOnly={readOnly}
            className="w-full text-xs border border-gray-200 rounded-lg px-2 py-1 outline-none focus:ring-1 focus:ring-indigo-300 text-gray-600"
          />
        </td>
      )}

      {/* Visuals — supports clipboard paste (Ctrl+V) */}
      {visibleCols.visuals && (
        <td className={`${density.visualsW || 'w-56'} px-2 ${density.rowPy || 'py-2'} align-top`} tabIndex={0} onPaste={(e) => {
          if (readOnly) return;
          const items = Array.from(e.clipboardData?.items || []);
          const imageItem = items.find(i => i.type.startsWith('image/'));
          if (!imageItem) return;
          e.preventDefault();
          const file = imageItem.getAsFile();
          if (file) onImageUpload(scene.id, file);
        }}>
          <div className="flex flex-wrap gap-1.5">
            {(scene.images || []).map(img => (
              <div key={img.id} className="relative group/img">
                {/* Hover preview — large popup */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none opacity-0 group-hover/img:opacity-100 transition-opacity duration-150 delay-300">
                  <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden" style={{width: 320}}>
                    <img src={img.url} alt={img.prompt || 'Visual'} loading="lazy" className="w-full object-cover" style={{maxHeight: 240}} />
                    {img.prompt && <p className="text-[10px] text-gray-500 px-2 py-1.5 leading-snug line-clamp-2">{img.prompt}</p>}
                  </div>
                  {/* Arrow */}
                  <div className="w-3 h-3 bg-white border-b border-r border-gray-200 rotate-45 mx-auto -mt-1.5 shadow-sm" />
                </div>
                <img
                  src={img.url}
                  alt={img.prompt || 'Visual'}
                  className={`${density.imgH || 'h-16'} ${density.imgW || 'w-24'} object-cover rounded-md border border-gray-200 cursor-pointer`}
                  onClick={() => onLightbox(img)}
                />
                {!readOnly && (
                  <>
                    <button
                      onClick={() => onImageDelete(scene.id, img.id)}
                      className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                    >
                      <X size={8} />
                    </button>
                    {img.source === 'ai' && (
                      <button
                        onClick={() => onRegenImage(scene.id, img)}
                        className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-purple-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover/img:opacity-100 transition-opacity"
                        title="Regenerate this image"
                      >
                        <RefreshCw size={8} />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
            {!readOnly && !collapsed && (() => {
              const isGenerating = generatingImg || suggestingShots === scene.id || generatingSceneId === scene.id;
              const hasImages = (scene.images || []).length > 0;
              return (
                <div className="relative">
                  {/* Add image button — compact when images exist, larger when empty */}
                  {hasImages ? (
                    <button onClick={() => setShowImageMenu(p => !p)}
                      className={`${density.imgH || 'h-16'} w-10 rounded-md border border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 hover:border-purple-300 hover:text-purple-500 transition-colors`}>
                      <Plus size={14} />
                    </button>
                  ) : (
                    <button onClick={() => setShowImageMenu(p => !p)}
                      className={`${density.imgH || 'h-16'} ${density.imgW || 'w-24'} rounded-md border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-purple-300 hover:text-purple-500 transition-colors`}>
                      <ImageIcon size={16} />
                      <span className="text-[10px] font-medium">Add Visual</span>
                    </button>
                  )}
                  {/* Generating indicator */}
                  {isGenerating && (
                    <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-md">
                      <Loader2 size={14} className="animate-spin text-purple-500" />
                    </div>
                  )}
                  {/* Image actions dropdown */}
                  {showImageMenu && (
                    <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-200 py-1 w-44"
                      onMouseLeave={() => setShowImageMenu(false)}>
                      <button onClick={() => { setShowImageMenu(false); onRequestAIImage(scene.id); }}
                        disabled={isGenerating}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-purple-50 hover:text-purple-700 transition-colors disabled:opacity-40">
                        <Sparkles size={13} className="text-purple-500" /> AI Generate
                      </button>
                      <button onClick={() => { setShowImageMenu(false); fileRef.current?.click(); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors">
                        <Upload size={13} className="text-blue-500" /> Upload Image
                      </button>
                      <button onClick={() => { setShowImageMenu(false); onOpenGallery(scene.id); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors">
                        <ImageIcon size={13} className="text-teal-500" /> From Library
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <button onClick={() => { setShowImageMenu(false); onSmartSplit(scene.id); }}
                        disabled={isGenerating || !!suggestingShots}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-40">
                        <Film size={13} className="text-amber-500" /> AI Multi-Shot
                      </button>
                      <div className="px-3 py-1.5 text-[9px] text-gray-400 border-t border-gray-100">
                        Tip: Ctrl+V to paste from clipboard
                      </div>
                    </div>
                  )}
                  {hasImages && (
                    <span className="text-[9px] font-mono text-gray-400 mt-0.5 block text-center">{(scene.images || []).length}</span>
                  )}
                </div>
              );
            })()}
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { if (e.target.files[0]) onImageUpload(scene.id, e.target.files[0]); e.target.value = ''; }} />
        </td>
      )}

      {/* Actions */}
      <td className="w-16 px-1 pt-2 align-top">
        <div className="flex flex-col gap-0.5 items-center opacity-0 group-hover:opacity-100 transition-opacity">
          {commentCount > 0 && (
            <button onClick={() => onCommentClick({ scene_id: scene.id })} className="flex items-center gap-0.5 text-[10px] text-amber-500 font-bold">
              <MessageSquare size={10} /> {commentCount}
            </button>
          )}
          {!readOnly && (
            <>
              <button onClick={() => onDuplicate(scene)} title="Duplicate" className="p-1 text-gray-400 hover:text-blue-500 rounded transition-colors"><Copy size={12} /></button>
              <button onClick={() => onDelete(scene.id)} title="Delete" className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"><Trash2 size={12} /></button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
});

// ── Main StoryboardEditor ─────────────────────────────────────────────────────
export default function StoryboardEditor({ scriptId, readOnly = false, onBack, onDeleted, onUpdated, defaultProductionId, defaultBrandId, productions = [] }) {
  const { user } = useAuth();
  const { brand } = useBrand();

  const [script, setScript] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(true);
  const [savedAt, setSavedAt] = useState(null);
  const [activeView, setActiveView] = useState(() => localStorage.getItem(`script_view_${scriptId}`) || 'table');
  const DEFAULT_COLS = { location: true, what_we_see: true, what_we_hear: true, visuals: true, duration: false };
  const [visibleCols, setVisibleCols] = useState(() => {
    try { return { ...DEFAULT_COLS, ...JSON.parse(localStorage.getItem(`script_cols_${scriptId}`) || '{}') }; }
    catch { return DEFAULT_COLS; }
  });
  const [showColMenu, setShowColMenu] = useState(false);
  // Row density: 'compact' | 'default' | 'spacious'
  const [rowDensity, setRowDensity] = useState(() => localStorage.getItem(`script_density_${scriptId}`) || 'default');
  const DENSITY_CFG = {
    compact:  { imgH: 'h-12', imgW: 'w-20', visualsW: 'w-44', rowPy: 'py-1.5', textSize: 'text-xs' },
    default:  { imgH: 'h-16', imgW: 'w-24', visualsW: 'w-56', rowPy: 'py-2', textSize: 'text-sm' },
    spacious: { imgH: 'h-24', imgW: 'w-36', visualsW: 'w-72', rowPy: 'py-3', textSize: 'text-sm' },
  };
  const density = DENSITY_CFG[rowDensity] || DENSITY_CFG.default;
  const [presentMode, setPresentMode] = useState(false);
  const [presentIdx, setPresentIdx] = useState(0);
  const [showAI, setShowAI] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [comments, setComments] = useState([]);
  const [versions, setVersions] = useState([]);
  const [lightbox, setLightbox] = useState(null);
  const [pendingComment, setPendingComment] = useState(null);
  const [commenterName, setCommenterName] = useState(() => localStorage.getItem('cp_commenter_name') || '');
  const [showNameModal, setShowNameModal] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  // ── ElevenLabs TTS ──
  const [playingSceneId, setPlayingSceneId] = useState(null);
  const audioRef = useRef(null);
  const [commercialTarget, setCommercialTarget] = useState(() => {
    return localStorage.getItem(`script_target_${scriptId}`) || '30';
  });

  // ── AI Image wizard & regeneration ──
  const [showImageWizard, setShowImageWizard] = useState(false);
  const [wizardStep, setWizardStep] = useState(1); // 1=choice 2=characters 3=product 4=style
  const [wizardTargetSceneId, setWizardTargetSceneId] = useState(null);
  const [wizardCharacters, setWizardCharacters] = useState([]); // [{name, description, photoBase64?, photoMime?}]
  const [wizardStyleNotes, setWizardStyleNotes] = useState('');
  const [wizardProductName, setWizardProductName] = useState('');
  const [wizardProductPhotos, setWizardProductPhotos] = useState([]); // [{base64, mimeType, previewUrl}]
  const [detectingProduct, setDetectingProduct] = useState(false);
  const [generatingAll, setGeneratingAll] = useState(false);
  const [generateAllProgress, setGenerateAllProgress] = useState({ current: 0, total: 0 });
  const [smartSplitScene, setSmartSplitScene] = useState(null); // sceneId currently showing smart split popup
  const [suggestingShots, setSuggestingShots] = useState(null); // sceneId currently fetching shot suggestions
  const productPhotoRef = useRef();
  const [extractingChars, setExtractingChars] = useState(false);
  const [describingActor, setDescribingActor] = useState(null); // index being described
  const actorPhotoRef = useRef();
  const [actorPhotoTarget, setActorPhotoTarget] = useState(null); // index for which char photo is being uploaded
  const [wizardRefImages, setWizardRefImages] = useState([]); // [{base64, mimeType, previewUrl}] general style references
  const wizardRefImageRef = useRef();
  const [generatingSceneId, setGeneratingSceneId] = useState(null); // track which scene is generating an image
  const [splitScene, setSplitScene] = useState(null); // scene object for SplitModal
  const [showBlocks, setShowBlocks] = useState(false);
  const [showGenAllConfirm, setShowGenAllConfirm] = useState(false);
  const [genAllIncludeExisting, setGenAllIncludeExisting] = useState(false);
  const [singleGenPrompt, setSingleGenPrompt] = useState(null); // { sceneId, info } — shows storyboard vs independent choice
  const [showAIChat, setShowAIChat] = useState(false);
  const [showVideoMatch, setShowVideoMatch] = useState(false);
  const [galleryTarget, setGalleryTarget] = useState(null); // { sceneId, imageId } — opens gallery to replace
  const [aiChatSelectedText, setAiChatSelectedText] = useState('');
  const [aiChatSceneId, setAiChatSceneId] = useState(null);

  // ── Voice picker & settings ──
  // Voice settings are PER SCRIPT — stored in script.voice_settings (DB) with localStorage fallback scoped by scriptId
  const [voiceId, setVoiceId] = useState(() => localStorage.getItem(`cp_voice_id_${scriptId}`) || '21m00Tcm4TlvDq8ikWAM');
  const [voiceSpeed, setVoiceSpeed] = useState(() => parseFloat(localStorage.getItem(`cp_voice_speed_${scriptId}`) || '1.0'));
  const [voiceStability, setVoiceStability] = useState(() => parseFloat(localStorage.getItem(`cp_voice_stability_${scriptId}`) || '0.5'));
  const [showVoicePicker, setShowVoicePicker] = useState(false);
  const [voiceSearchState, setVoiceSearchState] = useState('');
  const [genderFilterState, setGenderFilterState] = useState('');
  const [previewingVoice, setPreviewingVoice] = useState(null);
  const [voicePreviewError, setVoicePreviewError] = useState(null);
  const [accountVoices, setAccountVoices] = useState([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [downloadingFullVO, setDownloadingFullVO] = useState(false);
  const [sceneDurations, setSceneDurations] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`script_durations_${scriptId}`) || '{}'); } catch { return {}; }
  });
  const previewAudioRef = useRef(null);

  // ── Format toolbar ──
  const [formatToolbar, setFormatToolbar] = useState(null);

  // Regeneration modal
  const [regenModal, setRegenModal] = useState(null); // {sceneId, imageId, prompt}
  const [regenMode, setRegenMode] = useState('same'); // 'same' | 'edit' | 'reference'
  const [regenPrompt, setRegenPrompt] = useState('');
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenRefBase64, setRegenRefBase64] = useState('');
  const [regenRefMime, setRegenRefMime] = useState('');
  const [regenRefUrl, setRegenRefUrl] = useState('');
  const [regenRefPreview, setRegenRefPreview] = useState(''); // for display only
  const regenRefFileRef = useRef();

  // Character profiles stored per script in localStorage
  const charProfilesKey = `script_chars_${scriptId}`;
  const getCharProfiles = () => { try { return JSON.parse(localStorage.getItem(charProfilesKey) || '[]'); } catch { return []; } };
  const saveCharProfiles = (profiles) => localStorage.setItem(charProfilesKey, JSON.stringify(profiles));
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMode, setAiMode] = useState('generate');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiPreview, setAiPreview] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importUrl, setImportUrl] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [shareMode, setShareMode] = useState('none');
  const [shareToken, setShareToken] = useState('');
  const [sharingLoading, setSharingLoading] = useState(false);
  const [versionLabel, setVersionLabel] = useState('');
  const [approvingLoading, setApprovingLoading] = useState(false);
  const saveTimer = useRef(null);
  const autoVersionTimer = useRef(null);
  const lastChangeRef = useRef(null);
  const importFileRef = useRef();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (!scriptId) { setLoading(false); return; }
    loadScript();
  }, [scriptId]);

  const loadScript = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/scripts/${scriptId}`, { headers: { Authorization: `Bearer ${jwt()}` } });
      if (!res.ok) throw new Error('Script not found');
      const data = await res.json();
      setScript(data);
      setShareMode(data.share_mode || 'none');
      setShareToken(data.share_token || '');
      // Load voice settings from script if saved
      if (data.voice_settings?.voice_id) {
        setVoiceId(data.voice_settings.voice_id);
        localStorage.setItem(`cp_voice_id_${scriptId}`, data.voice_settings.voice_id);
      }
      if (data.voice_settings?.speed) {
        setVoiceSpeed(data.voice_settings.speed);
        localStorage.setItem(`cp_voice_speed_${scriptId}`, data.voice_settings.speed.toString());
      }
      if (data.voice_settings?.stability !== undefined) {
        setVoiceStability(data.voice_settings.stability);
        localStorage.setItem(`cp_voice_stability_${scriptId}`, data.voice_settings.stability.toString());
      }
    } catch { setScript(null); }
    setLoading(false);
  };

  const loadComments = async () => {
    const res = await fetch(`${API}/api/scripts/${scriptId}/comments`, { headers: { Authorization: `Bearer ${jwt()}` } });
    setComments(await res.json());
  };

  const loadVersions = async () => {
    const res = await fetch(`${API}/api/scripts/${scriptId}/versions`, { headers: { Authorization: `Bearer ${jwt()}` } });
    setVersions(await res.json());
  };

  const debounceSave = useCallback((updatedScript) => {
    setSaved(false);
    clearTimeout(saveTimer.current);
    lastChangeRef.current = Date.now();
    // Schedule auto-version snapshot 5 minutes after last change (if no activity)
    clearTimeout(autoVersionTimer.current);
    autoVersionTimer.current = setTimeout(async () => {
      try {
        await fetch(`${API}/api/scripts/${scriptId}/save-version`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
          body: JSON.stringify({ change_summary: 'Auto-saved' }),
        });
      } catch (e) { /* silent fail */ }
    }, 5 * 60 * 1000); // 5 minutes
    saveTimer.current = setTimeout(async () => {
      setSaving(true);
      await fetch(`${API}/api/scripts/${scriptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        body: JSON.stringify({ scenes: updatedScript.scenes, title: updatedScript.title, description: updatedScript.description }),
      });
      setSaving(false);
      setSaved(true);
      setSavedAt(new Date());
    }, 1500);
  }, [scriptId]);

  const updateScene = useCallback((sceneId, field, value) => {
    setScript(prev => {
      const updated = { ...prev, scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, [field]: value } : s) };
      debounceSave(updated);
      return updated;
    });
  }, [debounceSave]);

  const addScene = () => {
    const newScene = {
      id: crypto.randomUUID(),
      order: (script.scenes || []).length,
      location: '', what_we_see: '', what_we_hear: '', duration: '', collapsed: false, images: [],
    };
    const updated = { ...script, scenes: [...(script.scenes || []), newScene] };
    setScript(updated);
    debounceSave(updated);
  };

  const removeScene = (sceneId) => {
    const updated = { ...script, scenes: (script.scenes || []).filter(s => s.id !== sceneId).map((s, i) => ({ ...s, order: i })) };
    setScript(updated);
    debounceSave(updated);
  };

  const duplicateScene = (scene) => {
    const dup = { ...scene, id: crypto.randomUUID(), order: (script.scenes || []).length };
    const updated = { ...script, scenes: [...(script.scenes || []), dup] };
    setScript(updated);
    debounceSave(updated);
  };

  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const scenes = script.scenes || [];
    const oldIdx = scenes.findIndex(s => s.id === active.id);
    const newIdx = scenes.findIndex(s => s.id === over.id);
    const reordered = arrayMove(scenes, oldIdx, newIdx).map((s, i) => ({ ...s, order: i }));
    const updated = { ...script, scenes: reordered };
    setScript(updated);
    debounceSave(updated);
  };

  const handleImageUpload = async (sceneId, file) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      // Store as base64 data URL — avoids Drive auth issues, displays instantly
      const dataUrl = e.target.result;
      const newImg = { id: crypto.randomUUID(), url: dataUrl, name: file.name, source: 'upload' };
      setScript(prev => {
        const updated = { ...prev, scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, images: [...(s.images || []), newImg] } : s) };
        debounceSave(updated);
        return updated;
      });
    };
    reader.readAsDataURL(file);
  };

  const handleImageDelete = (sceneId, imgId) => {
    setScript(prev => {
      const updated = { ...prev, scenes: prev.scenes.map(s => s.id === sceneId ? { ...s, images: (s.images || []).filter(i => i.id !== imgId) } : s) };
      debounceSave(updated);
      return updated;
    });
  };

  const handleImageGenerate = async (sceneId, { independent = false } = {}) => {
    setGeneratingSceneId(sceneId);
    try {
      const charProfiles = getCharProfiles();
      // Read from localStorage with fallback to current wizard state (in case localStorage quota exceeded)
      const styleNotes = localStorage.getItem(`script_style_${scriptId}`) || wizardStyleNotes || '';
      const productName = localStorage.getItem(`script_product_name_${scriptId}`) || wizardProductName || '';
      let productPhotos = [];
      try { productPhotos = JSON.parse(localStorage.getItem(`script_product_photos_${scriptId}`) || '[]'); } catch {}
      if (productPhotos.length === 0 && wizardProductPhotos.length > 0) productPhotos = wizardProductPhotos.map(p => ({ base64: p.base64, mimeType: p.mimeType }));
      let charPhotos = [];
      try { charPhotos = JSON.parse(localStorage.getItem(`script_char_photos_${scriptId}`) || '[]'); } catch {}
      if (charPhotos.length === 0 && wizardCharacters.some(c => c.photoBase64 || c.photos?.length)) {
        wizardCharacters.forEach(c => {
          const photos = c.photos || (c.photoBase64 ? [{ base64: c.photoBase64, mimeType: c.photoMime }] : []);
          photos.forEach(p => { if (p.base64) charPhotos.push({ name: c.name, base64: p.base64, mimeType: p.mimeType || 'image/jpeg' }); });
        });
      }
      let refImages = [];
      try { refImages = JSON.parse(localStorage.getItem(`script_ref_images_${scriptId}`) || '[]'); } catch {}
      if (refImages.length === 0 && wizardRefImages.length > 0) refImages = wizardRefImages;

      const body = {
        scene_id: sceneId,
        character_profiles: charProfiles.length > 0 ? charProfiles : undefined,
        style_notes: styleNotes || undefined,
        product_info: productName ? { name: productName, photos: productPhotos } : undefined,
        character_photos: charPhotos.length > 0 ? charPhotos : undefined,
        reference_images: refImages.length > 0 ? refImages.map(r => ({ base64: r.base64, mimeType: r.mimeType })) : undefined,
        independent: independent || undefined,
      };

      const res = await fetch(`${API}/api/scripts/${scriptId}/ai-image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.url) {
        await loadScript();
        onUpdated?.({ id: scriptId });
      } else {
        toast.error(data.error || 'Image generation failed');
      }
    } catch (err) {
      toast.error('Image generation failed: ' + (err.message || 'Network error'));
    }
    setGeneratingSceneId(null);
  };

  const handleSmartSplit = (sceneId) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (scene) setSplitScene(scene);
  };

  const handleApplySplit = async (segments, generateImages, blockOpts) => {
    if (!splitScene) return;
    const sceneIndex = scenes.findIndex(s => s.id === splitScene.id);
    if (sceneIndex === -1) return;

    // Create new scene objects from segments
    const newScenes = segments.map((seg, i) => ({
      id: crypto.randomUUID(),
      order: sceneIndex + i,
      location: i === 0 ? splitScene.location : splitScene.location,
      what_we_see: seg.whatWeSee,
      what_we_hear: seg.whatWeHear,
      duration: '',
      images: i === 0 ? (splitScene.images || []) : [],
      collapsed: false,
    }));

    // Replace original scene with new scenes
    const updatedScenes = [...scenes];
    updatedScenes.splice(sceneIndex, 1, ...newScenes);
    // Re-order
    updatedScenes.forEach((s, i) => s.order = i);

    setScript(prev => {
      const updated = { ...prev, scenes: updatedScenes };
      debounceSave(updated);
      return updated;
    });
    onUpdated?.({ id: scriptId });
    setSplitScene(null);

    // Save as Universal Block if requested
    if (blockOpts?.saveAsBlock && blockOpts?.blockName) {
      try {
        await fetch(`${API}/api/scripts/blocks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
          body: JSON.stringify({
            brand_id: script.brand_id || brand?.id,
            name: blockOpts.blockName,
            category: 'general',
            scenes: newScenes.map(s => ({ location: s.location, what_we_see: s.what_we_see, what_we_hear: s.what_we_hear, duration: s.duration })),
          }),
        });
        toast.success(`Block "${blockOpts.blockName}" saved`);
      } catch { toast.error('Failed to save block'); }
    }

    // Optionally generate images for new scenes (skip first if it inherited images)
    if (generateImages) {
      const scenesToGenerate = newScenes.filter(s => !s.images || s.images.length === 0);
      for (const s of scenesToGenerate) {
        try {
          await handleImageGenerate(s.id);
        } catch {}
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  };

  const handleCommentClick = (info) => {
    setPendingComment(info);
    setShowComments(true);
    loadComments();
  };

  const handleSubmitComment = async (data) => {
    if (!data.text?.trim()) return;
    const token = jwt();
    const authorName = user?.name || commenterName.trim() || 'Anonymous';
    await fetch(`${API}/api/scripts/${scriptId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ ...data, author_name: authorName }),
    });
    setPendingComment(null);
    loadComments();
  };

  const handleReplyComment = async (parentId, text) => {
    if (!text.trim()) return;
    const token = jwt();
    const parent = comments.find(c => c.id === parentId);
    const authorName = user?.name || commenterName.trim() || 'Anonymous';
    await fetch(`${API}/api/scripts/${scriptId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ scene_id: parent?.scene_id, text, author_name: authorName, parent_comment_id: parentId }),
    });
    loadComments();
  };

  const resolveComment = async (cId, status) => {
    await fetch(`${API}/api/scripts/${scriptId}/comments/${cId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
      body: JSON.stringify({ status }),
    });
    loadComments();
  };

  // Reassign production — PATCH production_id without touching scenes
  const reassignProduction = async (newProductionId) => {
    const prev = script.production_id;
    setScript(s => ({ ...s, production_id: newProductionId || null }));
    try {
      await fetch(`${API}/api/scripts/${scriptId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        body: JSON.stringify({ production_id: newProductionId || null }),
      });
      toast.success(newProductionId ? 'Script linked to production' : 'Production link removed');
      if (onUpdated) onUpdated({ ...script, production_id: newProductionId || null });
    } catch {
      setScript(s => ({ ...s, production_id: prev })); // rollback
      toast.error('Failed to update production link');
    }
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    const res = await fetch(`${API}/api/scripts/${scriptId}/ai-generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
      body: JSON.stringify({ mode: aiMode, prompt: aiPrompt, current_scenes: aiMode === 'refine' ? script.scenes : undefined }),
    });
    const data = await res.json();
    setAiLoading(false);
    if (data.scenes) { setAiPreview(data.scenes); }
    else { toast.error(data.error || 'AI script generation failed'); }
  };

  const acceptAIPreview = () => {
    const updated = { ...script, scenes: aiPreview };
    setScript(updated);
    debounceSave(updated);
    setAiPreview(null);
    setAiPrompt('');
    setShowAI(false);
  };

  const handleImport = async () => {
    setImportLoading(true);
    let body = {};
    if (importFile) {
      const reader = new FileReader();
      await new Promise(resolve => {
        reader.onload = e => {
          body = { fileBase64: e.target.result.split(',')[1], fileName: importFile.name, mimeType: importFile.type };
          resolve();
        };
        reader.readAsDataURL(importFile);
      });
    } else if (importUrl.trim()) {
      body = { url: importUrl.trim() };
    } else {
      setImportLoading(false);
      return;
    }
    const res = await fetch(`${API}/api/scripts/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
      body: JSON.stringify({ ...body, production_id: script?.production_id }),
    });
    const data = await res.json();
    setImportLoading(false);
    if (data.scenes) { setAiPreview(data.scenes); setAiMode('import'); }
    else { toast.error(data.error || 'Script import failed'); }
  };

  const handleShare = async (mode) => {
    setSharingLoading(true);
    const res = await fetch(`${API}/api/scripts/${scriptId}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
      body: JSON.stringify({ share_mode: mode }),
    });
    const data = await res.json();
    setSharingLoading(false);
    setShareMode(data.share_mode || 'none');
    setShareToken(data.share_token || '');
  };

  const handleApprove = async () => {
    if (!confirm(`Approve "${script.title}"? This will update the status and export to Google Drive.`)) return;
    setApprovingLoading(true);
    const res = await fetch(`${API}/api/scripts/${scriptId}/approve`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt()}` },
    });
    const data = await res.json();
    setApprovingLoading(false);
    if (data.id) { setScript(data); }
    else { toast.error(data.error || 'Approval failed'); }
  };

  const handlePlayTTS = async (sceneId) => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    if (playingSceneId === sceneId) { setPlayingSceneId(null); return; }
    setPlayingSceneId(sceneId);
    try {
      const res = await fetch(`${API}/api/scripts/${scriptId}/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        body: JSON.stringify({ scene_id: sceneId, voice_id: voiceId, speed: voiceSpeed, stability: voiceStability }),
      });
      const data = await res.json();
      if (!data.audio_base64) { setPlayingSceneId(null); toast.error(data.error || 'Voice playback failed'); return; }
      if (data.duration_seconds) {
        setSceneDurations(prev => {
          const next = { ...prev, [sceneId]: data.duration_seconds };
          localStorage.setItem(`script_durations_${scriptId}`, JSON.stringify(next));
          return next;
        });
      }
      const audio = new Audio(`data:${data.mime_type};base64,${data.audio_base64}`);
      audioRef.current = audio;
      audio.onended = () => { setPlayingSceneId(null); audioRef.current = null; };
      audio.onerror = () => { setPlayingSceneId(null); audioRef.current = null; };
      audio.play();
    } catch (e) {
      setPlayingSceneId(null);
    }
  };

  const handlePreviewVoice = async (vid) => {
    // Stop any existing preview
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
    if (previewingVoice === vid) { setPreviewingVoice(null); return; }
    setPreviewingVoice(vid);
    setVoicePreviewError(null);

    // Use ElevenLabs preview_url if available (instant, no credits)
    const voice = accountVoices.find(v => v.voice_id === vid);
    if (voice?.preview_url) {
      const audio = new Audio(voice.preview_url);
      previewAudioRef.current = audio;
      audio.onended = () => { setPreviewingVoice(null); previewAudioRef.current = null; };
      audio.onerror = () => { setPreviewingVoice(null); setVoicePreviewError('Playback error'); previewAudioRef.current = null; };
      audio.play().catch(e => { setPreviewingVoice(null); setVoicePreviewError('Blocked by browser — tap to unlock audio'); });
      return;
    }

    // Fallback: call TTS
    try {
      const res = await fetch(`${API}/api/scripts/voice-preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        body: JSON.stringify({ voice_id: vid, speed: voiceSpeed, stability: voiceStability, similarity_boost: 0.75 }),
      });
      const data = await res.json();
      if (data.audio_base64) {
        const audio = new Audio(`data:audio/mpeg;base64,${data.audio_base64}`);
        previewAudioRef.current = audio;
        audio.onended = () => { setPreviewingVoice(null); previewAudioRef.current = null; };
        audio.onerror = () => { setPreviewingVoice(null); setVoicePreviewError('Playback error'); previewAudioRef.current = null; };
        audio.play().catch(e => { setPreviewingVoice(null); setVoicePreviewError('Blocked by browser — tap to unlock audio'); });
      } else {
        setVoicePreviewError(data.error || 'Preview failed');
        setPreviewingVoice(null);
      }
    } catch (e) { setVoicePreviewError(e.message); setPreviewingVoice(null); }
  };

  const loadAccountVoices = async () => {
    if (accountVoices.length > 0) return; // already loaded
    setLoadingVoices(true);
    try {
      const res = await fetch(`${API}/api/scripts/voices`, {
        headers: { Authorization: `Bearer ${jwt()}` },
      });
      const data = await res.json();
      if (data.voices) setAccountVoices(data.voices);
      else setVoicePreviewError(data.error || 'Could not load voices');
    } catch (e) { setVoicePreviewError(e.message); }
    setLoadingVoices(false);
  };

  // Full VO — play in browser with controls (not download)
  const [fullVOUrl, setFullVOUrl] = useState(null);
  const [fullVOPlaying, setFullVOPlaying] = useState(false);
  const [fullVOProgress, setFullVOProgress] = useState(0);
  const [fullVODuration, setFullVODuration] = useState(0);
  const fullVORef = useRef(null);

  const handlePlayFullVO = async () => {
    // If already loaded, toggle play/pause
    if (fullVORef.current && fullVOUrl) {
      if (fullVOPlaying) { fullVORef.current.pause(); setFullVOPlaying(false); }
      else { fullVORef.current.play(); setFullVOPlaying(true); }
      return;
    }
    if (downloadingFullVO) return;
    setDownloadingFullVO(true);
    try {
      const res = await fetch(`${API}/api/scripts/${scriptId}/tts-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        body: JSON.stringify({ voice_id: voiceId, speed: voiceSpeed, stability: voiceStability, similarity_boost: 0.75 }),
      });
      if (!res.ok) { toast.error('Voice generation failed'); setDownloadingFullVO(false); return; }
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
    } catch { toast.error('Voice generation failed'); }
    setDownloadingFullVO(false);
  };

  const handleStopFullVO = () => {
    if (fullVORef.current) { fullVORef.current.pause(); fullVORef.current.currentTime = 0; fullVORef.current = null; }
    setFullVOPlaying(false); setFullVOProgress(0); setFullVOUrl(null);
  };

  const handleSeekFullVO = (e) => {
    if (fullVORef.current && fullVODuration > 0) {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = (e.clientX - rect.left) / rect.width;
      fullVORef.current.currentTime = pct * fullVODuration;
    }
  };

  // Legacy download (still available in More menu)
  const handleDownloadFullVO = async () => {
    if (downloadingFullVO) return;
    setDownloadingFullVO(true);
    try {
      const res = await fetch(`${API}/api/scripts/${scriptId}/tts-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        body: JSON.stringify({ voice_id: voiceId, speed: voiceSpeed, stability: voiceStability, similarity_boost: 0.75 }),
      });
      if (!res.ok) { toast.error('Voice-over download failed'); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `${(script?.title || 'script').replace(/\s+/g, '_')}_vo.mp3`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast.error('Voice-over download failed'); }
    setDownloadingFullVO(false);
  };

  const handleStatusChange = async (status) => {
    const res = await fetch(`${API}/api/scripts/${scriptId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (data.id) setScript(data);
  };

  const handleSaveVersion = async () => {
    await fetch(`${API}/api/scripts/${scriptId}/save-version`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
      body: JSON.stringify({ change_summary: versionLabel }),
    });
    setVersionLabel('');
    loadVersions();
  };

  const handleRestoreVersion = async (vId) => {
    if (!confirm('Restore this version? Current state will be saved automatically.')) return;
    const res = await fetch(`${API}/api/scripts/${scriptId}/restore/${vId}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${jwt()}` },
    });
    const data = await res.json();
    if (data.id) { setScript(data); setShowVersions(false); }
  };

  const handleDeleteScript = async () => {
    if (!confirm(`Delete "${script?.title}"? This cannot be undone.`)) return;
    await fetch(`${API}/api/scripts/${scriptId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${jwt()}` },
    });
    onDeleted?.(scriptId);
  };

  const handleDuplicateScript = async () => {
    const res = await fetch(`${API}/api/scripts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
      body: JSON.stringify({
        title: `${script?.title || 'Untitled'} (Copy)`,
        production_id: script?.production_id || null,
        brand_id: script?.brand_id || null,
        scenes: script?.scenes || [],
        status: 'draft',
      }),
    });
    const newScript = await res.json();
    if (newScript.id) onUpdated?.(newScript);
    setShowMoreMenu(false);
  };

  // ── AI Image wizard flow ──
  const handleRequestAIImage = (sceneId) => {
    const wizardDone = localStorage.getItem(`script_wizard_${scriptId}`);
    if (!wizardDone) {
      // First time — show full wizard starting at step 1
      setWizardTargetSceneId(sceneId);
      setWizardStep(1);
      setWizardProductName('');
      setWizardProductPhotos([]);
      setWizardRefImages([]);
      setShowImageWizard(true);
    } else {
      // Already set up — ask storyboard continuity or independent
      const existing = getCharProfiles();
      const productName = localStorage.getItem(`script_product_name_${scriptId}`) || '';
      const charNames = existing.map(c => c.name).filter(Boolean).join(', ');
      const info = [charNames, productName].filter(Boolean).join(' · ') || 'default settings';
      // If there are other images in the script, show the choice
      const hasExistingImages = scenes.some(s => s.images?.length > 0);
      if (hasExistingImages) {
        setSingleGenPrompt({ sceneId, info });
      } else {
        // No existing images — just generate (nothing to match)
        toast.success(`Generating with ${info}...`);
        handleImageGenerate(sceneId);
      }
    }
  };

  const handleOpenImageSetup = () => {
    // Re-open wizard to edit settings
    const existingProduct = localStorage.getItem(`script_product_name_${scriptId}`) || '';
    let existingPhotos = [];
    try { existingPhotos = JSON.parse(localStorage.getItem(`script_product_photos_${scriptId}`) || '[]'); } catch {}
    let existingRefImages = [];
    try { existingRefImages = JSON.parse(localStorage.getItem(`script_ref_images_${scriptId}`) || '[]'); } catch {}
    const existingChars = getCharProfiles();
    let existingCharPhotos = [];
    try { existingCharPhotos = JSON.parse(localStorage.getItem(`script_char_photos_${scriptId}`) || '[]'); } catch {}

    setWizardTargetSceneId(null); // just editing settings, not generating
    setWizardStep(2);
    setWizardProductName(existingProduct);
    setWizardProductPhotos(existingPhotos.map(p => ({ ...p, previewUrl: p.previewUrl || `data:${p.mimeType};base64,${p.base64}` })));
    setWizardRefImages(existingRefImages);
    setWizardStyleNotes(localStorage.getItem(`script_style_${scriptId}`) || '');
    setShowImageWizard(true);

    if (existingChars.length > 0) {
      // Merge all char photos back into wizard characters (multiple per character)
      setWizardCharacters(existingChars.map(c => {
        const charAllPhotos = existingCharPhotos.filter(p => p.name === c.name);
        const photos = charAllPhotos.map(p => ({ base64: p.base64, mimeType: p.mimeType, previewUrl: `data:${p.mimeType};base64,${p.base64}` }));
        return { name: c.name, description: c.description, photos, photoBase64: photos[0]?.base64 || null, photoMime: photos[0]?.mimeType || null };
      }));
    } else {
      handleWizardExtractChars();
    }
  };

  const handleWizardExtractChars = async () => {
    setExtractingChars(true);
    try {
      const res = await fetch(`${API}/api/scripts/${scriptId}/extract-characters`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwt()}` },
      });
      const data = await res.json();
      setWizardCharacters((data.characters || []).map(c => ({ ...c, description: c.description || '', photoBase64: null, photoMime: null })));
    } catch {}
    setExtractingChars(false);
  };

  const handleActorPhotoUpload = async (e, charIndex) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    for (const file of files.slice(0, 3)) {
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target.result;
        const base64 = dataUrl.split(',')[1];
        const mimeType = file.type || 'image/jpeg';
        // Add photo to character's photos array (up to 3)
        setWizardCharacters(prev => prev.map((c, i) => {
          if (i !== charIndex) return c;
          const photos = [...(c.photos || [])];
          if (photos.length < 3) photos.push({ base64, mimeType, previewUrl: dataUrl });
          // Keep first photo as legacy photoBase64 for backward compat
          return { ...c, photos, photoBase64: photos[0]?.base64 || null, photoMime: photos[0]?.mimeType || null };
        }));
        // Describe actor from first photo only
        if (files.indexOf(file) === 0) {
          setDescribingActor(charIndex);
          try {
            const res = await fetch(`${API}/api/scripts/${scriptId}/describe-actor`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
              body: JSON.stringify({ imageBase64: base64, mimeType, name: wizardCharacters[charIndex]?.name }),
            });
            const data = await res.json();
            if (data.description) {
              setWizardCharacters(prev => prev.map((c, i) => i === charIndex ? { ...c, description: data.description } : c));
            }
          } catch {}
          setDescribingActor(null);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleWizardComplete = (proceedWithAI) => {
    if (!proceedWithAI) {
      // User has their own images — close wizard and open file upload
      localStorage.setItem(`script_wizard_${scriptId}`, 'done');
      setShowImageWizard(false);
      return;
    }
    // Save all wizard data to localStorage (wrapped in try/catch — localStorage has ~5MB limit)
    const profiles = wizardCharacters.filter(c => c.description).map(c => ({ name: c.name, description: c.description }));
    saveCharProfiles(profiles);
    try {
      const charPhotos = [];
      wizardCharacters.forEach(c => {
        const photos = c.photos || (c.photoBase64 ? [{ base64: c.photoBase64, mimeType: c.photoMime || 'image/jpeg' }] : []);
        photos.forEach(p => { if (p.base64) charPhotos.push({ name: c.name, base64: p.base64, mimeType: p.mimeType || 'image/jpeg' }); });
      });
      if (charPhotos.length > 0) localStorage.setItem(`script_char_photos_${scriptId}`, JSON.stringify(charPhotos));
      else localStorage.removeItem(`script_char_photos_${scriptId}`);
    } catch (e) { console.warn('Could not save character photos to localStorage (quota?):', e.message); }
    try {
      if (wizardStyleNotes.trim()) localStorage.setItem(`script_style_${scriptId}`, wizardStyleNotes.trim());
      if (wizardProductName.trim()) localStorage.setItem(`script_product_name_${scriptId}`, wizardProductName.trim());
      const productPhotosToSave = wizardProductPhotos.slice(0, 3).map(p => ({ base64: p.base64, mimeType: p.mimeType }));
      if (productPhotosToSave.length > 0) localStorage.setItem(`script_product_photos_${scriptId}`, JSON.stringify(productPhotosToSave));
    } catch (e) { console.warn('Could not save product photos to localStorage (quota?):', e.message); }
    try {
      const refImagesToSave = wizardRefImages.slice(0, 5).map(r => ({ base64: r.base64, mimeType: r.mimeType })); // drop previewUrl to save space
      if (refImagesToSave.length > 0) localStorage.setItem(`script_ref_images_${scriptId}`, JSON.stringify(refImagesToSave));
      else localStorage.removeItem(`script_ref_images_${scriptId}`);
    } catch (e) { console.warn('Could not save ref images to localStorage (quota?):', e.message); }
    localStorage.setItem(`script_wizard_${scriptId}`, 'done');

    // Close wizard and start generation
    const target = wizardTargetSceneId;
    setShowImageWizard(false);
    setWizardTargetSceneId(null);

    if (target === '__all__') {
      const withoutImages = scenes.filter(s => !s.images || s.images.length === 0);
      const includeAll = withoutImages.length === 0;
      // Use requestAnimationFrame to ensure wizard is unmounted before starting
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          executeGenerateAll(includeAll);
        });
      });
    } else if (target) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          handleImageGenerate(target);
        });
      });
    }
  };

  // ── Generate All Images ──
  const handleGenerateAll = async (skipWizardCheck = false) => {
    if (!skipWizardCheck) {
      // Always show wizard when user manually clicks Generate All
      // Pre-populate with any existing settings
      const existingProduct = localStorage.getItem(`script_product_name_${scriptId}`) || '';
      let existingPhotos = [];
      try { existingPhotos = JSON.parse(localStorage.getItem(`script_product_photos_${scriptId}`) || '[]'); } catch {}
      const existingChars = getCharProfiles();

      let existingRefImages = [];
      try { existingRefImages = JSON.parse(localStorage.getItem(`script_ref_images_${scriptId}`) || '[]'); } catch {}

      setWizardTargetSceneId('__all__');
      setWizardStep(2);
      setWizardProductName(existingProduct);
      setWizardProductPhotos(existingPhotos.map(p => ({ ...p, previewUrl: p.previewUrl || `data:${p.mimeType};base64,${p.base64}` })));
      setWizardRefImages(existingRefImages);
      setWizardStyleNotes(localStorage.getItem(`script_style_${scriptId}`) || '');
      setShowImageWizard(true);

      // Always re-extract characters (show current ones immediately if any)
      if (existingChars.length > 0) {
        setWizardCharacters(existingChars.map(c => ({ name: c.name, description: c.description })));
      }
      handleWizardExtractChars();

      // Auto-detect product if not already set
      if (!existingProduct) {
        fetch(`${API}/api/scripts/${scriptId}/extract-product`, {
          method: 'POST', headers: { Authorization: `Bearer ${jwt()}` },
        }).then(r => r.json()).then(d => { if (d.product_name) setWizardProductName(d.product_name); }).catch(() => {});
      }
      return;
    }

    // Show confirmation modal
    setGenAllIncludeExisting(false);
    setShowGenAllConfirm(true);
  };

  const executeGenerateAll = async (includeExistingOverride) => {
    setShowGenAllConfirm(false);
    setShowImageWizard(false); // ensure wizard is closed
    const withoutImages = scenes.filter(s => !s.images || s.images.length === 0);
    const includeExisting = includeExistingOverride !== undefined ? includeExistingOverride : genAllIncludeExisting;
    const scenesToGen = includeExisting ? [...scenes] : (withoutImages.length > 0 ? withoutImages : [...scenes]);

    if (scenesToGen.length === 0) {
      toast.info('No scenes to generate for');
      return;
    }

    setGeneratingAll(true);
    setGenerateAllProgress({ current: 0, total: scenesToGen.length });
    toast.success(`Generating ${scenesToGen.length} image${scenesToGen.length !== 1 ? 's' : ''}...`);

    for (let i = 0; i < scenesToGen.length; i++) {
      setGenerateAllProgress({ current: i + 1, total: scenesToGen.length });
      try {
        await handleImageGenerate(scenesToGen[i].id);
      } catch {}
      if (i < scenesToGen.length - 1) await new Promise(r => setTimeout(r, 1500));
    }
    toast.success(`Done! Generated ${scenesToGen.length} images.`);

    setGeneratingAll(false);
    setGenerateAllProgress({ current: 0, total: 0 });
  };

  // ── Image regeneration ──
  const handleRegenImage = (sceneId, img) => {
    setRegenModal({ sceneId, imageId: img.id, prompt: img.prompt || '' });
    setRegenMode('same');
    setRegenPrompt(img.prompt || '');
    setRegenRefBase64(''); setRegenRefMime(''); setRegenRefUrl(''); setRegenRefPreview('');
  };

  const handleGalleryReplace = (sceneId, imageId, newImage) => {
    setScript(prev => {
      const updated = { ...prev, scenes: prev.scenes.map(s => {
        if (s.id !== sceneId) return s;
        return { ...s, images: (s.images || []).map(img =>
          img.id === imageId ? { ...img, url: newImage.url, prompt: newImage.prompt || img.prompt, source: newImage.type || 'gallery' } : img
        )};
      })};
      debounceSave(updated);
      return updated;
    });
  };

  const handleRegenConfirm = async () => {
    if (!regenModal) return;
    setRegenLoading(true);
    const charProfiles = getCharProfiles();
    const styleNotes = localStorage.getItem(`script_style_${scriptId}`) || '';
    const body = {
      scene_id: regenModal.sceneId,
      replace_image_id: regenModal.imageId,
      prompt: regenMode === 'edit' ? regenPrompt : undefined,
      character_profiles: charProfiles.length > 0 ? charProfiles : undefined,
      style_notes: styleNotes || undefined,
    };
    // Attach reference image if provided
    if (regenMode === 'reference') {
      if (regenRefBase64) {
        body.reference_image = { base64: regenRefBase64, mimeType: regenRefMime || 'image/jpeg' };
      } else if (regenRefUrl.trim()) {
        body.reference_image_url = regenRefUrl.trim();
      }
    }
    const res = await fetch(`${API}/api/scripts/${scriptId}/ai-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    setRegenLoading(false);
    setRegenModal(null);
    setRegenRefBase64(''); setRegenRefMime(''); setRegenRefUrl(''); setRegenRefPreview('');
    if (data.url) await loadScript();
    else { toast.error(data.error || 'Image regeneration failed'); }
  };

  const getCommentCount = (sceneId) => comments.filter(c => c.scene_id === sceneId && c.status === 'open').length;
  const openCommentCount = comments.filter(c => c.status === 'open').length;
  const scenes = script?.scenes || [];
  const shareUrl = shareToken ? `${window.location.origin}/script/${shareToken}` : '';

  // ── Format toolbar — global mouseup listener ──
  useEffect(() => {
    const handleMouseUp = () => {
      const sel = window.getSelection();
      if (sel && sel.toString().trim() && sel.rangeCount > 0) {
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        setFormatToolbar({
          top: rect.top + window.scrollY - 44,
          left: Math.max(8, rect.left + window.scrollX + rect.width / 2 - 100),
        });
      } else {
        setFormatToolbar(null);
      }
    };
    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  // ── Commercial timing (speed-adjusted, memoized) ──
  const rawVoSeconds = useMemo(() => scenes.reduce((sum, s) => sum + estimateSeconds(stripHtml(s.what_we_hear)), 0), [scenes]);
  const totalVoSeconds = Math.round(rawVoSeconds / voiceSpeed);

  // Build cumulative timecode map for each scene
  const sceneTimecodes = useMemo(() => {
    const map = {};
    let cumulative = 0;
    for (const s of scenes) {
      const dur = sceneDurations[s.id]
        ? Math.round(sceneDurations[s.id] / voiceSpeed)
        : Math.round(estimateSeconds(stripHtml(s.what_we_hear)) / voiceSpeed);
      map[s.id] = { start: cumulative, end: cumulative + dur, isActual: !!sceneDurations[s.id] };
      cumulative += dur;
    }
    return map;
  }, [scenes, sceneDurations, voiceSpeed]);

  const targetSeconds = parseInt(commercialTarget) || 30;
  const timingRatio = totalVoSeconds / targetSeconds;
  const timingColor = timingRatio <= 0.9 ? 'text-gray-500' : timingRatio <= 1.05 ? 'text-green-600' : timingRatio <= 1.2 ? 'text-amber-600' : 'text-red-600';

  if (loading) return (
    <div className="flex-1 flex items-center justify-center">
      <Loader2 size={24} className="animate-spin text-gray-400" />
    </div>
  );

  if (!scriptId || !script) return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-12">
      <Scroll size={40} className="text-gray-200 mb-4" />
      <p className="text-gray-400 text-sm">Select a script or create a new one</p>
    </div>
  );

  const Scroll2 = ({ size, className }) => <svg width={size} height={size} className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 0 1-2 2z"/><path d="M19 3H8a2 2 0 0 0-2 2v12"/><path d="M3 7a2 2 0 0 1 2-2"/></svg>;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* ── Header ── */}
      <div className="flex-none border-b border-gray-100 bg-white px-4 py-3">
        <div className="flex items-center gap-3 mb-2">
          {onBack && (
            <button onClick={onBack} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
              <ArrowLeft size={16} />
            </button>
          )}
          <div className="flex-1 min-w-0">
            <input
              value={script.title}
              onChange={e => { setScript(p => ({ ...p, title: e.target.value })); debounceSave({ ...script, title: e.target.value }); }}
              readOnly={readOnly}
              className="w-full text-lg font-black text-gray-900 bg-transparent border-0 outline-none"
              placeholder="Untitled Script"
            />
            <input
              value={script.description || ''}
              onChange={e => { setScript(p => ({ ...p, description: e.target.value })); debounceSave({ ...script, description: e.target.value }); }}
              readOnly={readOnly}
              className="w-full text-xs text-gray-400 bg-transparent border-0 outline-none mt-0.5 placeholder:text-gray-300"
              placeholder="Add a short description…"
            />
            {/* Production link */}
            {!readOnly && productions.length > 0 && (
              <div className="mt-1.5">
                <ProductionPicker
                  productions={productions}
                  value={script.production_id || ''}
                  onChange={reassignProduction}
                  placeholder="No production — click to assign"
                  mode="dropdown"
                />
              </div>
            )}
            {readOnly && script.production_id && (
              <div className="mt-1 text-[11px] text-gray-400 flex items-center gap-1">
                <span className="font-mono text-gray-300">{script.production_id}</span>
                {productions.find(p => p.id === script.production_id)?.project_name && (
                  <span>· {productions.find(p => p.id === script.production_id).project_name}</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1.5 ml-auto">
            {/* Status */}
            <select
              value={script.status || 'draft'}
              onChange={e => handleStatusChange(e.target.value)}
              disabled={readOnly}
              className={`text-xs font-semibold rounded-full px-2.5 py-1 border-0 outline-none cursor-pointer ${STATUS_COLORS[script.status] || STATUS_COLORS.draft}`}
            >
              <option value="draft">Draft</option>
              <option value="review">Review</option>
              <option value="approved">Approved</option>
              <option value="archived">Archived</option>
            </select>
            {/* Save indicator */}
            <span className="text-xs text-gray-400 min-w-[60px] text-right flex items-center gap-1 justify-end">
              {saving
                ? <><Loader2 size={12} className="animate-spin" /><span>Saving…</span></>
                : saved
                  ? <><Check size={12} className="text-green-500" /><span className="text-green-600">Saved{savedAt ? ` ${savedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span></>
                  : <span className="text-amber-500">Unsaved</span>
              }
            </span>
          </div>
        </div>

        {/* ── Compact timing bar ── */}
        {totalVoSeconds > 0 && (
          <div className="flex items-center gap-2 mb-2 scripts-no-print">
            <div className="flex-1 bg-gray-100 rounded-full h-1.5 relative overflow-hidden flex">
              {scenes.map((s, i) => {
                const dur = sceneTimecodes[s.id]?.end - sceneTimecodes[s.id]?.start || 0;
                const pct = targetSeconds > 0 ? (dur / targetSeconds) * 100 : 0;
                const sceneColors = ['bg-indigo-400', 'bg-purple-400', 'bg-blue-400', 'bg-teal-400', 'bg-pink-400', 'bg-amber-400'];
                return <div key={s.id} className={`h-full ${sceneColors[i % sceneColors.length]}`} style={{ width: `${Math.min(pct, 100)}%`, marginLeft: i > 0 ? '1px' : 0 }} title={`Sc ${i + 1}: ${fmtSeconds(dur)}`} />;
              })}
            </div>
            <span className={`text-[10px] font-mono font-semibold ${timingColor}`}>{fmtSeconds(totalVoSeconds)}/{targetSeconds}s</span>
            <div className="flex items-center gap-0.5 bg-gray-100 rounded p-0.5">
              {['15', '30', '60', '90', '120'].map(t => (
                <button key={t} onClick={() => { setCommercialTarget(t); localStorage.setItem(`script_target_${scriptId}`, t); }}
                  className={`text-[9px] px-1.5 py-0.5 rounded font-semibold transition-colors ${commercialTarget === t ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}>{t}s</button>
              ))}
              <input
                type="number" min="5" max="600" step="5"
                value={commercialTarget}
                onChange={e => { const v = e.target.value; setCommercialTarget(v); localStorage.setItem(`script_target_${scriptId}`, v); }}
                className="w-10 text-[9px] font-mono font-semibold text-center bg-transparent border-0 outline-none text-gray-500 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                title="Custom target duration (seconds)"
              />
            </div>
          </div>
        )}

        {/* ── Toolbar — single clean row ── */}
        <div className="flex items-center gap-1.5 flex-wrap scripts-no-print">
          {/* Views */}
          <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
            {[{ id: 'table', icon: Table2, label: 'Table' }, { id: 'vo', icon: Volume2, label: 'VO' }, { id: 'storyboard', icon: Layout, label: 'Visual' }].map(v => (
              <button key={v.id} onClick={() => { setActiveView(v.id); localStorage.setItem(`script_view_${scriptId}`, v.id); }}
                className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${activeView === v.id ? 'bg-white shadow-sm text-gray-800' : 'text-gray-500 hover:text-gray-700'}`}>
                <v.icon size={12} /> {v.label}
              </button>
            ))}
          </div>

          {/* Column picker (table only) */}
          {activeView === 'table' && !readOnly && (
            <div className="relative">
              <button onClick={() => setShowColMenu(p => !p)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-500 hover:bg-gray-100 border border-gray-200 transition-colors">
                <Columns3 size={12} /> Columns
              </button>
              {showColMenu && (
                <div className="absolute top-full mt-1 left-0 bg-white border border-gray-200 rounded-xl shadow-lg p-3 z-20 min-w-[180px]">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Show / Hide Columns</p>
                  {Object.keys(visibleCols).map(col => (
                    <label key={col} className="flex items-center gap-2 py-1 text-xs text-gray-700 cursor-pointer hover:text-gray-900">
                      <input type="checkbox" checked={visibleCols[col]} onChange={e => {
                        const next = { ...visibleCols, [col]: e.target.checked };
                        setVisibleCols(next);
                        localStorage.setItem(`script_cols_${scriptId}`, JSON.stringify(next));
                      }} className="accent-indigo-600" />
                      {col.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Row density toggle */}
          {activeView === 'table' && (
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
              {[
                { key: 'compact', label: 'S', title: 'Compact rows' },
                { key: 'default', label: 'M', title: 'Default rows' },
                { key: 'spacious', label: 'L', title: 'Spacious rows + large images' },
              ].map(d => (
                <button key={d.key} title={d.title}
                  onClick={() => { setRowDensity(d.key); localStorage.setItem(`script_density_${scriptId}`, d.key); }}
                  className={`text-[9px] font-bold px-1.5 py-0.5 rounded transition-colors ${rowDensity === d.key ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}>
                  {d.label}
                </button>
              ))}
            </div>
          )}

          {/* VO controls — voice + play */}
          <button onClick={() => { setShowVoicePicker(true); setVoicePreviewError(null); loadAccountVoices(); }}
            className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors font-medium"
            title="Voice settings">
            <Volume2 size={10} />
            {accountVoices.find(v => v.voice_id === voiceId)?.name || 'Voice'}
            {voiceSpeed !== 1.0 && <span className="opacity-60">{voiceSpeed}x</span>}
          </button>
          {fullVOUrl ? (
            <div className="flex items-center gap-1 bg-indigo-100 rounded-lg px-2 py-1">
              <button onClick={handlePlayFullVO} className="text-indigo-600"><Play size={11} /></button>
              <div className="w-16 h-1 bg-indigo-200 rounded-full cursor-pointer" onClick={handleSeekFullVO}>
                <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${fullVODuration > 0 ? (fullVOProgress / fullVODuration) * 100 : 0}%` }} />
              </div>
              <span className="text-[8px] font-mono text-indigo-600">{Math.floor(fullVOProgress)}s</span>
              <button onClick={handleStopFullVO} className="text-indigo-400 hover:text-red-500"><X size={9} /></button>
            </div>
          ) : (
            <button onClick={handlePlayFullVO} disabled={downloadingFullVO}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 font-medium">
              {downloadingFullVO ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
              {downloadingFullVO ? 'Gen...' : 'Play All'}
            </button>
          )}

          <div className="flex-1" />

          {/* Actions */}
          {!readOnly && (
            <>
              <button onClick={() => setShowBlocks(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors">
                <Package size={11} /> Blocks
              </button>
              <button onClick={() => setShowVideoMatch(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-gray-600 hover:bg-gray-100 border border-gray-200 transition-colors"
                title="Match video frames to script scenes">
                <Film size={11} /> Video
              </button>
              <button onClick={() => { setShowAIChat(true); setAiChatSelectedText(''); setAiChatSceneId(null); }}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 transition-colors">
                <Sparkles size={11} /> AI
              </button>
              {scenes.some(s => !s.images || s.images.length === 0) && (
                <button onClick={() => handleGenerateAll()} disabled={generatingAll}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors">
                  {generatingAll
                    ? <><Loader2 size={11} className="animate-spin" /> {generateAllProgress.current}/{generateAllProgress.total}</>
                    : <><ImageIcon size={11} /> Images ({scenes.filter(s => !s.images || s.images.length === 0).length})</>
                  }
                </button>
              )}
              <button onClick={() => { setShowComments(true); loadComments(); }}
                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs border transition-colors ${openCommentCount > 0 ? 'border-amber-300 bg-amber-50 text-amber-700 font-semibold' : 'border-gray-200 text-gray-500 hover:bg-gray-50'}`}>
                <MessageSquare size={11} /> {openCommentCount > 0 ? openCommentCount : ''}
              </button>
              <button onClick={() => setShowShare(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                <Share2 size={11} />
              </button>
            </>
          )}
          <button onClick={() => setPresentMode(true)} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
            <Play size={11} />
          </button>
          {/* ⋯ More menu */}
          {!readOnly && (
            <div className="relative scripts-no-print">
              <button onClick={() => setShowMoreMenu(p => !p)}
                className="flex items-center px-2 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors">
                ⋯
              </button>
              {showMoreMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg py-1 z-30 min-w-[180px]">
                  <button onClick={handleDuplicateScript}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                    <Copy size={12} /> Duplicate Script
                  </button>
                  <button onClick={() => {
                    setShowMoreMenu(false);
                    localStorage.removeItem(`script_wizard_${scriptId}`);
                    localStorage.removeItem(`script_chars_${scriptId}`);
                    localStorage.removeItem(`script_style_${scriptId}`);
                    localStorage.removeItem(`script_product_name_${scriptId}`);
                    localStorage.removeItem(`script_product_photos_${scriptId}`);
                    toast.success('AI image setup reset');
                  }} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                    <Sparkles size={12} /> Reset AI Image Setup
                  </button>
                  <button onClick={() => { setShowMoreMenu(false); handleGenerateAll(); }}
                    disabled={generatingAll}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    <Sparkles size={12} className="text-purple-500" />
                    {generatingAll ? `Generating ${generateAllProgress.current}/${generateAllProgress.total}...` : 'Generate All Images'}
                  </button>
                  <button onClick={() => { setShowMoreMenu(false); handleDownloadFullVO(); }}
                    disabled={downloadingFullVO}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                    <Download size={12} className="text-indigo-500" />
                    {downloadingFullVO ? 'Generating VO...' : 'Download Full VO (MP3)'}
                  </button>
                  <button onClick={async () => {
                    setShowMoreMenu(false);
                    try {
                      // Ensure a share link exists (view mode is fine for PDF)
                      let token = script.share_token;
                      if (!token) {
                        const res = await fetch(`${API}/api/scripts/${scriptId}/share`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
                          body: JSON.stringify({ share_mode: script.share_mode || 'view' }),
                        });
                        const data = await res.json();
                        token = data.share_token;
                        if (token) setScript(prev => ({ ...prev, share_token: token, share_mode: data.share_mode }));
                      }
                      if (token) {
                        window.open(`${window.location.origin}/script/${token}?print=1`, '_blank');
                      } else {
                        // Fallback to browser print
                        window.print();
                      }
                    } catch { window.print(); }
                  }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                    <Download size={12} className="text-green-500" />
                    Export PDF
                  </button>
                  <button onClick={() => { setShowMoreMenu(false); handleOpenImageSetup(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                    <Settings size={12} className="text-purple-500" />
                    Image Setup
                  </button>
                  <button onClick={() => { setShowMoreMenu(false); setShowVersions(true); loadVersions(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50">
                    <History size={12} />
                    Version History
                  </button>
                  <div className="px-3 py-2 border-t border-gray-100">
                    <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Target Duration</div>
                    <div className="flex items-center gap-1 flex-wrap">
                      {['15', '30', '60', '90', '120'].map(t => (
                        <button key={t} onClick={() => { setCommercialTarget(t); localStorage.setItem(`script_target_${scriptId}`, t); }}
                          className={`text-[10px] px-2 py-1 rounded-md font-semibold transition-colors ${commercialTarget === t ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>{t}s</button>
                      ))}
                      <input type="number" min="5" max="600" step="5" value={commercialTarget}
                        onChange={e => { setCommercialTarget(e.target.value); localStorage.setItem(`script_target_${scriptId}`, e.target.value); }}
                        className="w-12 text-[10px] font-mono text-center border border-gray-200 rounded-md px-1 py-1 outline-none focus:border-indigo-300"
                        title="Custom seconds" />
                    </div>
                  </div>
                  {script.status !== 'approved' && (
                    <button onClick={() => { setShowMoreMenu(false); handleApprove(); }} disabled={approvingLoading}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-green-600 hover:bg-green-50">
                      <CheckCircle size={12} />
                      {approvingLoading ? 'Approving...' : 'Approve Script'}
                    </button>
                  )}
                  {script.drive_url && (
                    <a href={script.drive_url} target="_blank" rel="noopener noreferrer"
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-green-600 hover:bg-green-50">
                      <ExternalLink size={12} /> Open in Google Drive
                    </a>
                  )}
                  <div className="border-t border-gray-100 my-1" />
                  <button onClick={() => {
                    setShowMoreMenu(false);
                    if (!confirm('Remove all images from every scene? This cannot be undone.')) return;
                    const updated = { ...script, scenes: script.scenes.map(s => ({ ...s, images: [] })) };
                    setScript(updated);
                    debounceSave(updated);
                    // Also reset the wizard so Generate All prompts for refs again
                    localStorage.removeItem(`script_wizard_${scriptId}`);
                  }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-500 hover:bg-red-50">
                    <ImageIcon size={12} /> Clear All Images
                  </button>
                  <button onClick={() => { setShowMoreMenu(false); handleDeleteScript(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50">
                    <Trash2 size={12} /> Delete Script
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Generate All Images banner (only when no images exist) ── */}
      {generatingAll && (
        <div className="mx-4 mt-3 p-4 rounded-xl bg-purple-50 border border-purple-200 scripts-no-print">
          <div className="flex items-center gap-3 mb-2">
            <Loader2 size={18} className="text-purple-500 animate-spin shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-bold text-purple-800">
                Generating storyboard images...
              </p>
              <p className="text-xs text-purple-600 mt-0.5">
                Scene {generateAllProgress.current} of {generateAllProgress.total}
                {generateAllProgress.current > 0 && generateAllProgress.total > 0 &&
                  ` — ~${Math.ceil((generateAllProgress.total - generateAllProgress.current) * 15)}s remaining`}
              </p>
            </div>
            <span className="text-lg font-black text-purple-700">
              {generateAllProgress.total > 0 ? Math.round((generateAllProgress.current / generateAllProgress.total) * 100) : 0}%
            </span>
          </div>
          <div className="h-2 bg-purple-200 rounded-full overflow-hidden">
            <div className="h-full bg-purple-500 rounded-full transition-all duration-500" style={{ width: `${generateAllProgress.total > 0 ? (generateAllProgress.current / generateAllProgress.total) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto">

        {/* Table View */}
        {activeView === 'table' && (
          <div className="overflow-x-auto scripts-printable" style={{ WebkitOverflowScrolling: 'touch' }}>
            {/* Mobile scroll hint */}
            <div className="sm:hidden flex items-center gap-1 text-[10px] text-gray-400 mb-2 px-1">
              <span>← scroll →</span>
              <span className="ml-auto opacity-60">tip: use landscape for best view</span>
            </div>
            <table className="w-full border-collapse min-w-[700px] scripts-table">
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">
                  <th className="w-6" />
                  <th className="w-12 px-2 py-2 text-center">#</th>
                  {visibleCols.location && <th className="w-40 px-2 py-2 text-left">Location</th>}
                  {visibleCols.what_we_see && <th className="px-2 py-2 text-left">What We See</th>}
                  {visibleCols.what_we_hear && <th className="px-2 py-2 text-left">What We Hear</th>}
                  {visibleCols.duration && <th className="w-20 px-2 py-2 text-left">Duration</th>}
                  {visibleCols.visuals && <th className={`${density.visualsW} px-2 py-2 text-left`}>Visuals</th>}
                  <th className="w-16" />
                </tr>
              </thead>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={scenes.map(s => s.id)} strategy={verticalListSortingStrategy}>
                  <tbody>
                    {scenes.map((scene, idx) => (
                      <SortableSceneRow
                        key={scene.id}
                        scene={scene}
                        index={idx + 1}
                        visibleCols={visibleCols}
                        onUpdate={updateScene}
                        onDelete={removeScene}
                        onDuplicate={duplicateScene}
                        onAddScene={addScene}
                        isLastRow={idx === scenes.length - 1}
                        commentCount={getCommentCount(scene.id)}
                        onCommentClick={handleCommentClick}
                        onImageUpload={handleImageUpload}
                        onImageDelete={handleImageDelete}
                        onImageGenerate={handleImageGenerate}
                        onRegenImage={handleRegenImage}
                        onRequestAIImage={handleRequestAIImage}
                        onLightbox={setLightbox}
                        onOpenGallery={(sceneId) => setGalleryTarget({ sceneId, imageId: null })}
                        density={density}
                        readOnly={readOnly}
                        onPlayTTS={handlePlayTTS}
                        isPlaying={playingSceneId === scene.id}
                        onSmartSplit={handleSmartSplit}
                        suggestingShots={suggestingShots}
                        generatingSceneId={generatingSceneId}
                      />
                    ))}
                  </tbody>
                </SortableContext>
              </DndContext>
            </table>
            {!readOnly && (
              <button onClick={addScene} className="w-full py-3 text-sm text-gray-400 hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors border-t border-gray-100 flex items-center justify-center gap-1.5">
                <Plus size={14} /> Add Scene
              </button>
            )}
            {scenes.length === 0 && (
              <div className="text-center py-16 text-gray-400">
                <Film size={32} className="mx-auto mb-3 text-gray-200" />
                <p className="text-sm font-medium">No scenes yet</p>
                <p className="text-xs mt-1">Add a scene below or use AI to generate</p>
              </div>
            )}
          </div>
        )}

        {/* VO View */}
        {activeView === 'vo' && (
          <div className="max-w-2xl mx-auto py-8 px-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Audio / Voiceover Script</h3>
                <p className="text-[10px] text-gray-400 mt-1 font-mono">
                  {scenes.length} scene{scenes.length !== 1 ? 's' : ''} · {scenes.reduce((sum, s) => sum + (stripStageDirections(stripHtml(s.what_we_hear))?.split(/\s+/).filter(Boolean).length || 0), 0)} words · {fmtSeconds(totalVoSeconds)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setShowVoicePicker(true); setVoicePreviewError(null); loadAccountVoices(); }}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-100 transition-colors font-semibold"
                >
                  <Volume2 size={10} />
                  {accountVoices.find(v => v.voice_id === voiceId)?.name || 'Voice'}
                </button>
                {totalVoSeconds > 0 && (
                  <span className={`text-xs font-mono font-semibold ${timingColor}`}>
                    {fmtSeconds(totalVoSeconds)} / {targetSeconds}s
                  </span>
                )}
                {!readOnly && (
                  <button onClick={handleDownloadFullVO} disabled={downloadingFullVO}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                    {downloadingFullVO ? <Loader2 size={11} className="animate-spin" /> : <Download size={11} />}
                    {downloadingFullVO ? 'Generating…' : 'Download Full VO'}
                  </button>
                )}
              </div>
            </div>
            {scenes.map((scene, idx) => {
              const sceneWords = stripStageDirections(stripHtml(scene.what_we_hear))?.split(/\s+/).filter(Boolean).length || 0;
              const sceneSecs = estimateSeconds(stripHtml(scene.what_we_hear));
              const sceneDurColor = targetSeconds > 0 && scenes.length > 0
                ? (sceneSecs <= targetSeconds / scenes.length * 1.1 ? 'text-green-600' : sceneSecs <= targetSeconds / scenes.length * 1.5 ? 'text-amber-600' : 'text-red-600')
                : 'text-gray-500';
              return (
                <div key={scene.id} className="mb-6 pb-6 border-b border-gray-100 last:border-0">
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="text-xs font-bold text-gray-400 w-5">{idx + 1}</span>
                    {scene.location && <span className="text-xs font-mono text-gray-400">{scene.location}</span>}
                    <span className="text-[10px] text-gray-300 font-mono">{sceneWords}w</span>
                    <span className={`text-[10px] font-mono font-semibold ${sceneDurColor}`}>~{fmtSeconds(sceneSecs)}</span>
                    <div className="ml-auto flex items-center gap-2">
                      {sceneTimecodes[scene.id] && (
                        <span className={`text-[10px] font-mono ${sceneTimecodes[scene.id]?.isActual ? 'text-indigo-500' : 'text-gray-400'}`} title={sceneTimecodes[scene.id]?.isActual ? 'Actual ElevenLabs duration' : 'Estimated'}>
                          {fmtTimecode(sceneTimecodes[scene.id]?.start ?? 0)}–{fmtTimecode(sceneTimecodes[scene.id]?.end ?? 0)}
                        </span>
                      )}
                      {scene.what_we_hear?.trim() && (
                        <button
                          onClick={() => handlePlayTTS(scene.id)}
                          className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${playingSceneId === scene.id ? 'border-indigo-300 bg-indigo-50 text-indigo-600' : 'border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-300'}`}
                        >
                          {playingSceneId === scene.id ? <Loader2 size={9} className="animate-spin" /> : <Play size={9} />}
                          {playingSceneId === scene.id ? 'Playing...' : 'Play VO'}
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-base text-indigo-800 leading-relaxed italic pl-8">
                    {scene.what_we_hear
                      ? (() => {
                          // Parse muted spans, stage directions, and regular text
                          const html = scene.what_we_hear || '';
                          // Split on muted spans first, then stage directions
                          const parts = html
                            .replace(/<span[^>]*data-muted[^>]*>(.*?)<\/span>/gi, '‹MUTED›$1‹/MUTED›')
                            .replace(/<[^>]*>/g, '')
                            .split(/(‹MUTED›.*?‹\/MUTED›|\[[^\]]*\]|\([^)]*\))/g);
                          return parts.map((part, i) => {
                            if (/^‹MUTED›/.test(part)) {
                              const text = part.replace(/‹\/?MUTED›/g, '');
                              return <span key={i} className="text-gray-400 line-through text-sm opacity-60" title="Non-spoken (muted)">{text}</span>;
                            }
                            if (/^[\[(]/.test(part)) {
                              return <span key={i} className="text-gray-400 italic text-xs">{part}</span>;
                            }
                            return part;
                          });
                        })()
                      : <span className="text-gray-300">No audio for this scene</span>}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Storyboard View */}
        {activeView === 'storyboard' && (
          <div className="p-6 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
            {scenes.map((scene, idx) => (
              <div key={scene.id} className="rounded-xl border border-gray-200 overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow cursor-pointer" onClick={() => setActiveView('table')}>
                <div className="bg-gray-900 px-3 py-1.5 flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400">{idx + 1}</span>
                  {scene.location && <span className="text-xs font-mono text-white/80 truncate">{scene.location}</span>}
                </div>
                {(scene.images || [])[0] ? (
                  <img src={(scene.images || [])[0].url} alt="" className="w-full h-32 object-cover" />
                ) : (
                  <div className="w-full h-32 bg-gray-100 flex items-center justify-center"><Film size={24} className="text-gray-300" /></div>
                )}
                {(scene.images || []).length > 1 && (
                  <div className="flex gap-1 p-1.5 border-t border-gray-100">
                    {(scene.images || []).slice(1, 4).map(img => (
                      <img key={img.id} src={img.url} alt="" className="h-8 w-12 object-cover rounded" />
                    ))}
                    {(scene.images || []).length > 4 && <span className="text-xs text-gray-400 self-center">+{(scene.images || []).length - 4}</span>}
                  </div>
                )}
                <div className="px-3 py-2">
                  {scene.what_we_see && <p className="text-xs text-gray-600 line-clamp-2">{scene.what_we_see}</p>}
                  {scene.what_we_hear && <p className="text-xs text-indigo-600 italic line-clamp-1 mt-0.5">{scene.what_we_hear}</p>}
                </div>
              </div>
            ))}
            {scenes.length === 0 && (
              <div className="col-span-full text-center py-16 text-gray-400">
                <Film size={32} className="mx-auto mb-3 text-gray-200" />
                <p className="text-sm">No scenes yet</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Overlays ─────────────────────────────────────────────────────────── */}

      {/* Present Mode */}
      {presentMode && scenes.length > 0 && (
        <div className="fixed inset-0 z-50 bg-black flex flex-col" onKeyDown={e => {
          if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setPresentIdx(i => Math.min(i + 1, scenes.length - 1));
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setPresentIdx(i => Math.max(i - 1, 0));
          if (e.key === 'Escape') { setPresentMode(false); setPresentIdx(0); }
        }} tabIndex={0} autoFocus>
          <div className="flex items-center justify-between px-6 py-3 border-b border-white/10">
            <span className="text-white/60 text-sm font-mono">{scenes[presentIdx]?.location || ''}</span>
            <span className="text-white/40 text-xs">{presentIdx + 1} / {scenes.length}</span>
            <button onClick={() => { setPresentMode(false); setPresentIdx(0); }} className="text-white/60 hover:text-white"><X size={20} /></button>
          </div>
          <div className="flex-1 flex overflow-hidden">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-0">
              <div className="p-8 md:p-12 flex flex-col justify-center border-r border-white/10">
                <p className="text-xs font-bold uppercase tracking-widest text-white/30 mb-4">What We See</p>
                <p className="text-xl md:text-2xl text-white leading-relaxed">{scenes[presentIdx]?.what_we_see || '—'}</p>
              </div>
              <div className="p-8 md:p-12 flex flex-col justify-center bg-indigo-950/50">
                <p className="text-xs font-bold uppercase tracking-widest text-indigo-300/50 mb-4">What We Hear</p>
                <p className="text-xl md:text-2xl text-indigo-200 leading-relaxed italic">{scenes[presentIdx]?.what_we_hear || '—'}</p>
              </div>
            </div>
            {(scenes[presentIdx]?.images || []).length > 0 && (
              <div className="w-80 border-l border-white/10 p-4 overflow-y-auto">
                {(scenes[presentIdx].images || []).map(img => (
                  <img key={img.id} src={img.url} alt="" className="w-full rounded-lg mb-3 object-cover" />
                ))}
              </div>
            )}
          </div>
          <div className="flex justify-center gap-4 py-4">
            <button onClick={() => setPresentIdx(i => Math.max(i - 1, 0))} disabled={presentIdx === 0}
              className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"><ChevronLeft size={20} /></button>
            <div className="flex gap-1 items-center">
              {scenes.map((_, i) => (
                <button key={i} onClick={() => setPresentIdx(i)} className={`w-2 h-2 rounded-full transition-colors ${i === presentIdx ? 'bg-white' : 'bg-white/30'}`} />
              ))}
            </div>
            <button onClick={() => setPresentIdx(i => Math.min(i + 1, scenes.length - 1))} disabled={presentIdx === scenes.length - 1}
              className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 disabled:opacity-30"><ChevronRightIcon size={20} /></button>
          </div>
        </div>
      )}

      {/* AI Panel */}
      {showAI && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => { setShowAI(false); setAiPreview(null); }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h3 className="font-black text-gray-800 flex items-center gap-2"><Sparkles size={16} className="text-indigo-600" /> AI Script Studio</h3>
              <button onClick={() => { setShowAI(false); setAiPreview(null); }}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="flex border-b">
              {[{ id: 'generate', label: 'Generate' }, { id: 'refine', label: 'Refine Current' }, { id: 'import', label: 'Import File / URL' }].map(m => (
                <button key={m.id} onClick={() => { setAiMode(m.id); setAiPreview(null); }}
                  className={`flex-1 py-2.5 text-sm font-semibold border-b-2 transition-colors ${aiMode === m.id ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                  {m.label}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              {aiPreview ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-sm font-semibold text-gray-700">{aiPreview.length} scenes generated — review below:</p>
                    <button onClick={() => setAiPreview(null)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"><RefreshCw size={12} /> Redo</button>
                  </div>
                  <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
                    {aiPreview.map((s, i) => (
                      <div key={s.id} className="border rounded-xl p-3 text-xs">
                        <div className="font-mono text-gray-400 mb-1">{i + 1}. {s.location || 'Location TBD'}</div>
                        <p className="text-gray-700"><span className="font-semibold">See:</span> {s.what_we_see || '—'}</p>
                        <p className="text-indigo-600 italic"><span className="font-semibold not-italic text-indigo-700">Hear:</span> {s.what_we_hear || '—'}</p>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={acceptAIPreview} className="flex-1 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700">Accept & Use These Scenes</button>
                    <button onClick={() => setAiPreview(null)} className="py-2 px-4 border rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
                  </div>
                </div>
              ) : (
                <div>
                  {(aiMode === 'generate' || aiMode === 'refine') && (
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">
                        {aiMode === 'generate' ? 'Describe your script...' : 'What should be changed or improved?'}
                      </label>
                      <textarea
                        value={aiPrompt}
                        onChange={e => setAiPrompt(e.target.value)}
                        placeholder={aiMode === 'generate'
                          ? '30-second Nike ad for Instagram. 4 scenes. Energetic athlete footage. Voiceover focused on "just do it" theme. Target: men 18-35.'
                          : 'Make the voiceover more conversational. Add a fourth scene with the product close-up.'}
                        className="w-full h-40 border border-gray-200 rounded-xl p-3 text-sm outline-none resize-none focus:border-indigo-400"
                      />
                      <button onClick={handleAIGenerate} disabled={aiLoading || !aiPrompt.trim()}
                        className="mt-3 w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                        {aiLoading ? <><Loader2 size={14} className="animate-spin" /> Generating...</> : <><Sparkles size={14} /> Generate Scenes</>}
                      </button>
                    </div>
                  )}
                  {aiMode === 'import' && (
                    <div className="space-y-4">
                      <div
                        className="border-2 border-dashed border-gray-200 rounded-xl p-8 text-center cursor-pointer hover:border-indigo-300 transition-colors"
                        onClick={() => importFileRef.current?.click()}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => { e.preventDefault(); setImportFile(e.dataTransfer.files[0]); }}
                      >
                        <Upload size={24} className="mx-auto mb-2 text-gray-400" />
                        <p className="text-sm font-semibold text-gray-600">{importFile ? importFile.name : 'Drop file or click to upload'}</p>
                        <p className="text-xs text-gray-400 mt-1">PDF · DOC · DOCX · PPT · PPTX</p>
                        <input ref={importFileRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.*" className="hidden" onChange={e => setImportFile(e.target.files[0])} />
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-px bg-gray-200" />
                        <span className="text-xs text-gray-400">or paste a link</span>
                        <div className="flex-1 h-px bg-gray-200" />
                      </div>
                      <input value={importUrl} onChange={e => setImportUrl(e.target.value)} placeholder="https://docs.google.com/presentation/d/..." className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
                      <button onClick={handleImport} disabled={importLoading || (!importFile && !importUrl.trim())}
                        className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                        {importLoading ? <><Loader2 size={14} className="animate-spin" /> Extracting...</> : 'Extract Script'}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Comments Panel (shared component) */}
      <CommentSidebar
        isOpen={showComments}
        comments={comments}
        scenes={scenes}
        pendingComment={pendingComment}
        commenterName={user?.name || commenterName}
        onSubmitComment={handleSubmitComment}
        onResolve={resolveComment}
        onReply={handleReplyComment}
        onClose={() => { setShowComments(false); setPendingComment(null); }}
        onChangeName={() => setShowNameModal(true)}
      />
      <NameModal
        isOpen={showNameModal}
        initialName={commenterName}
        onSave={(name) => { setCommenterName(name); setShowNameModal(false); }}
      />

      {/* Version History Panel */}
      {showVersions && (
        <div className="fixed inset-y-0 right-0 z-40 w-72 bg-white border-l border-gray-200 shadow-xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-bold text-gray-800">Version History</h3>
            <button onClick={() => setShowVersions(false)}><X size={16} className="text-gray-400" /></button>
          </div>
          <div className="p-4 border-b">
            <div className="flex gap-2">
              <input value={versionLabel} onChange={e => setVersionLabel(e.target.value)} placeholder="Version name (optional)" className="flex-1 text-xs border rounded-lg px-2 py-1.5 outline-none" />
              <button onClick={handleSaveVersion} className="px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg font-semibold">Save</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {versions.length === 0 && <p className="text-center text-sm text-gray-400 py-8">No saved versions</p>}
            {versions.map((v, i) => (
              <div key={v.id} className={`border rounded-xl p-3 ${i === 0 ? 'border-indigo-200 bg-indigo-50' : 'border-gray-100'}`}>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-600">v{v.version_number}{i === 0 ? ' (latest)' : ''}</span>
                  {i !== 0 && (
                    <button onClick={() => handleRestoreVersion(v.id)} className="text-xs text-indigo-600 hover:underline">Restore</button>
                  )}
                </div>
                {v.change_summary && <p className="text-xs text-gray-500 mt-0.5">{v.change_summary}</p>}
                <p className="text-[10px] text-gray-400 mt-1">{v.changed_by_name} · {new Date(v.created_at).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Share Modal */}
      {showShare && (
        <div className="fixed inset-0 z-40 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowShare(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-black text-gray-800">Share Script</h3>
              <button onClick={() => setShowShare(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="space-y-3 mb-6">
              {[
  { id: 'none',    label: 'Off',              desc: 'Link disabled' },
  { id: 'view',    label: 'View Only',        desc: 'Anyone with link can view but not comment' },
  { id: 'comment', label: 'View + Comment',   desc: 'Anyone with link can view and leave comments' },
  { id: 'edit',    label: 'View + Edit',      desc: 'Anyone with link can edit content' },
].map(opt => (
                <label key={opt.id} className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${shareMode === opt.id ? 'border-indigo-300 bg-indigo-50' : 'border-gray-200 hover:border-gray-300'}`}>
                  <input type="radio" checked={shareMode === opt.id} onChange={() => handleShare(opt.id)} className="accent-indigo-600" />
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{opt.label}</p>
                    <p className="text-xs text-gray-500">{opt.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            {shareToken && shareMode !== 'none' && (
              <div className="border border-gray-200 rounded-xl p-3 bg-gray-50">
                <p className="text-xs text-gray-500 mb-2">Share link</p>
                <div className="flex gap-2">
                  <input value={shareUrl} readOnly className="flex-1 text-xs bg-white border rounded-lg px-2 py-1.5 outline-none text-gray-700" />
                  <button onClick={() => { navigator.clipboard.writeText(shareUrl); }} className="px-3 py-1.5 bg-indigo-600 text-white text-xs rounded-lg font-semibold hover:bg-indigo-700">Copy</button>
                </div>
              </div>
            )}
            {sharingLoading && <div className="mt-3 flex justify-center"><Loader2 size={16} className="animate-spin text-gray-400" /></div>}
          </div>
        </div>
      )}

      {/* Image Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(null)}>
          <button onClick={() => setLightbox(null)} className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"><X size={20} /></button>
          <img src={lightbox.url} alt={lightbox.name || 'Visual'} className="max-w-full max-h-[90vh] rounded-lg shadow-2xl object-contain" onClick={e => e.stopPropagation()} />
          {lightbox.prompt && <p className="absolute bottom-6 left-1/2 -translate-x-1/2 max-w-lg text-center text-xs text-white/60 bg-black/40 rounded-xl px-3 py-1.5">{lightbox.prompt}</p>}
        </div>
      )}

      {/* ── Regenerate Image Modal ── */}
      {regenModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><RefreshCw size={16} className="text-purple-500" /> Replace Image</h3>
              <div className="flex items-center gap-1">
                <button onClick={() => { setGalleryTarget({ sceneId: regenModal.sceneId, imageId: regenModal.imageId }); setRegenModal(null); }}
                  className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
                  title="Browse all script images">
                  <ImageIcon size={12} /> Gallery
                </button>
                <button onClick={() => setRegenModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
            </div>
            <div className="space-y-3 mb-4">
              <label className="flex items-start gap-3 p-3 border-2 rounded-xl cursor-pointer transition-colors hover:border-purple-300" style={{ borderColor: regenMode === 'same' ? '#a855f7' : undefined }}>
                <input type="radio" name="regenMode" value="same" checked={regenMode === 'same'} onChange={() => setRegenMode('same')} className="mt-0.5 accent-purple-500" />
                <div>
                  <p className="text-sm font-semibold text-gray-800">Same prompt, new generation</p>
                  <p className="text-xs text-gray-500 mt-0.5">Generate a fresh image with the same visual description</p>
                </div>
              </label>
              <label className="flex items-start gap-3 p-3 border-2 rounded-xl cursor-pointer transition-colors hover:border-purple-300" style={{ borderColor: regenMode === 'edit' ? '#a855f7' : undefined }}>
                <input type="radio" name="regenMode" value="edit" checked={regenMode === 'edit'} onChange={() => setRegenMode('edit')} className="mt-0.5 accent-purple-500" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">Edit prompt</p>
                  <p className="text-xs text-gray-500 mt-0.5">Modify the description before regenerating</p>
                </div>
              </label>
              {regenMode === 'edit' && (
                <textarea
                  value={regenPrompt}
                  onChange={e => setRegenPrompt(e.target.value)}
                  className="w-full border border-gray-200 rounded-xl p-3 text-sm outline-none resize-none h-28 focus:border-purple-400 mt-2"
                  placeholder="Edit the image description..."
                />
              )}
              <label className="flex items-start gap-3 p-3 border-2 rounded-xl cursor-pointer transition-colors hover:border-purple-300" style={{ borderColor: regenMode === 'reference' ? '#a855f7' : undefined }}>
                <input type="radio" name="regenMode" value="reference" checked={regenMode === 'reference'} onChange={() => setRegenMode('reference')} className="mt-0.5 accent-purple-500" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-gray-800">With reference image</p>
                  <p className="text-xs text-gray-500 mt-0.5">Upload or link a reference image for visual guidance — consistency is preserved</p>
                </div>
              </label>
              {regenMode === 'reference' && (
                <div className="space-y-2 mt-1">
                  {regenRefPreview && (
                    <img src={regenRefPreview} alt="Reference" className="w-full h-28 object-cover rounded-xl border border-gray-200" />
                  )}
                  <button
                    onClick={() => regenRefFileRef.current?.click()}
                    className="w-full py-2 border-2 border-dashed border-gray-300 rounded-xl text-xs text-gray-500 hover:border-purple-400 hover:text-purple-600 flex items-center justify-center gap-1.5 transition-colors"
                  >
                    <Upload size={12} /> {regenRefPreview ? 'Change image' : 'Upload reference image'}
                  </button>
                  <input
                    ref={regenRefFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0]; if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const b64 = ev.target.result.split(',')[1];
                        setRegenRefBase64(b64);
                        setRegenRefMime(file.type);
                        setRegenRefPreview(ev.target.result);
                        setRegenRefUrl('');
                      };
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-[11px] text-gray-400">or paste URL</span>
                    <div className="flex-1 h-px bg-gray-200" />
                  </div>
                  <input
                    value={regenRefUrl}
                    onChange={e => { setRegenRefUrl(e.target.value); setRegenRefPreview(e.target.value); setRegenRefBase64(''); setRegenRefMime(''); }}
                    placeholder="https://example.com/reference.jpg"
                    className="w-full border border-gray-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:border-purple-400"
                  />
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setRegenModal(null)} className="flex-1 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleRegenConfirm} disabled={regenLoading || (regenMode === 'edit' && !regenPrompt.trim()) || (regenMode === 'reference' && !regenRefBase64 && !regenRefUrl)}
                className="flex-1 py-2 bg-purple-600 text-white rounded-xl text-sm font-semibold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {regenLoading ? <><Loader2 size={14} className="animate-spin" /> Generating...</> : <><RefreshCw size={14} /> Regenerate</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Format Toolbar (global, shown on text selection) ── */}
      {!readOnly && formatToolbar && (
        <FormatToolbar style={{ position: 'fixed', top: formatToolbar.top, left: formatToolbar.left }} />
      )}

      {/* ── Voice Picker Modal ── */}
      {showVoicePicker && (() => {
        const [voiceSearch, setVoiceSearch] = [voiceSearchState, setVoiceSearchState];
        const [genderFilter, setGenderFilter] = [genderFilterState, setGenderFilterState];
        const filteredVoices = accountVoices.filter(v => {
          if (voiceSearch && !v.name.toLowerCase().includes(voiceSearch.toLowerCase()) && !(v.description || '').toLowerCase().includes(voiceSearch.toLowerCase())) return false;
          if (genderFilter && v.gender && v.gender.toLowerCase() !== genderFilter) return false;
          return true;
        });
        const custom = filteredVoices.filter(v => v.category !== 'premade');
        const premade = filteredVoices.filter(v => v.category === 'premade');
        const renderVoice = (v) => (
          <div key={v.voice_id}
            className={`flex items-center gap-3 p-2.5 rounded-xl border-2 transition-all cursor-pointer ${voiceId === v.voice_id ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'}`}
            onClick={() => setVoiceId(v.voice_id)}
          >
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${voiceId === v.voice_id ? 'bg-indigo-600 text-white' : v.gender === 'male' ? 'bg-blue-100 text-blue-700' : v.gender === 'female' ? 'bg-pink-100 text-pink-700' : 'bg-gray-100 text-gray-600'}`}>
              {v.gender === 'male' ? '♂' : v.gender === 'female' ? '♀' : v.name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className={`text-sm font-bold truncate ${voiceId === v.voice_id ? 'text-indigo-800' : 'text-gray-800'}`}>{v.name}</p>
                {v.gender && <span className="text-[8px] px-1 py-0.5 rounded bg-gray-100 text-gray-500 font-semibold shrink-0">{v.gender}</span>}
              </div>
              {v.description && <p className="text-[10px] text-gray-400 truncate">{v.description}</p>}
            </div>
            <button
              onClick={e => { e.stopPropagation(); handlePreviewVoice(v.voice_id); }}
              className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 hover:bg-indigo-100 text-gray-500 hover:text-indigo-600 transition-colors shrink-0"
            >
              {previewingVoice === v.voice_id ? <Loader2 size={12} className="animate-spin" /> : <Play size={11} />}
            </button>
          </div>
        );
        return (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-gray-900 flex items-center gap-2"><Volume2 size={16} className="text-indigo-500" /> Voice Settings</h3>
                <p className="text-xs text-gray-400 mt-0.5">Pick a voice, speed, and stability</p>
              </div>
              <button onClick={() => setShowVoicePicker(false)}><X size={16} className="text-gray-400" /></button>
            </div>
            {/* Search + gender filter */}
            <div className="px-4 pt-3 pb-2 space-y-2">
              <input
                value={voiceSearch}
                onChange={e => setVoiceSearch(e.target.value)}
                placeholder="Search voices..."
                className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-xs outline-none focus:border-indigo-300"
              />
              <div className="flex gap-1">
                {[{ key: '', label: 'All' }, { key: 'male', label: '♂ Male' }, { key: 'female', label: '♀ Female' }].map(f => (
                  <button key={f.key} onClick={() => setGenderFilter(f.key)}
                    className={`text-[10px] px-2 py-1 rounded-lg font-semibold transition-colors ${genderFilter === f.key ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500 hover:bg-gray-100'}`}>
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="px-4 pb-2 space-y-1.5 max-h-60 overflow-y-auto">
              {loadingVoices ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 size={18} className="animate-spin mr-2" /> Loading voices...
                </div>
              ) : filteredVoices.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-xs">No voices match</div>
              ) : (
                <>
                  {custom.length > 0 && (
                    <>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-purple-500 px-1 pt-1">Your Voices</p>
                      {custom.map(renderVoice)}
                      {premade.length > 0 && <div className="border-t border-gray-100 my-1" />}
                    </>
                  )}
                  {premade.length > 0 && (
                    <>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-gray-400 px-1 pt-1">Premade</p>
                      {premade.map(renderVoice)}
                    </>
                  )}
                </>
              )}
            </div>
            {voicePreviewError && (
              <div className="mx-4 mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600">{voicePreviewError}</div>
            )}
            {/* Speed + Stability sliders */}
            <div className="px-4 pb-2 space-y-4 border-t border-gray-100 pt-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-700">Speed</label>
                  <span className="text-xs text-indigo-600 font-mono font-bold">
                    {voiceSpeed <= 0.7 ? '🐢 Slow' : voiceSpeed >= 1.25 ? '⚡ Fast' : '✓ Normal'} · {voiceSpeed.toFixed(2)}x
                  </span>
                </div>
                <input
                  type="range" min="0.5" max="1.5" step="0.05"
                  value={voiceSpeed}
                  onChange={e => setVoiceSpeed(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600 h-1.5 rounded-full"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                  <span>0.5x Slow</span><span>1.0x Normal</span><span>1.5x Fast</span>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-700">Stability</label>
                  <span className="text-xs text-indigo-600 font-mono font-bold">
                    {voiceStability <= 0.35 ? '🎭 Expressive' : voiceStability >= 0.7 ? '🎙️ Consistent' : '⚖️ Balanced'} · {Math.round(voiceStability * 100)}%
                  </span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={voiceStability}
                  onChange={e => setVoiceStability(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600 h-1.5 rounded-full"
                />
                <p className="text-[9px] text-gray-400 mt-1 leading-relaxed">
                  Low = more emotional, varied delivery. High = consistent, predictable tone. Use low for dramatic reads, high for narration.
                </p>
              </div>
            </div>
            <div className="px-4 pb-4 pt-2">
              <button
                onClick={async () => {
                  // Save per-script (scoped localStorage key)
                  localStorage.setItem(`cp_voice_id_${scriptId}`, voiceId);
                  localStorage.setItem(`cp_voice_speed_${scriptId}`, voiceSpeed.toString());
                  localStorage.setItem(`cp_voice_stability_${scriptId}`, voiceStability.toString());
                  // Persist to script record in DB — source of truth
                  try {
                    await fetch(`${API}/api/scripts/${scriptId}`, {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
                      body: JSON.stringify({ scenes: script.scenes, voice_settings: { voice_id: voiceId, speed: voiceSpeed, stability: voiceStability } }),
                    });
                  } catch {}
                  setShowVoicePicker(false);
                }}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700"
              >
                Save — {accountVoices.find(v => v.voice_id === voiceId)?.name || 'this voice'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ── Single Image: Storyboard vs Independent ── */}
      {singleGenPrompt && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 animate-fade-in" onClick={() => setSingleGenPrompt(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-black text-gray-900 text-sm mb-1">Generate Image</h3>
            <p className="text-xs text-gray-500 mb-4">{singleGenPrompt.info}</p>
            <div className="space-y-2">
              <button
                onClick={() => {
                  const sid = singleGenPrompt.sceneId;
                  setSingleGenPrompt(null);
                  toast.success('Generating (storyboard match)...');
                  handleImageGenerate(sid);
                }}
                className="w-full flex items-center gap-3 p-3 border-2 border-purple-200 rounded-xl hover:border-purple-400 hover:bg-purple-50 transition-colors text-left"
              >
                <Film size={18} className="text-purple-500 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-gray-800">Match Storyboard</p>
                  <p className="text-[10px] text-gray-500">Same style, colors, tone as other frames</p>
                </div>
              </button>
              <button
                onClick={() => {
                  const sid = singleGenPrompt.sceneId;
                  setSingleGenPrompt(null);
                  toast.success('Generating (independent shot)...');
                  handleImageGenerate(sid, { independent: true });
                }}
                className="w-full flex items-center gap-3 p-3 border-2 border-gray-200 rounded-xl hover:border-gray-400 hover:bg-gray-50 transition-colors text-left"
              >
                <ImageIcon size={18} className="text-gray-500 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-gray-800">Independent Shot</p>
                  <p className="text-[10px] text-gray-500">Fresh look, no continuity constraints</p>
                </div>
              </button>
            </div>
            <button onClick={() => setSingleGenPrompt(null)} className="w-full mt-3 text-xs text-gray-400 hover:text-gray-600 text-center py-1">Cancel</button>
          </div>
        </div>
      )}

      {/* ── Generate All Confirmation ── */}
      {showGenAllConfirm && (() => {
        const withoutImages = scenes.filter(s => !s.images || s.images.length === 0);
        const withImages = scenes.length - withoutImages.length;
        return (
          <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setShowGenAllConfirm(false)}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
              <h3 className="font-black text-gray-900 text-base flex items-center gap-2 mb-3">
                <Sparkles size={16} className="text-purple-500" /> Generate All Images
              </h3>
              <p className="text-sm text-gray-600 mb-4">
                {withoutImages.length > 0
                  ? <>Generate AI images for <span className="font-bold text-purple-700">{withoutImages.length} scene{withoutImages.length !== 1 ? 's' : ''}</span> without images.{withImages > 0 && <> <span className="text-gray-500">{withImages} scene{withImages !== 1 ? 's' : ''} already {withImages !== 1 ? 'have' : 'has'} images.</span></>}</>
                  : <>All {scenes.length} scenes already have images.</>
                }
              </p>
              {withImages > 0 && (
                <label className="flex items-center gap-2.5 p-3 rounded-xl border border-gray-200 hover:border-purple-300 cursor-pointer mb-4 transition-colors">
                  <input
                    type="checkbox"
                    checked={genAllIncludeExisting}
                    onChange={e => setGenAllIncludeExisting(e.target.checked)}
                    className="accent-purple-600 w-4 h-4"
                  />
                  <div>
                    <p className="text-sm font-semibold text-gray-700">Also regenerate scenes with images</p>
                    <p className="text-[11px] text-gray-400">Replaces existing images for {withImages} scene{withImages !== 1 ? 's' : ''}</p>
                  </div>
                </label>
              )}
              <div className="flex gap-2">
                <button onClick={() => setShowGenAllConfirm(false)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50 transition-colors">
                  Cancel
                </button>
                <button
                  onClick={executeGenerateAll}
                  className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 flex items-center justify-center gap-2 transition-colors"
                >
                  <Sparkles size={13} />
                  Generate {genAllIncludeExisting ? scenes.length : withoutImages.length || scenes.length} Image{(genAllIncludeExisting ? scenes.length : withoutImages.length || scenes.length) !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Split Modal ── */}
      {splitScene && (
        <SplitModal
          scene={splitScene}
          scriptId={scriptId}
          onClose={() => setSplitScene(null)}
          onApply={handleApplySplit}
        />
      )}

      {/* ── Universal Blocks Panel ── */}
      {showBlocks && (
        <UniversalBlocks
          brandId={script.brand_id || brand?.id}
          onClose={() => setShowBlocks(false)}
          selectedScenes={scenes.length > 0 ? scenes : []}
          onInsert={(blockScenes) => {
            // Insert block scenes at the end of the script
            setScript(prev => {
              const newScenes = [...prev.scenes, ...blockScenes.map((s, i) => ({
                ...s,
                order: prev.scenes.length + i,
              }))];
              const updated = { ...prev, scenes: newScenes };
              debounceSave(updated);
              return updated;
            });
            onUpdated?.({ id: scriptId });
          }}
        />
      )}

      {/* ── Image Gallery ── */}
      {galleryTarget && (
        <ImageGalleryModal
          scriptId={scriptId}
          scenes={scenes}
          targetSceneId={galleryTarget.sceneId}
          brandId={script?.brand_id || brand?.id}
          onClose={() => setGalleryTarget(null)}
          onSelect={(img) => {
            if (galleryTarget.imageId) {
              handleGalleryReplace(galleryTarget.sceneId, galleryTarget.imageId, img);
              toast.success('Image replaced');
            } else {
              // Add image to scene (not replace)
              setScript(prev => {
                const updated = { ...prev, scenes: prev.scenes.map(s => {
                  if (s.id !== galleryTarget.sceneId) return s;
                  return { ...s, images: [...(s.images || []), { id: crypto.randomUUID(), url: img.url, prompt: img.prompt || '', source: img.type || 'gallery' }] };
                })};
                debounceSave(updated);
                return updated;
              });
              toast.success('Image added');
            }
            setGalleryTarget(null);
          }}
        />
      )}

      {/* ── Video Match Modal ── */}
      {showVideoMatch && (
        <VideoMatchModal
          scriptId={scriptId}
          sceneCount={scenes.length}
          onClose={() => setShowVideoMatch(false)}
          onApplied={() => loadScript()}
        />
      )}

      {/* ── AI Chat Panel ── */}
      {showAIChat && (
        <AIChatPanel
          scriptId={scriptId}
          script={script}
          scenes={scenes}
          selectedText={aiChatSelectedText}
          selectedSceneId={aiChatSceneId}
          onClose={() => setShowAIChat(false)}
          onScriptUpdate={(updatedScenes) => {
            setScript(prev => {
              const updated = { ...prev, scenes: updatedScenes };
              debounceSave(updated);
              return updated;
            });
            onUpdated?.({ id: scriptId });
          }}
          onDuplicate={async (newTitle) => {
            try {
              const res = await fetch(`${API}/api/scripts`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
                body: JSON.stringify({
                  title: newTitle,
                  production_id: script?.production_id || null,
                  brand_id: script?.brand_id || null,
                  scenes: script?.scenes || [],
                  status: 'draft',
                }),
              });
              const newScript = await res.json();
              if (newScript.id) {
                onUpdated?.(newScript);
                toast.success(`Duplicated as "${newTitle}"`);
              }
            } catch { toast.error('Failed to duplicate'); }
          }}
        />
      )}

      {/* ── AI Image Setup Wizard ── */}
      {showImageWizard && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-gray-900 text-lg flex items-center gap-2"><Sparkles size={18} className="text-purple-500" /> Before we generate...</h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {wizardTargetSceneId === '__all__'
                    ? wizardStep === 2 ? 'Who\'s in this script?' : wizardStep === 3 ? 'What product is featured?' : 'Visual style'
                    : `Step ${wizardStep} of 4`}
                </p>
              </div>
              <button onClick={() => setShowImageWizard(false)}><X size={18} className="text-gray-400" /></button>
            </div>

            {/* Step 1 — Choice */}
            {wizardStep === 1 && (
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600 mb-4">Do you have prepared reference images, or should AI generate the storyboard frames?</p>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => { handleWizardComplete(false); }}
                    className="flex flex-col items-center gap-3 p-5 border-2 border-gray-200 rounded-2xl hover:border-gray-400 transition-colors text-left">
                    <Upload size={28} className="text-gray-500" />
                    <div>
                      <p className="text-sm font-bold text-gray-800">I have images</p>
                      <p className="text-xs text-gray-500 mt-0.5">Upload your own photos, renders, or references</p>
                    </div>
                  </button>
                  <button onClick={() => { setWizardStep(2); handleWizardExtractChars(); }}
                    className="flex flex-col items-center gap-3 p-5 border-2 border-purple-200 rounded-2xl hover:border-purple-500 transition-colors text-left bg-purple-50">
                    <Sparkles size={28} className="text-purple-500" />
                    <div>
                      <p className="text-sm font-bold text-gray-800">AI Generate</p>
                      <p className="text-xs text-gray-500 mt-0.5">Claude + Nano Banana 2 creates storyboard frames</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

            {/* Step 2 — Characters */}
            {wizardStep === 2 && (
              <div className="p-6">
                <p className="text-sm text-gray-600 mb-4">
                  {extractingChars
                    ? '✨ Reading your script...'
                    : wizardCharacters.length > 0
                      ? `We found ${wizardCharacters.length} character${wizardCharacters.length !== 1 ? 's' : ''}. Got a photo of your main actor? Drop it in — AI will keep them consistent across every scene.`
                      : 'No specific characters detected — AI will generate based on the script context.'}
                </p>
                {extractingChars ? (
                  <div className="flex justify-center py-8"><Loader2 size={24} className="animate-spin text-purple-400" /></div>
                ) : (
                  <div className="space-y-3 max-h-64 overflow-y-auto mb-4">
                    {wizardCharacters.length === 0 && <p className="text-sm text-gray-400 text-center py-4">No specific characters detected. AI will generate based on script context.</p>}
                    {wizardCharacters.map((char, i) => {
                      const photos = char.photos || (char.photoBase64 ? [{ base64: char.photoBase64, mimeType: char.photoMime, previewUrl: `data:${char.photoMime};base64,${char.photoBase64}` }] : []);
                      return (
                        <div key={i} className="p-3 border border-gray-200 rounded-xl">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-800">{char.name}</p>
                              {describingActor === i ? (
                                <p className="text-xs text-purple-500 mt-1 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Analyzing photo...</p>
                              ) : (
                                <p className="text-xs text-gray-500 mt-1 line-clamp-2">{char.description || 'No description yet'}</p>
                              )}
                            </div>
                          </div>
                          {/* Multiple photos grid */}
                          <div className="flex gap-1.5 mt-2 flex-wrap">
                            {photos.map((p, pi) => (
                              <div key={pi} className="relative">
                                <img src={p.previewUrl || `data:${p.mimeType};base64,${p.base64}`} alt="" className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
                                <button onClick={() => {
                                  setWizardCharacters(prev => prev.map((c, ci) => {
                                    if (ci !== i) return c;
                                    const newPhotos = (c.photos || []).filter((_, ppi) => ppi !== pi);
                                    return { ...c, photos: newPhotos, photoBase64: newPhotos[0]?.base64 || null, photoMime: newPhotos[0]?.mimeType || null };
                                  }));
                                }} className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[8px]">×</button>
                              </div>
                            ))}
                            {photos.length < 3 && (
                              <button
                                onClick={() => { setActorPhotoTarget(i); actorPhotoRef.current?.click(); }}
                                className="w-12 h-12 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:border-purple-300 hover:text-purple-400 transition-colors"
                              >
                                <Upload size={12} />
                              </button>
                            )}
                          </div>
                          {photos.length > 0 && <p className="text-[9px] text-purple-500 mt-1">Photos sent as 1:1 visual reference to AI</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
                <input ref={actorPhotoRef} type="file" accept="image/*" multiple className="hidden" onChange={e => { if (actorPhotoTarget !== null) handleActorPhotoUpload(e, actorPhotoTarget); e.target.value = ''; setActorPhotoTarget(null); }} />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => setWizardStep(1)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Back</button>
                  <button onClick={() => setWizardStep(3)} className="flex-1 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700">
                    Continue →
                  </button>
                </div>
              </div>
            )}

            {/* Step 3 — Product */}
            {wizardStep === 3 && (
              <div className="p-6">
                <p className="text-sm text-gray-600 mb-4">
                  {detectingProduct
                    ? '✨ Detecting the product from your script...'
                    : wizardProductName
                      ? `We think this script is about "${wizardProductName}". Drop in a product photo and AI will place it exactly right in every frame.`
                      : 'Is there a specific product in this script — like a cream, gadget, or drink? Add a photo and AI will keep it pixel-perfect across scenes.'}
                </p>

                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">
                    Product Name
                    <span className="font-normal text-gray-400 ml-1">— type it exactly as it appears in the script</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={wizardProductName}
                      onChange={e => setWizardProductName(e.target.value)}
                      placeholder="e.g. Particle Anti-Gray Serum, Nike Air Max, iPhone 15..."
                      className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-300"
                    />
                    <button
                      onClick={async () => {
                        setDetectingProduct(true);
                        try {
                          const res = await fetch(`${API}/api/scripts/${scriptId}/extract-product`, {
                            method: 'POST', headers: { Authorization: `Bearer ${jwt()}` }
                          });
                          const data = await res.json();
                          if (data.product_name) setWizardProductName(data.product_name);
                        } catch {}
                        setDetectingProduct(false);
                      }}
                      disabled={detectingProduct}
                      className="flex items-center gap-1 px-3 py-2 text-xs bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200 transition-colors disabled:opacity-50"
                    >
                      {detectingProduct ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
                      Auto-detect
                    </button>
                  </div>
                </div>

                {wizardProductName.trim() && (
                  <div className="mb-4">
                    <label className="block text-xs font-semibold text-gray-500 mb-2">
                      Product Photos <span className="font-normal text-gray-400">(up to 3, for visual consistency)</span>
                    </label>
                    <div className="flex gap-2 flex-wrap">
                      {wizardProductPhotos.map((photo, i) => (
                        <div key={i} className="relative">
                          <img src={photo.previewUrl} alt="Product" className="w-20 h-20 object-cover rounded-xl border border-gray-200" />
                          <button
                            onClick={() => setWizardProductPhotos(prev => prev.filter((_, pi) => pi !== i))}
                            className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px]"
                          >×</button>
                        </div>
                      ))}
                      {wizardProductPhotos.length < 3 && (
                        <button
                          onClick={() => productPhotoRef.current?.click()}
                          className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 hover:border-purple-300 hover:text-purple-400 transition-colors gap-1"
                        >
                          <Upload size={16} />
                          <span className="text-[10px]">Upload</span>
                        </button>
                      )}
                    </div>
                    <input
                      ref={productPhotoRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = async (ev) => {
                          const dataUrl = ev.target.result;
                          const rawBase64 = dataUrl.split(',')[1];
                          const mime = file.type || 'image/jpeg';
                          // Resize to 800px max to prevent localStorage quota issues
                          const resized = await resizeImageBase64(rawBase64, mime, 800);
                          setWizardProductPhotos(prev => [...prev, {
                            base64: resized,
                            mimeType: mime,
                            previewUrl: `data:${mime};base64,${resized}`,
                          }]);
                        };
                        reader.readAsDataURL(file);
                        e.target.value = '';
                      }}
                    />
                    <p className="text-[11px] text-gray-400 mt-2">
                      AI will keep the product exactly as it looks — same shape, color, and packaging — in every scene.
                    </p>
                  </div>
                )}

                {!wizardProductName.trim() && !detectingProduct && (
                  <div className="mb-4 p-3 bg-gray-50 rounded-xl text-xs text-gray-500 text-center">
                    No product in this script? Just leave it empty and continue.
                  </div>
                )}

                <div className="flex gap-2">
                  <button onClick={() => setWizardStep(2)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Back</button>
                  <button onClick={() => setWizardStep(4)} className="flex-1 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700">
                    Continue →
                  </button>
                </div>
              </div>
            )}

            {/* Step 4 — Visual Style + Reference Images */}
            {wizardStep === 4 && (
              <div className="p-6">
                <p className="text-sm text-gray-600 mb-3">Describe the visual style for this storyboard (optional). This applies to all generated images.</p>
                <textarea
                  value={wizardStyleNotes}
                  onChange={e => setWizardStyleNotes(e.target.value)}
                  placeholder="e.g. Cinematic, high-contrast, warm golden hour lighting. Urban setting. Nike campaign aesthetic. Clean and powerful."
                  className="w-full border border-gray-200 rounded-xl p-3 text-sm outline-none resize-none h-24 focus:border-purple-400 mb-4"
                />

                {/* Reference Images */}
                <div className="mb-4">
                  <label className="block text-xs font-semibold text-gray-500 mb-2">
                    Reference Images <span className="font-normal text-gray-400">(up to 5 — mood boards, stills, style refs)</span>
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {wizardRefImages.map((img, i) => (
                      <div key={i} className="relative">
                        <img src={img.previewUrl} alt="Reference" className="w-16 h-16 object-cover rounded-xl border border-gray-200" />
                        <button
                          onClick={() => setWizardRefImages(prev => prev.filter((_, pi) => pi !== i))}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px]"
                        >×</button>
                      </div>
                    ))}
                    {wizardRefImages.length < 5 && (
                      <button
                        onClick={() => wizardRefImageRef.current?.click()}
                        className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 hover:border-purple-300 hover:text-purple-400 transition-colors gap-0.5"
                      >
                        <Upload size={14} />
                        <span className="text-[9px]">Add</span>
                      </button>
                    )}
                  </div>
                  <input
                    ref={wizardRefImageRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={e => {
                      const files = Array.from(e.target.files || []);
                      files.slice(0, 5 - wizardRefImages.length).forEach(file => {
                        const reader = new FileReader();
                        reader.onload = ev => {
                          const dataUrl = ev.target.result;
                          setWizardRefImages(prev => prev.length < 5 ? [...prev, {
                            base64: dataUrl.split(',')[1],
                            mimeType: file.type || 'image/jpeg',
                            previewUrl: dataUrl,
                          }] : prev);
                        };
                        reader.readAsDataURL(file);
                      });
                      e.target.value = '';
                    }}
                  />
                  <p className="text-[11px] text-gray-400 mt-1.5">
                    These images guide the AI's visual composition and mood — they're used as style references, not identity-locked.
                  </p>
                </div>

                <div className="flex gap-2">
                  <button onClick={() => setWizardStep(3)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Back</button>
                  <button onClick={() => handleWizardComplete(true)}
                    disabled={generatingAll}
                    className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                    <Sparkles size={14} />
                    {wizardTargetSceneId === '__all__'
                      ? `Generate All (${scenes.filter(s => !s.images || s.images.length === 0).length || scenes.length} scenes)`
                      : wizardTargetSceneId ? 'Generate Image' : 'Save Settings'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

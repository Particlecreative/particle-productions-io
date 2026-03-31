import { useState, useEffect, useRef, useCallback } from 'react';
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
  Image as ImageIcon, Wand2, CheckCircle, Clock,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import clsx from 'clsx';

const API = import.meta.env.VITE_API_URL || '';

function jwt() { return localStorage.getItem('cp_auth_token'); }

// ── VO duration estimate (word count at 130 WPM) ─────────────────────────────
const VO_WPM = 130;
function stripStageDirections(text) {
  return (text || '').replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ').trim();
}
function estimateSeconds(text) {
  const clean = stripStageDirections(text?.replace ? text.replace(/<[^>]*>/g, ' ') : '');
  if (!clean.trim()) return 0;
  return Math.round((clean.trim().split(/\s+/).length / VO_WPM) * 60);
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

// ── Rich text cell (contentEditable with formatting) ─────────────────────────
function RichTextCell({ value, onChange, placeholder, readOnly, className, onMouseUp }) {
  const ref = useRef(null);
  const isFocused = useRef(false);
  const lastHtml = useRef(value || '');

  // Mount: set initial HTML
  useEffect(() => {
    if (ref.current) {
      ref.current.innerHTML = value || '';
    }
  }, []); // mount only

  // Sync from parent when NOT focused (e.g. scene reloaded from server)
  useEffect(() => {
    if (ref.current && !isFocused.current && value !== lastHtml.current) {
      ref.current.innerHTML = value || '';
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
    </div>
  );
}

// ── SortableSceneRow ──────────────────────────────────────────────────────────
function SortableSceneRow({ scene, index, visibleCols, onUpdate, onDelete, onDuplicate, onAddScene, commentCount, onCommentClick, onImageUpload, onImageDelete, onImageGenerate, onRegenImage, onRequestAIImage, onLightbox, readOnly, isLastRow, onPlayTTS, isPlaying, onSmartSplit, suggestingShots }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: scene.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };

  const [collapsed, setCollapsed] = useState(scene.collapsed || false);
  const [generatingImg, setGeneratingImg] = useState(false);
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
    <tr ref={setNodeRef} style={style} className="border-b border-gray-100 hover:bg-gray-50/50 group align-top">
      {/* Drag handle */}
      <td className="w-6 px-1 pt-3">
        {!readOnly && (
          <button {...attributes} {...listeners} className="cursor-grab opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-gray-500 touch-none">
            <GripVertical size={14} />
          </button>
        )}
      </td>

      {/* Scene # + collapse */}
      <td className="w-12 px-2 pt-3 text-center">
        <div className="flex flex-col items-center gap-1">
          <button onClick={() => setCollapsed(c => { const v = !c; onUpdate(scene.id, 'collapsed', v); return v; })}
            className="text-gray-400 hover:text-gray-600">
            {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
          </button>
          <span className="text-xs font-bold text-gray-500">{index}</span>
        </div>
      </td>

      {/* Location */}
      {visibleCols.location && (
        <td className="w-40 px-2 py-2 align-top">
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
        <td className="px-2 py-2 align-top">
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
        <td className="px-2 py-2 align-top">
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

      {/* Visuals */}
      {visibleCols.visuals && (
        <td className="w-56 px-2 py-2 align-top">
          <div className="flex flex-wrap gap-1.5">
            {(scene.images || []).map(img => (
              <div key={img.id} className="relative group/img">
                {/* Hover preview — large popup */}
                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none opacity-0 group-hover/img:opacity-100 transition-opacity duration-150 delay-300">
                  <div className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden" style={{width: 320}}>
                    <img src={img.url} alt={img.prompt || 'Visual'} className="w-full object-cover" style={{maxHeight: 240}} />
                    {img.prompt && <p className="text-[10px] text-gray-500 px-2 py-1.5 leading-snug line-clamp-2">{img.prompt}</p>}
                  </div>
                  {/* Arrow */}
                  <div className="w-3 h-3 bg-white border-b border-r border-gray-200 rotate-45 mx-auto -mt-1.5 shadow-sm" />
                </div>
                <img
                  src={img.url}
                  alt={img.prompt || 'Visual'}
                  className="h-16 w-24 object-cover rounded-md border border-gray-200 cursor-pointer"
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
            {!readOnly && !collapsed && (
              <div className="flex flex-col gap-1">
                <button
                  onClick={() => fileRef.current?.click()}
                  className="h-16 w-24 rounded-md border-2 border-dashed border-gray-200 flex flex-col items-center justify-center gap-1 text-gray-400 hover:border-indigo-300 hover:text-indigo-500 transition-colors text-xs"
                >
                  <Upload size={14} />
                  Upload
                </button>
                <div className="relative flex items-center gap-0.5">
                  <button
                    onClick={() => onRequestAIImage(scene.id)}
                    disabled={generatingImg || suggestingShots === scene.id}
                    className="flex items-center gap-1 text-[10px] text-purple-500 hover:text-purple-700 px-1 disabled:opacity-50"
                    title="Generate one AI storyboard image"
                  >
                    {(generatingImg || suggestingShots === scene.id) ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                    {suggestingShots === scene.id ? 'Splitting...' : generatingImg ? 'Generating...' : (scene.images || []).length > 0 ? '+ Shot' : '✨ AI'}
                  </button>
                  <button
                    onClick={() => onSmartSplit(scene.id)}
                    disabled={generatingImg || !!suggestingShots}
                    className="flex items-center gap-0.5 text-[9px] text-purple-400 hover:text-purple-600 px-1 disabled:opacity-50 border-l border-purple-100"
                    title="Smart split: AI breaks scene into multiple shots automatically"
                  >
                    <Film size={9} /> Split
                  </button>
                </div>
                {(scene.images || []).length > 1 && (
                  <span className="text-[9px] font-mono text-gray-400 px-1">{(scene.images || []).length} shots</span>
                )}
              </div>
            )}
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
}

// ── Main StoryboardEditor ─────────────────────────────────────────────────────
export default function StoryboardEditor({ scriptId, readOnly = false, onBack, onDeleted, onUpdated, defaultProductionId, defaultBrandId }) {
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
  const [newCommentText, setNewCommentText] = useState('');
  const [commenterName, setCommenterName] = useState(() => localStorage.getItem('cp_commenter_name') || '');
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

  // ── Voice picker & settings ──
  const [voiceId, setVoiceId] = useState(() => localStorage.getItem('cp_voice_id') || '21m00Tcm4TlvDq8ikWAM');
  const [voiceSpeed, setVoiceSpeed] = useState(() => parseFloat(localStorage.getItem('cp_voice_speed') || '1.0'));
  const [voiceStability, setVoiceStability] = useState(() => parseFloat(localStorage.getItem('cp_voice_stability') || '0.5'));
  const [showVoicePicker, setShowVoicePicker] = useState(false);
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
        body: JSON.stringify({ scenes: updatedScript.scenes, title: updatedScript.title }),
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

  const handleImageGenerate = async (sceneId) => {
    const charProfiles = getCharProfiles();
    const styleNotes = localStorage.getItem(`script_style_${scriptId}`) || '';
    const productName = localStorage.getItem(`script_product_name_${scriptId}`) || '';
    let productPhotos = [];
    try { productPhotos = JSON.parse(localStorage.getItem(`script_product_photos_${scriptId}`) || '[]'); } catch {}
    let charPhotos = [];
    try { charPhotos = JSON.parse(localStorage.getItem(`script_char_photos_${scriptId}`) || '[]'); } catch {}

    const body = {
      scene_id: sceneId,
      character_profiles: charProfiles.length > 0 ? charProfiles : undefined,
      style_notes: styleNotes || undefined,
      product_info: productName ? { name: productName, photos: productPhotos } : undefined,
      character_photos: charPhotos.length > 0 ? charPhotos : undefined,
    };

    const res = await fetch(`${API}/api/scripts/${scriptId}/ai-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.url) {
      await loadScript();
      // Notify parent so list badges (scene count etc.) stay in sync
      onUpdated?.({ id: scriptId });
    } else {
      alert(data.error || 'Image generation failed');
    }
  };

  const handleSmartSplit = async (sceneId) => {
    setSuggestingShots(sceneId);
    setSmartSplitScene(null);
    try {
      const res = await fetch(`${API}/api/scripts/${scriptId}/suggest-shots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        body: JSON.stringify({ scene_id: sceneId }),
      });
      const data = await res.json();
      const shots = data.shots || [];
      // Generate one image per shot, sequentially
      for (const shot of shots) {
        const charProfiles = getCharProfiles();
        const styleNotes = localStorage.getItem(`script_style_${scriptId}`) || '';
        const productName = localStorage.getItem(`script_product_name_${scriptId}`) || '';
        let productPhotos = [];
        try { productPhotos = JSON.parse(localStorage.getItem(`script_product_photos_${scriptId}`) || '[]'); } catch {}
        let charPhotos = [];
        try { charPhotos = JSON.parse(localStorage.getItem(`script_char_photos_${scriptId}`) || '[]'); } catch {}

        await fetch(`${API}/api/scripts/${scriptId}/ai-image`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
          body: JSON.stringify({
            scene_id: sceneId,
            prompt: shot.description,
            character_profiles: charProfiles.length > 0 ? charProfiles : undefined,
            character_photos: charPhotos.length > 0 ? charPhotos : undefined,
            style_notes: styleNotes || undefined,
            product_info: productName ? { name: productName, photos: productPhotos } : undefined,
          }),
        });
        await loadScript(); // refresh after each shot
      }
    } catch (e) {
      alert('Smart split failed: ' + e.message);
    }
    setSuggestingShots(null);
  };

  const handleCommentClick = (info) => {
    setPendingComment(info);
    setShowComments(true);
    loadComments();
  };

  const submitComment = async () => {
    if (!newCommentText.trim()) return;
    // If no auth token and no name entered, prompt for name
    const token = jwt();
    if (!token && !commenterName.trim()) {
      alert('Please enter your name before commenting.');
      return;
    }
    if (commenterName.trim()) localStorage.setItem('cp_commenter_name', commenterName.trim());
    await fetch(`${API}/api/scripts/${scriptId}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({ ...pendingComment, text: newCommentText, author_name: commenterName.trim() || undefined }),
    });
    setNewCommentText('');
    setPendingComment(null);
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
    else { alert(data.error || 'AI generation failed'); }
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
    else { alert(data.error || 'Import failed'); }
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
    if (data.id) { setScript(data); alert('Script approved! Saved to Drive.'); }
    else { alert(data.error || 'Approval failed'); }
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
      if (!data.audio_base64) { alert(data.error || 'TTS failed'); setPlayingSceneId(null); return; }
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
      console.error('TTS error:', e);
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

  const handleDownloadFullVO = async () => {
    if (downloadingFullVO) return;
    setDownloadingFullVO(true);
    try {
      const res = await fetch(`${API}/api/scripts/${scriptId}/tts-full`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        body: JSON.stringify({ voice_id: voiceId, speed: voiceSpeed, stability: voiceStability, similarity_boost: 0.75 }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error || `Download failed (${res.status})`);
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `${(script.title || 'script').replace(/\s+/g, '_')}_vo.mp3`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('Download error: ' + e.message); }
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
    // Check if setup was already done for this script
    const existing = getCharProfiles();
    const wizardDone = localStorage.getItem(`script_wizard_${scriptId}`);
    if (wizardDone || existing.length > 0) {
      // Already set up — go straight to generation
      handleImageGenerate(sceneId);
    } else {
      // Show setup wizard
      setWizardTargetSceneId(sceneId);
      setWizardStep(1);
      setWizardProductName('');
      setWizardProductPhotos([]);
      setShowImageWizard(true);
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
    } catch (e) { console.warn('Character extraction failed:', e); }
    setExtractingChars(false);
  };

  const handleActorPhotoUpload = async (e, charIndex) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result;
      const base64 = dataUrl.split(',')[1];
      const mimeType = file.type || 'image/jpeg';
      // Update state with photo
      setWizardCharacters(prev => prev.map((c, i) => i === charIndex ? { ...c, photoBase64: base64, photoMime: mimeType } : c));
      // Ask Claude to describe the actor
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
      } catch (e) { console.warn('Actor description failed:', e); }
      setDescribingActor(null);
    };
    reader.readAsDataURL(file);
  };

  const handleWizardComplete = (proceedWithAI) => {
    if (!proceedWithAI) {
      // User has their own images — close wizard and open file upload
      localStorage.setItem(`script_wizard_${scriptId}`, 'done');
      setShowImageWizard(false);
      return;
    }
    // Save character profiles
    const profiles = wizardCharacters.filter(c => c.description).map(c => ({ name: c.name, description: c.description }));
    saveCharProfiles(profiles);
    // Save character photos separately for image generation
    const charPhotos = wizardCharacters.filter(c => c.photoBase64).map(c => ({ name: c.name, base64: c.photoBase64, mimeType: c.photoMime || 'image/jpeg' }));
    if (charPhotos.length > 0) localStorage.setItem(`script_char_photos_${scriptId}`, JSON.stringify(charPhotos));
    if (wizardStyleNotes.trim()) localStorage.setItem(`script_style_${scriptId}`, wizardStyleNotes.trim());
    if (wizardProductName.trim()) localStorage.setItem(`script_product_name_${scriptId}`, wizardProductName.trim());
    const productPhotosToSave = wizardProductPhotos.slice(0, 3).map(p => ({ base64: p.base64, mimeType: p.mimeType }));
    if (productPhotosToSave.length > 0) localStorage.setItem(`script_product_photos_${scriptId}`, JSON.stringify(productPhotosToSave));
    localStorage.setItem(`script_wizard_${scriptId}`, 'done');
    setShowImageWizard(false);

    // Generate for target scene(s)
    if (wizardTargetSceneId === '__all__') {
      handleGenerateAll(true);
    } else if (wizardTargetSceneId) {
      handleImageGenerate(wizardTargetSceneId);
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

      setWizardTargetSceneId('__all__');
      setWizardStep(2);
      setWizardProductName(existingProduct);
      setWizardProductPhotos(existingPhotos);
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

    const scenesWithoutImages = scenes.filter(s => !s.images || s.images.length === 0);
    if (scenesWithoutImages.length === 0) {
      alert('All scenes already have images.');
      return;
    }

    if (!confirm(`Generate AI images for ${scenesWithoutImages.length} scene${scenesWithoutImages.length !== 1 ? 's' : ''}? This may take a minute.`)) return;

    setGeneratingAll(true);
    setGenerateAllProgress({ current: 0, total: scenesWithoutImages.length });

    for (let i = 0; i < scenesWithoutImages.length; i++) {
      setGenerateAllProgress({ current: i + 1, total: scenesWithoutImages.length });
      try {
        await handleImageGenerate(scenesWithoutImages[i].id);
      } catch (e) {
        console.warn(`Failed to generate image for scene ${i + 1}:`, e);
      }
      if (i < scenesWithoutImages.length - 1) await new Promise(r => setTimeout(r, 1500));
    }

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
    else alert(data.error || 'Regeneration failed');
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

  // ── Commercial timing (speed-adjusted) ──
  const rawVoSeconds = scenes.reduce((sum, s) => sum + estimateSeconds(stripHtml(s.what_we_hear)), 0);
  const totalVoSeconds = Math.round(rawVoSeconds / voiceSpeed);

  // Build cumulative timecode map for each scene
  const sceneTimecodes = {};
  let cumulative = 0;
  for (const s of scenes) {
    const dur = sceneDurations[s.id]
      ? Math.round(sceneDurations[s.id] / voiceSpeed)
      : Math.round(estimateSeconds(stripHtml(s.what_we_hear)) / voiceSpeed);
    sceneTimecodes[s.id] = { start: cumulative, end: cumulative + dur, isActual: !!sceneDurations[s.id] };
    cumulative += dur;
  }

  const targetSeconds = parseInt(commercialTarget) || 30;
  const timingRatio = totalVoSeconds / targetSeconds;
  const timingColor = timingRatio <= 0.9 ? 'text-gray-500' : timingRatio <= 1.05 ? 'text-green-600' : timingRatio <= 1.2 ? 'text-amber-600' : 'text-red-600';
  const barColor = timingRatio <= 0.9 ? 'bg-gray-300' : timingRatio <= 1.05 ? 'bg-green-500' : timingRatio <= 1.2 ? 'bg-amber-500' : 'bg-red-500';

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
          <input
            value={script.title}
            onChange={e => { setScript(p => ({ ...p, title: e.target.value })); debounceSave({ ...script, title: e.target.value }); }}
            readOnly={readOnly}
            className="flex-1 text-lg font-black text-gray-900 bg-transparent border-0 outline-none"
            placeholder="Untitled Script"
          />
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

        {/* ── Commercial timing bar ── */}
        {totalVoSeconds > 0 && (
          <div className="flex items-center gap-2 mb-2 scripts-no-print">
            <Clock size={11} className="text-gray-400 shrink-0" />
            <div className="flex-1 bg-gray-100 rounded-full h-1.5 relative overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${barColor}`}
                style={{ width: `${Math.min(timingRatio * 100, 100)}%` }}
              />
              {/* Target marker at 100% */}
              <div className="absolute right-0 top-0 h-full w-px bg-gray-400 opacity-50" />
            </div>
            <span className={`text-[11px] font-mono font-semibold shrink-0 ${timingColor}`}>
              {fmtSeconds(totalVoSeconds)}
            </span>
            <span className="text-[11px] text-gray-400 shrink-0">/ target:</span>
            <button
              onClick={() => { setShowVoicePicker(true); setVoicePreviewError(null); loadAccountVoices(); }}
              className="shrink-0 flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-indigo-50 border border-indigo-200 text-indigo-600 hover:bg-indigo-100 transition-colors font-semibold"
              title="Voice settings — speed, stability"
            >
              <Volume2 size={10} />
              {accountVoices.find(v => v.voice_id === voiceId)?.name || 'Voice'}
              {voiceSpeed !== 1.0 && <span className="text-[9px] opacity-70">{voiceSpeed}x</span>}
            </button>
            <div className="flex items-center gap-0.5 bg-gray-100 rounded-md p-0.5 shrink-0">
              {['30', '60'].map(t => (
                <button
                  key={t}
                  onClick={() => { setCommercialTarget(t); localStorage.setItem(`script_target_${scriptId}`, t); }}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-semibold transition-colors ${commercialTarget === t ? 'bg-white shadow-sm text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
                >
                  {t}s
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          {/* View toggle */}
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

          <div className="flex-1" />

          {/* Action buttons */}
          {!readOnly && (
            <>
              <button onClick={() => { setShowAI(true); setAiMode('generate'); setAiPreview(null); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors">
                <Sparkles size={12} /> AI
              </button>
              {scenes.some(s => !s.images || s.images.length === 0) && (
                <button onClick={() => handleGenerateAll()} disabled={generatingAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 transition-colors">
                  {generatingAll
                    ? <><Loader2 size={12} className="animate-spin" /> {generateAllProgress.current}/{generateAllProgress.total}</>
                    : <><ImageIcon size={12} /> Generate All ({scenes.filter(s => !s.images || s.images.length === 0).length})</>
                  }
                </button>
              )}
              <button onClick={() => { setShowComments(true); loadComments(); }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${openCommentCount > 0 ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                <MessageSquare size={12} /> {openCommentCount > 0 ? openCommentCount : 'Comments'}
              </button>
              <button onClick={() => { setShowVersions(true); loadVersions(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                <History size={12} /> History
              </button>
              <button onClick={() => setShowShare(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                <Share2 size={12} /> Share
              </button>
              {script.status !== 'approved' && (
                <button onClick={handleApprove} disabled={approvingLoading}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {approvingLoading ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />} Approve
                </button>
              )}
              {script.drive_url && (
                <a href={script.drive_url} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-green-600 hover:bg-green-50 transition-colors border border-green-200">
                  <ExternalLink size={11} /> Drive
                </a>
              )}
            </>
          )}
          <button onClick={() => setPresentMode(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
            <Play size={12} /> Present
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 transition-colors scripts-no-print">
            <Download size={12} />
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
                    alert('AI image setup reset. Next time you generate an image, the wizard will run again.');
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

      {/* ── Generate All Images banner ── */}
      {!readOnly && scenes.length > 0 && scenes.every(s => !s.images || s.images.length === 0) && !generatingAll && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-purple-50 border border-purple-200 flex items-center gap-3 scripts-no-print">
          <Sparkles size={16} className="text-purple-500 shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-purple-800">No storyboard images yet</p>
            <p className="text-xs text-purple-600">Generate AI images for all {scenes.length} scenes at once</p>
          </div>
          <button onClick={handleGenerateAll} className="shrink-0 px-3 py-1.5 bg-purple-600 text-white text-xs font-bold rounded-lg hover:bg-purple-700 transition-colors">
            Generate All
          </button>
        </div>
      )}
      {generatingAll && (
        <div className="mx-4 mt-3 p-3 rounded-xl bg-purple-50 border border-purple-200 flex items-center gap-3 scripts-no-print">
          <Loader2 size={16} className="text-purple-500 animate-spin shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-purple-800">Generating storyboard images...</p>
            <div className="mt-1.5 h-1.5 bg-purple-200 rounded-full overflow-hidden">
              <div className="h-full bg-purple-500 rounded-full transition-all" style={{ width: `${generateAllProgress.total > 0 ? (generateAllProgress.current / generateAllProgress.total) * 100 : 0}%` }} />
            </div>
          </div>
          <span className="text-xs font-mono text-purple-700">{generateAllProgress.current}/{generateAllProgress.total}</span>
        </div>
      )}

      {/* ── Content ── */}
      <div className="flex-1 overflow-auto">

        {/* Table View */}
        {activeView === 'table' && (
          <div className="overflow-x-auto scripts-printable" style={{ WebkitOverflowScrolling: 'touch' }}>
            <table className="w-full border-collapse min-w-[700px] scripts-table">
              <thead className="sticky top-0 z-10 bg-gray-50">
                <tr className="text-xs font-semibold text-gray-400 uppercase tracking-wider border-b border-gray-200">
                  <th className="w-6" />
                  <th className="w-12 px-2 py-2 text-center">#</th>
                  {visibleCols.location && <th className="w-40 px-2 py-2 text-left">Location</th>}
                  {visibleCols.what_we_see && <th className="px-2 py-2 text-left">What We See</th>}
                  {visibleCols.what_we_hear && <th className="px-2 py-2 text-left">What We Hear</th>}
                  {visibleCols.duration && <th className="w-20 px-2 py-2 text-left">Duration</th>}
                  {visibleCols.visuals && <th className="w-56 px-2 py-2 text-left">Visuals</th>}
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
                        readOnly={readOnly}
                        onPlayTTS={handlePlayTTS}
                        isPlaying={playingSceneId === scene.id}
                        onSmartSplit={handleSmartSplit}
                        suggestingShots={suggestingShots}
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
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400">Audio / Voiceover Script</h3>
              <div className="flex items-center gap-3">
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
              return (
                <div key={scene.id} className="mb-6 pb-6 border-b border-gray-100 last:border-0">
                  <div className="flex items-baseline gap-3 mb-2">
                    <span className="text-xs font-bold text-gray-400 w-5">{idx + 1}</span>
                    {scene.location && <span className="text-xs font-mono text-gray-400">{scene.location}</span>}
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
                      ? (scene.what_we_hear || '').replace(/<[^>]*>/g, '').split(/(\[[^\]]*\]|\([^)]*\))/g).map((part, i) =>
                          /^[\[(]/.test(part)
                            ? <span key={i} className="text-gray-400 italic text-xs">{part}</span>
                            : part
                        )
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

      {/* Comments Panel */}
      {showComments && (
        <div className="fixed inset-y-0 right-0 z-40 w-80 bg-white border-l border-gray-200 shadow-xl flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h3 className="font-bold text-gray-800">Comments</h3>
            <button onClick={() => setShowComments(false)}><X size={16} className="text-gray-400" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {pendingComment && (
              <div className="border border-amber-200 rounded-xl p-3 bg-amber-50">
                {pendingComment.selected_text && <p className="text-xs text-amber-700 italic mb-2">"{pendingComment.selected_text}"</p>}
                {!jwt() && (
                  <input
                    value={commenterName}
                    onChange={e => setCommenterName(e.target.value)}
                    placeholder="Your name *"
                    className="w-full text-sm border border-amber-200 rounded-lg px-2 py-1.5 outline-none mb-2 bg-white"
                  />
                )}
                <textarea value={newCommentText} onChange={e => setNewCommentText(e.target.value)} placeholder="Add comment..." className="w-full text-sm border border-amber-200 rounded-lg p-2 outline-none resize-none h-20" />
                <div className="flex gap-2 mt-2">
                  <button onClick={submitComment} className="flex-1 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold">Submit</button>
                  <button onClick={() => setPendingComment(null)} className="py-1.5 px-3 border rounded-lg text-xs text-gray-500">Cancel</button>
                </div>
              </div>
            )}
            {comments.length === 0 && !pendingComment && (
              <p className="text-center text-sm text-gray-400 py-8">No comments yet</p>
            )}
            {scenes.map(scene => {
              const sceneComments = comments.filter(c => c.scene_id === scene.id && c.status === 'open');
              if (!sceneComments.length) return null;
              return (
                <div key={scene.id}>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-2">{scene.location || `Scene ${scenes.indexOf(scene) + 1}`}</p>
                  {sceneComments.map(c => (
                    <div key={c.id} className="border border-gray-100 rounded-xl p-3 mb-2">
                      {c.selected_text && <p className="text-xs text-amber-700 italic border-l-2 border-amber-300 pl-2 mb-2">{c.selected_text}</p>}
                      <p className="text-sm text-gray-700">{c.text}</p>
                      <div className="flex items-center justify-between mt-2">
                        <span className="text-xs text-gray-400">{c.author_name} · {new Date(c.created_at).toLocaleDateString()}</span>
                        <div className="flex gap-1">
                          <button onClick={() => resolveComment(c.id, 'resolved')} className="text-xs text-green-600 hover:underline">Resolve</button>
                          <button onClick={() => resolveComment(c.id, 'ignored')} className="text-xs text-gray-400 hover:underline ml-1">Ignore</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          {!pendingComment && !readOnly && (
            <div className="p-4 border-t">
              <button onClick={() => setPendingComment({ scene_id: null })} className="w-full py-2 text-sm text-indigo-600 border border-indigo-200 rounded-xl hover:bg-indigo-50">
                + Add general comment
              </button>
            </div>
          )}
        </div>
      )}

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
              <h3 className="font-bold text-gray-900 flex items-center gap-2"><RefreshCw size={16} className="text-purple-500" /> Regenerate Image</h3>
              <button onClick={() => setRegenModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
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
      {showVoicePicker && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="font-black text-gray-900 flex items-center gap-2"><Volume2 size={16} className="text-indigo-500" /> Voice Settings</h3>
                <p className="text-xs text-gray-400 mt-0.5">Pick a voice, speed, and style for VO preview</p>
              </div>
              <button onClick={() => setShowVoicePicker(false)}><X size={16} className="text-gray-400" /></button>
            </div>
            <div className="p-4 space-y-2 max-h-72 overflow-y-auto">
              {loadingVoices ? (
                <div className="flex items-center justify-center py-8 text-gray-400">
                  <Loader2 size={18} className="animate-spin mr-2" /> Loading your voices...
                </div>
              ) : accountVoices.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-sm">No voices loaded</div>
              ) : (() => {
                const custom = accountVoices.filter(v => v.category !== 'premade');
                const premade = accountVoices.filter(v => v.category === 'premade');
                const renderVoice = (v) => (
                  <div key={v.voice_id}
                    className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all cursor-pointer ${voiceId === v.voice_id ? 'border-indigo-400 bg-indigo-50' : 'border-gray-100 hover:border-gray-200'}`}
                    onClick={() => setVoiceId(v.voice_id)}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${voiceId === v.voice_id ? 'bg-indigo-600 text-white' : v.category === 'cloned' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'}`}>
                      {v.gender ? v.gender.charAt(0).toUpperCase() : v.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-bold truncate ${voiceId === v.voice_id ? 'text-indigo-800' : 'text-gray-800'}`}>{v.name}</p>
                      {v.description && <p className="text-xs text-gray-400 truncate">{v.description}</p>}
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
                  <>
                    {custom.length > 0 && (
                      <>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-purple-500 px-1 pt-1">Your Voices</p>
                        {custom.map(renderVoice)}
                        {premade.length > 0 && <div className="border-t border-gray-100 my-1" />}
                      </>
                    )}
                    {premade.length > 0 && (
                      <>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 px-1 pt-1">Premade</p>
                        {premade.map(renderVoice)}
                      </>
                    )}
                  </>
                );
              })()}
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
                  <label className="text-xs font-semibold text-gray-700">Style</label>
                  <span className="text-xs text-indigo-600 font-mono font-bold">
                    {voiceStability <= 0.35 ? '🎭 Expressive' : voiceStability >= 0.7 ? '🎙️ Stable' : '⚖️ Balanced'} · {Math.round(voiceStability * 100)}%
                  </span>
                </div>
                <input
                  type="range" min="0" max="1" step="0.05"
                  value={voiceStability}
                  onChange={e => setVoiceStability(parseFloat(e.target.value))}
                  className="w-full accent-indigo-600 h-1.5 rounded-full"
                />
                <div className="flex justify-between text-[10px] text-gray-400 mt-0.5">
                  <span>Expressive</span><span>Balanced</span><span>Stable</span>
                </div>
              </div>
            </div>
            <div className="px-4 pb-4 pt-2">
              <button
                onClick={() => {
                  localStorage.setItem('cp_voice_id', voiceId);
                  localStorage.setItem('cp_voice_speed', voiceSpeed.toString());
                  localStorage.setItem('cp_voice_stability', voiceStability.toString());
                  setShowVoicePicker(false);
                }}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700"
              >
                Save — {accountVoices.find(v => v.voice_id === voiceId)?.name || 'this voice'}
              </button>
            </div>
          </div>
        </div>
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
                    {wizardCharacters.map((char, i) => (
                      <div key={i} className="flex items-start gap-3 p-3 border border-gray-200 rounded-xl">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-800">{char.name}</p>
                          {describingActor === i ? (
                            <p className="text-xs text-purple-500 mt-1 flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Analyzing photo...</p>
                          ) : (
                            <p className="text-xs text-gray-500 mt-1 line-clamp-2">{char.description || 'No description yet'}</p>
                          )}
                        </div>
                        {char.photoBase64 ? (
                          <img src={`data:${char.photoMime};base64,${char.photoBase64}`} alt={char.name} className="w-12 h-12 rounded-lg object-cover border border-gray-200" />
                        ) : (
                          <button
                            onClick={() => { setActorPhotoTarget(i); actorPhotoRef.current?.click(); }}
                            className="flex-shrink-0 w-12 h-12 rounded-lg border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-400 hover:border-purple-300 hover:text-purple-400 transition-colors"
                          >
                            <Upload size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <input ref={actorPhotoRef} type="file" accept="image/*" className="hidden" onChange={e => { if (actorPhotoTarget !== null) handleActorPhotoUpload(e, actorPhotoTarget); e.target.value = ''; setActorPhotoTarget(null); }} />
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
                        reader.onload = ev => {
                          const dataUrl = ev.target.result;
                          setWizardProductPhotos(prev => [...prev, {
                            base64: dataUrl.split(',')[1],
                            mimeType: file.type || 'image/jpeg',
                            previewUrl: dataUrl,
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

            {/* Step 4 — Visual Style */}
            {wizardStep === 4 && (
              <div className="p-6">
                <p className="text-sm text-gray-600 mb-3">Describe the visual style for this storyboard (optional). This applies to all generated images.</p>
                <textarea
                  value={wizardStyleNotes}
                  onChange={e => setWizardStyleNotes(e.target.value)}
                  placeholder="e.g. Cinematic, high-contrast, warm golden hour lighting. Urban setting. Nike campaign aesthetic. Clean and powerful."
                  className="w-full border border-gray-200 rounded-xl p-3 text-sm outline-none resize-none h-24 focus:border-purple-400 mb-4"
                />
                <div className="flex gap-2">
                  <button onClick={() => setWizardStep(3)} className="px-4 py-2 border border-gray-200 rounded-xl text-sm text-gray-600 hover:bg-gray-50">Back</button>
                  <button onClick={() => handleWizardComplete(true)}
                    className="flex-1 py-2.5 bg-purple-600 text-white rounded-xl text-sm font-bold hover:bg-purple-700 flex items-center justify-center gap-2">
                    <Sparkles size={14} /> Generate Image
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

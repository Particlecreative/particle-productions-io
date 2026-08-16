import { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles, Copy, Check, Trash2, Pencil, Plus, Search, Link2, ArrowRight, ImagePlus, Undo2, RotateCcw } from 'lucide-react';
import { toast } from '../../lib/toast';

const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

const FIELD_NAMES = { what_we_see: 'visuals', what_we_hear: 'voiceover', location: 'location', duration: 'duration' };
const ALLOWED_FIELDS = ['location', 'what_we_see', 'what_we_hear', 'duration'];

// ── Pure action application — returns { scenes, label } or null if invalid ──
function applyAction(scenesArr, action) {
  const reindex = (arr) => arr.map((s, i) => ({ ...s, order: i }));
  switch (action.action) {
    case 'edit_scene': {
      const idx = (action.scene_number || 1) - 1;
      if (idx < 0 || idx >= scenesArr.length || !ALLOWED_FIELDS.includes(action.field)) return null;
      const updated = [...scenesArr];
      updated[idx] = { ...updated[idx], [action.field]: action.value };
      return { scenes: updated, label: `Scene ${idx + 1} ${FIELD_NAMES[action.field]} updated` };
    }
    case 'batch_edit': {
      const edits = (action.edits || []).filter(e =>
        e && ALLOWED_FIELDS.includes(e.field) && e.value !== undefined &&
        (e.scene_number || 1) - 1 >= 0 && (e.scene_number || 1) - 1 < scenesArr.length
      );
      if (!edits.length) return null;
      const updated = [...scenesArr];
      const touched = new Set();
      edits.forEach(e => {
        const idx = e.scene_number - 1;
        updated[idx] = { ...updated[idx], [e.field]: e.value };
        touched.add(e.scene_number);
      });
      return { scenes: updated, label: `${edits.length} edit${edits.length !== 1 ? 's' : ''} across scene${touched.size !== 1 ? 's' : ''} ${[...touched].join(', ')}` };
    }
    case 'add_scene': {
      const after = Number.isFinite(action.after_scene_number) ? action.after_scene_number : scenesArr.length;
      const insertAt = Math.max(0, Math.min(after, scenesArr.length));
      const newScene = {
        id: crypto.randomUUID(), order: insertAt,
        location: action.location || '', what_we_see: action.what_we_see || '',
        what_we_hear: action.what_we_hear || '', duration: action.duration || '',
        images: [], collapsed: false,
      };
      const updated = [...scenesArr];
      updated.splice(insertAt, 0, newScene);
      return { scenes: reindex(updated), label: insertAt === 0 ? 'New scene added at the start' : `New scene added after scene ${insertAt}` };
    }
    case 'delete_scene': {
      const idx = (action.scene_number || 1) - 1;
      if (idx < 0 || idx >= scenesArr.length) return null;
      return { scenes: reindex(scenesArr.filter((_, i) => i !== idx)), label: `Scene ${idx + 1} deleted` };
    }
    case 'reorder_scene': {
      const fromIdx = (action.scene_number || 1) - 1;
      const toIdx = (action.move_to_position || 1) - 1;
      if (fromIdx < 0 || fromIdx >= scenesArr.length || toIdx < 0 || toIdx >= scenesArr.length) return null;
      const updated = [...scenesArr];
      const [moved] = updated.splice(fromIdx, 1);
      updated.splice(toIdx, 0, moved);
      return { scenes: reindex(updated), label: `Scene ${fromIdx + 1} moved to position ${toIdx + 1}` };
    }
    case 'merge_scenes': {
      const nums = action.scene_numbers || [];
      const indices = [...new Set(nums.map(n => n - 1).filter(i => i >= 0 && i < scenesArr.length))].sort((a, b) => a - b);
      if (indices.length < 2) return null;
      const merged = {
        ...scenesArr[indices[0]],
        what_we_see: indices.map(i => scenesArr[i].what_we_see).filter(Boolean).join(' '),
        what_we_hear: indices.map(i => scenesArr[i].what_we_hear).filter(Boolean).join(' '),
      };
      const removeSet = new Set(indices.slice(1));
      const updated = scenesArr.map((s, i) => (i === indices[0] ? merged : s)).filter((_, i) => !removeSet.has(i));
      return { scenes: reindex(updated), label: `Scenes ${indices.map(i => i + 1).join(' + ')} merged` };
    }
    default:
      return null;
  }
}

// Downscale an image file to a base64 JPEG suitable for the API (fast + small)
function fileToResizedBase64(file, maxDim = 1568) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ data: dataUrl.split(',')[1], media_type: 'image/jpeg', preview: dataUrl });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

const THINKING_STATES = ['Thinking…', 'Reading your script…', 'Writing…', 'Polishing the words…', 'Almost there…'];

/**
 * AIChatPanel — floating AI script assistant.
 * Edits are applied to the script automatically (with per-message Undo),
 * supports image references, and stays mounted so the chat survives closing.
 */
export default function AIChatPanel({ scriptId, script, scenes, selectedText, selectedSceneId, open, onOpen, onClose, onScriptUpdate, onDuplicate }) {
  const storageKey = `cp_ai_chat_${scriptId}`;
  const [messages, setMessages] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey)) || []; } catch { return []; }
  });
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [thinkingIdx, setThinkingIdx] = useState(0);
  const [copied, setCopied] = useState(null);
  const [refUrl, setRefUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [pendingImages, setPendingImages] = useState([]); // [{data, media_type, preview}]
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;

  useEffect(() => { if (open) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, open, loading]);
  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 250); }, [open]);
  useEffect(() => {
    if (!loading) return;
    setThinkingIdx(0);
    const t = setInterval(() => setThinkingIdx(i => Math.min(i + 1, THINKING_STATES.length - 1)), 3000);
    return () => clearInterval(t);
  }, [loading]);
  useEffect(() => {
    // Persist chat (without image payloads / undo snapshots) so it survives reloads
    try {
      const slim = messages.slice(-30).map(({ role, content, chips, undone }) => ({ role, content, chips, undone }));
      sessionStorage.setItem(storageKey, JSON.stringify(slim));
    } catch {}
  }, [messages, storageKey]);
  useEffect(() => {
    if (open && selectedText && messages.length === 0) {
      setInput(`About: "${selectedText.slice(0, 80)}${selectedText.length > 80 ? '...' : ''}" — `);
    }
  }, [selectedText, open]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAttachImages(e) {
    const files = [...(e.target.files || [])].slice(0, 6 - pendingImages.length);
    e.target.value = '';
    for (const f of files) {
      try {
        const img = await fileToResizedBase64(f);
        setPendingImages(prev => [...prev, img]);
      } catch { toast.error('Could not read image'); }
    }
  }

  const handleSend = async (overrideText) => {
    const text = (overrideText ?? input).trim();
    if ((!text && pendingImages.length === 0) || loading) return;
    const userMsg = { role: 'user', content: text || '(image reference)', images: pendingImages };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setPendingImages([]);
    setLoading(true);

    // History for the API: include what was actually applied so the model
    // knows its own past edits; strip undo snapshots.
    const apiMessages = newMessages.map(m => ({
      role: m.role,
      content: m.role === 'assistant' && m.chips?.length
        ? `${m.content}\n[Applied: ${m.chips.map(c => c.label).join('; ')}]`
        : m.content,
      images: m.images?.map(({ data, media_type }) => ({ data, media_type })),
    })).filter(m => (m.content && m.content.trim()) || m.images?.length);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 115000);
    try {
      const res = await fetch(`${API}/api/scripts/${scriptId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        signal: controller.signal,
        body: JSON.stringify({
          messages: apiMessages,
          selected_text: selectedText || undefined,
          scene_id: selectedSceneId || undefined,
          reference_url: refUrl.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error || `Something went wrong (${res.status}). Try again.`, error: true }]);
      } else {
        // ── Auto-apply the actions immediately ──
        const chips = [];
        let prevScenes = null;
        if (data.actions?.length && onScriptUpdate) {
          let working = scenesRef.current;
          prevScenes = working;
          for (const action of data.actions) {
            if (action.action === 'duplicate_script') {
              if (onDuplicate) { onDuplicate(action.new_title || `${script?.title || 'Script'} (Copy)`); chips.push({ label: `Duplicated as "${action.new_title || 'Copy'}"`, noUndo: true }); }
              continue;
            }
            const result = applyAction(working, action);
            if (result) { working = result.scenes; chips.push({ label: result.label }); }
          }
          if (working !== prevScenes) onScriptUpdate(working);
          else prevScenes = null;
        }
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.reply || (chips.length ? 'Done!' : 'No response.'),
          chips,
          prevScenes, // in-memory undo snapshot
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant', error: true,
        content: err?.name === 'AbortError' ? 'That took too long and timed out — try a smaller request.' : 'Connection error — check your network and try again.',
      }]);
    } finally {
      clearTimeout(timer);
      setLoading(false);
      setRefUrl('');
      setShowUrlInput(false);
    }
  };

  function handleUndo(msgIndex) {
    const msg = messages[msgIndex];
    if (!msg?.prevScenes || !onScriptUpdate) return;
    onScriptUpdate(msg.prevScenes);
    setMessages(prev => prev.map((m, i) => (i === msgIndex ? { ...m, undone: true } : m)));
    toast.success('Edits undone');
  }

  const quickPrompts = [
    { label: 'Rate this script (1-10)', icon: Sparkles },
    { label: 'Shorten all voiceovers', icon: Pencil },
    { label: 'Optimize for 30 seconds', icon: ArrowRight },
    { label: 'Make the hook stronger', icon: Search },
    { label: 'Add a product close-up scene', icon: Plus },
  ];

  const retryLast = () => {
    const lastUser = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUser) return;
    setMessages(prev => {
      const copy = [...prev];
      // drop trailing error message + the user msg (handleSend re-adds it)
      while (copy.length && copy[copy.length - 1].role === 'assistant') copy.pop();
      if (copy.length && copy[copy.length - 1].role === 'user') copy.pop();
      return copy;
    });
    setTimeout(() => handleSend(lastUser.content === '(image reference)' ? '' : lastUser.content), 50);
  };

  // ── Floating action button (panel closed) ──
  if (!open) {
    return (
      <button
        onClick={onOpen}
        title="AI Assistant"
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-purple-600 via-purple-500 to-indigo-600 text-white shadow-xl shadow-purple-500/30 flex items-center justify-center hover:scale-110 active:scale-95 transition-transform ai-fab"
      >
        <Sparkles size={22} />
        {messages.length > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-white text-purple-600 text-[10px] font-black flex items-center justify-center shadow">{Math.min(messages.length, 9)}</span>
        )}
      </button>
    );
  }

  // ── Floating panel (open) ──
  return (
    <div className="fixed bottom-4 right-4 z-50 w-[min(420px,calc(100vw-2rem))] h-[min(660px,calc(100vh-5rem))] bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-700 flex flex-col shadow-2xl overflow-hidden ai-panel-in">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
            <Sparkles size={15} />
          </div>
          <div>
            <h3 className="text-sm font-black leading-tight">AI Assistant</h3>
            <p className="text-[9px] text-purple-100/90">Edits your script live · attach images for reference</p>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          {messages.length > 0 && (
            <button onClick={() => { setMessages([]); setInput(''); try { sessionStorage.removeItem(storageKey); } catch {} }}
              className="p-1.5 rounded-lg text-purple-100 hover:text-white hover:bg-white/15 transition-colors" title="Clear chat">
              <Trash2 size={14} />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg text-purple-100 hover:text-white hover:bg-white/15 transition-colors" title="Minimize">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Context banner */}
      {(selectedText || selectedSceneId) && (
        <div className="px-4 py-2 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-100 dark:border-purple-900/40 shrink-0">
          <p className="text-[9px] text-purple-600 font-semibold uppercase tracking-wide">Context</p>
          {selectedText && <p className="text-[10px] text-purple-700 dark:text-purple-300 italic line-clamp-2 mt-0.5">"{selectedText}"</p>}
          {selectedSceneId && !selectedText && <p className="text-[10px] text-purple-700 dark:text-purple-300 mt-0.5">Scene selected</p>}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6 ai-msg-in">
            <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-gradient-to-br from-purple-100 to-indigo-100 dark:from-purple-900/40 dark:to-indigo-900/40 flex items-center justify-center">
              <Sparkles size={20} className="text-purple-500" />
            </div>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">Hey! I edit your script directly.</p>
            <p className="text-[11px] text-gray-400 mb-4">Ask for rewrites, pacing, hooks — or attach reference images.</p>
            <div className="space-y-1.5">
              {quickPrompts.map((p, i) => (
                <button key={i} onClick={() => handleSend(p.label)}
                  className="w-full text-left text-[11px] text-gray-600 dark:text-gray-300 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 px-3 py-2 rounded-xl transition-all border border-gray-100 dark:border-gray-700 hover:border-purple-200 hover:translate-x-0.5 flex items-center gap-2">
                  <p.icon size={11} className="shrink-0 text-purple-400" /> {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ai-msg-in ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${
              msg.role === 'user'
                ? 'bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-br-md'
                : msg.error
                  ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-100 dark:border-red-900/40 rounded-bl-md'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md'
            }`}>
              {/* attached images preview in user bubble */}
              {msg.images?.length > 0 && (
                <div className="flex gap-1.5 mb-2 flex-wrap">
                  {msg.images.map((img, ii) => img.preview && (
                    <img key={ii} src={img.preview} alt="" className="w-14 h-14 object-cover rounded-lg border border-white/30" />
                  ))}
                </div>
              )}
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>

              {/* Applied-edit chips */}
              {msg.chips?.length > 0 && (
                <div className="mt-2 space-y-1 border-t border-gray-200 dark:border-gray-700 pt-2">
                  {msg.chips.map((chip, ci) => (
                    <div key={ci} className={`flex items-center gap-1.5 text-[11px] font-semibold rounded-lg px-2 py-1 ai-chip-in ${msg.undone ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 line-through' : 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'}`}
                      style={{ animationDelay: `${ci * 80}ms` }}>
                      <Check size={11} className="shrink-0" /> {chip.label}
                    </div>
                  ))}
                  {msg.prevScenes && !msg.undone && (
                    <button onClick={() => handleUndo(i)}
                      className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-red-500 font-semibold mt-1 transition-colors">
                      <Undo2 size={10} /> Undo these edits
                    </button>
                  )}
                  {msg.undone && <p className="text-[10px] text-gray-400 mt-1">Edits undone</p>}
                </div>
              )}

              {/* Error retry */}
              {msg.error && i === messages.length - 1 && (
                <button onClick={retryLast} className="flex items-center gap-1 text-[10px] font-bold mt-1.5 text-red-600 hover:text-red-800">
                  <RotateCcw size={10} /> Retry
                </button>
              )}

              {/* Copy */}
              {msg.role === 'assistant' && !msg.error && msg.content && (
                <button onClick={() => { navigator.clipboard.writeText(msg.content); setCopied(i); setTimeout(() => setCopied(null), 1500); }}
                  className="text-[9px] text-gray-400 hover:text-gray-600 flex items-center gap-1 mt-1.5">
                  {copied === i ? <><Check size={9} className="text-green-500" /> Copied</> : <><Copy size={9} /> Copy</>}
                </button>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start ai-msg-in">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-2.5">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 ai-dot" />
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 ai-dot" style={{ animationDelay: '0.15s' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-purple-400 ai-dot" style={{ animationDelay: '0.3s' }} />
              </span>
              <span className="text-[11px] text-gray-400 font-medium">{THINKING_STATES[thinkingIdx]}</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* URL input */}
      {showUrlInput && (
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 shrink-0">
          <div className="flex items-center gap-2">
            <Link2 size={12} className="text-gray-400 shrink-0" />
            <input value={refUrl} onChange={e => setRefUrl(e.target.value)} placeholder="Paste reference URL..."
              className="flex-1 text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 outline-none focus:border-purple-300 dark:bg-gray-800 dark:text-gray-200" />
            <button onClick={() => setShowUrlInput(false)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
          </div>
        </div>
      )}

      {/* Pending image previews */}
      {pendingImages.length > 0 && (
        <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-800 shrink-0 flex gap-2 flex-wrap">
          {pendingImages.map((img, i) => (
            <div key={i} className="relative ai-chip-in">
              <img src={img.preview} alt="" className="w-12 h-12 object-cover rounded-lg border border-purple-200" />
              <button onClick={() => setPendingImages(prev => prev.filter((_, pi) => pi !== i))}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-gray-800 text-white flex items-center justify-center hover:bg-red-500">
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Composer */}
      <div className="px-3 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-end gap-2">
          <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleAttachImages} />
          <button onClick={() => fileRef.current?.click()} title="Attach reference images"
            className={`p-2 rounded-xl transition-colors shrink-0 ${pendingImages.length ? 'text-purple-600 bg-purple-50' : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20'}`}>
            <ImagePlus size={16} />
          </button>
          <button onClick={() => setShowUrlInput(v => !v)} title="Attach reference URL"
            className={`p-2 rounded-xl transition-colors shrink-0 ${refUrl ? 'text-purple-600 bg-purple-50' : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20'}`}>
            <Link2 size={15} />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder='Try: "shorten scene 3 VO"'
            className="flex-1 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm outline-none resize-none max-h-24 focus:border-purple-400 dark:bg-gray-800 dark:text-gray-200"
            rows={1}
          />
          <button onClick={() => handleSend()} disabled={(!input.trim() && !pendingImages.length) || loading}
            className="p-2.5 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white hover:opacity-90 disabled:opacity-40 transition-all active:scale-95 shrink-0">
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

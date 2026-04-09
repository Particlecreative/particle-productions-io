import { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Sparkles, Copy, Check, Trash2, Play, Pencil, Plus, Search, Link2, ArrowRight } from 'lucide-react';
import { toast } from '../../lib/toast';

const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

/**
 * AIChatPanel — AI script assistant with action execution.
 * Can edit scenes, delete, add, find/replace, duplicate scripts, read URLs.
 */
export default function AIChatPanel({ scriptId, script, scenes, selectedText, selectedSceneId, onClose, onScriptUpdate, onDuplicate }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(null);
  const [refUrl, setRefUrl] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => {
    if (selectedText && messages.length === 0) {
      setInput(`About: "${selectedText.slice(0, 80)}${selectedText.length > 80 ? '...' : ''}" — `);
    }
  }, [selectedText]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API}/api/scripts/${scriptId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt()}` },
        body: JSON.stringify({
          messages: newMessages,
          selected_text: selectedText || undefined,
          scene_id: selectedSceneId || undefined,
          reference_url: refUrl.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.reply || data.actions) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.reply || '',
          actions: data.actions || [],
        }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error || 'Failed.' }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error.' }]);
    }
    setLoading(false);
    setRefUrl('');
    setShowUrlInput(false);
  };

  const executeAction = (action) => {
    if (!onScriptUpdate) return;
    switch (action.action) {
      case 'edit_scene': {
        const idx = (action.scene_number || 1) - 1;
        if (idx >= 0 && idx < scenes.length) {
          const updated = [...scenes];
          updated[idx] = { ...updated[idx], [action.field]: action.value };
          onScriptUpdate(updated);
          toast.success(`Scene ${action.scene_number} — ${action.field} updated`);
        }
        break;
      }
      case 'delete_scene': {
        const idx = (action.scene_number || 1) - 1;
        if (idx >= 0 && idx < scenes.length) {
          const updated = scenes.filter((_, i) => i !== idx);
          updated.forEach((s, i) => s.order = i);
          onScriptUpdate(updated);
          toast.success(`Scene ${action.scene_number} deleted`);
        }
        break;
      }
      case 'add_scene': {
        const afterIdx = (action.after_scene_number || scenes.length) - 1;
        const newScene = {
          id: crypto.randomUUID(),
          order: afterIdx + 1,
          location: action.location || '',
          what_we_see: action.what_we_see || '',
          what_we_hear: action.what_we_hear || '',
          duration: action.duration || '',
          images: [],
          collapsed: false,
        };
        const updated = [...scenes];
        updated.splice(afterIdx + 1, 0, newScene);
        updated.forEach((s, i) => s.order = i);
        onScriptUpdate(updated);
        toast.success(`Scene added after scene ${action.after_scene_number}`);
        break;
      }
      case 'find_replace': {
        let count = 0;
        const updated = scenes.map(s => {
          const newScene = { ...s };
          ['what_we_see', 'what_we_hear', 'location'].forEach(field => {
            if (newScene[field]?.includes(action.find)) {
              newScene[field] = newScene[field].replaceAll(action.find, action.replace);
              count++;
            }
          });
          return newScene;
        });
        onScriptUpdate(updated);
        toast.success(`Replaced "${action.find}" → "${action.replace}" in ${count} field${count !== 1 ? 's' : ''}`);
        break;
      }
      case 'duplicate_script': {
        if (onDuplicate) onDuplicate(action.new_title || `${script?.title || 'Script'} (Copy)`);
        break;
      }
      case 'reorder_scene': {
        const fromIdx = (action.scene_number || 1) - 1;
        const toIdx = (action.move_to_position || 1) - 1;
        if (fromIdx >= 0 && fromIdx < scenes.length && toIdx >= 0 && toIdx < scenes.length) {
          const updated = [...scenes];
          const [moved] = updated.splice(fromIdx, 1);
          updated.splice(toIdx, 0, moved);
          updated.forEach((s, i) => s.order = i);
          onScriptUpdate(updated);
          toast.success(`Scene ${action.scene_number} moved to position ${action.move_to_position}`);
        }
        break;
      }
      case 'merge_scenes': {
        const nums = action.scene_numbers || [];
        if (nums.length >= 2) {
          const indices = nums.map(n => n - 1).filter(i => i >= 0 && i < scenes.length).sort((a, b) => a - b);
          if (indices.length >= 2) {
            const merged = {
              ...scenes[indices[0]],
              what_we_see: indices.map(i => scenes[i].what_we_see).filter(Boolean).join(' '),
              what_we_hear: indices.map(i => scenes[i].what_we_hear).filter(Boolean).join(' '),
            };
            const updated = scenes.filter((_, i) => !indices.slice(1).includes(i));
            updated[indices[0]] = merged;
            updated.forEach((s, i) => s.order = i);
            onScriptUpdate(updated);
            toast.success(`Scenes ${nums.join(' + ')} merged`);
          }
        }
        break;
      }
      case 'batch_edit': {
        const edits = action.edits || [];
        const updated = [...scenes];
        let editCount = 0;
        edits.forEach(edit => {
          const idx = (edit.scene_number || 1) - 1;
          if (idx >= 0 && idx < updated.length && edit.field && edit.value !== undefined) {
            updated[idx] = { ...updated[idx], [edit.field]: edit.value };
            editCount++;
          }
        });
        onScriptUpdate(updated);
        toast.success(`Batch edit: ${editCount} scene${editCount !== 1 ? 's' : ''} updated`);
        break;
      }
    }
  };

  const quickPrompts = [
    { label: 'Rate this script (1-10)', icon: Sparkles },
    { label: 'Rewrite scene 1 emotionally', icon: Pencil },
    { label: 'Optimize for 30 seconds', icon: ArrowRight },
    { label: 'Make all VO present tense', icon: Search },
    { label: 'Add a product close-up scene', icon: Plus },
    { label: 'Merge scenes 1 and 2', icon: ArrowRight },
    { label: 'Generate shot list', icon: Sparkles },
  ];

  const ACTION_LABELS = {
    edit_scene: { icon: '✏️', label: 'Edit Scene' },
    delete_scene: { icon: '🗑️', label: 'Delete Scene' },
    add_scene: { icon: '➕', label: 'Add Scene' },
    reorder_scene: { icon: '↕️', label: 'Move Scene' },
    merge_scenes: { icon: '🔗', label: 'Merge Scenes' },
    find_replace: { icon: '🔄', label: 'Find & Replace' },
    batch_edit: { icon: '📝', label: 'Batch Edit' },
    duplicate_script: { icon: '📋', label: 'Duplicate Script' },
  };

  return (
    <div className="fixed top-0 right-0 bottom-0 w-full sm:w-[420px] bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 z-50 flex flex-col shadow-2xl animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-purple-500" />
          <div>
            <h3 className="text-sm font-black text-gray-900 dark:text-gray-100">AI Assistant</h3>
            <p className="text-[9px] text-gray-400">Can edit, delete, add scenes, find/replace, duplicate</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button onClick={() => { setMessages([]); setInput(''); }} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Clear">
              <Trash2 size={14} />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Context */}
      {(selectedText || selectedSceneId) && (
        <div className="px-4 py-2 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-100 shrink-0">
          <p className="text-[9px] text-purple-600 font-semibold uppercase tracking-wide">Context</p>
          {selectedText && <p className="text-[10px] text-purple-700 italic line-clamp-2 mt-0.5">"{selectedText}"</p>}
          {selectedSceneId && !selectedText && <p className="text-[10px] text-purple-700 mt-0.5">Scene selected</p>}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-6">
            <Sparkles size={24} className="mx-auto mb-2 text-gray-200" />
            <p className="text-xs text-gray-400 font-medium mb-3">Ask me anything — I can edit your script directly</p>
            <div className="space-y-1">
              {quickPrompts.map((p, i) => (
                <button key={i} onClick={() => { setInput(p.label); inputRef.current?.focus(); }}
                  className="w-full text-left text-[11px] text-gray-500 hover:text-purple-600 hover:bg-purple-50 px-3 py-2 rounded-lg transition-colors border border-gray-100 hover:border-purple-200 flex items-center gap-2">
                  <p.icon size={11} className="shrink-0" /> {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 ${
              msg.role === 'user'
                ? 'bg-purple-600 text-white rounded-br-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md'
            }`}>
              <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>

              {/* Action buttons */}
              {msg.actions?.length > 0 && (
                <div className="mt-2 space-y-1.5 border-t border-gray-200 dark:border-gray-700 pt-2">
                  {msg.actions.map((action, ai) => {
                    const meta = ACTION_LABELS[action.action] || { icon: '⚡', label: action.action };
                    return (
                      <button key={ai} onClick={() => executeAction(action)}
                        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-semibold transition-colors text-left">
                        <span>{meta.icon}</span>
                        <span className="flex-1 truncate">{meta.label}
                          {action.scene_number && !action.scene_numbers && ` — Scene ${action.scene_number}`}
                          {action.scene_numbers && ` — Scenes ${action.scene_numbers.join(' + ')}`}
                          {action.move_to_position && ` → position ${action.move_to_position}`}
                          {action.field && ` (${action.field.replace(/_/g, ' ')})`}
                          {action.find && ` "${action.find}" → "${action.replace}"`}
                          {action.new_title && ` "${action.new_title}"`}
                          {action.edits && ` (${action.edits.length} changes)`}
                        </span>
                        <Play size={10} />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Copy button for assistant messages */}
              {msg.role === 'assistant' && msg.content && (
                <div className="flex items-center gap-2 mt-1.5">
                  <button onClick={() => { navigator.clipboard.writeText(msg.content); setCopied(i); setTimeout(() => setCopied(null), 1500); }}
                    className="text-[9px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
                    {copied === i ? <><Check size={9} className="text-green-500" /> Copied</> : <><Copy size={9} /> Copy</>}
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3">
              <Loader2 size={14} className="animate-spin text-gray-400" />
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* URL input toggle */}
      {showUrlInput && (
        <div className="px-4 py-2 border-t border-gray-100 shrink-0">
          <div className="flex items-center gap-2">
            <Link2 size={12} className="text-gray-400 shrink-0" />
            <input
              value={refUrl}
              onChange={e => setRefUrl(e.target.value)}
              placeholder="Paste reference URL..."
              className="flex-1 text-xs border border-gray-200 rounded-lg px-2 py-1.5 outline-none focus:border-purple-300"
            />
            <button onClick={() => setShowUrlInput(false)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              placeholder="Edit scene 3 VO to be shorter..."
              className="w-full border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2 text-sm outline-none resize-none max-h-24 focus:border-purple-400 dark:bg-gray-800 dark:text-gray-200"
              rows={1}
            />
            <div className="flex items-center gap-2 mt-1">
              <button onClick={() => setShowUrlInput(v => !v)}
                className={`text-[9px] flex items-center gap-1 ${refUrl ? 'text-purple-600 font-semibold' : 'text-gray-400 hover:text-gray-600'}`}>
                <Link2 size={9} /> {refUrl ? 'URL attached' : 'Add URL'}
              </button>
            </div>
          </div>
          <button onClick={handleSend} disabled={!input.trim() || loading}
            className="p-2.5 rounded-xl bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 transition-colors shrink-0 mb-5">
            <Send size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

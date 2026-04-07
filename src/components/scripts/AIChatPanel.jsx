import { useState, useRef, useEffect } from 'react';
import { X, Send, Loader2, Sparkles, Copy, Check, Trash2 } from 'lucide-react';

const API = import.meta.env.VITE_API_URL || '';
function jwt() { return localStorage.getItem('cp_auth_token'); }

/**
 * AIChatPanel — slide-in side panel for Claude script conversations.
 * Supports: free chat, selected text context, scene-specific context.
 */
export default function AIChatPanel({ scriptId, selectedText, selectedSceneId, onClose, onApplyText }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(null);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Focus input on open
  useEffect(() => { inputRef.current?.focus(); }, []);

  // If selected text changes, add context hint
  useEffect(() => {
    if (selectedText && messages.length === 0) {
      setInput(`About this text: "${selectedText.slice(0, 100)}${selectedText.length > 100 ? '...' : ''}" — `);
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
        }),
      });
      const data = await res.json();
      if (data.reply) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error || 'Failed to get response.' }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Connection error. Please try again.' }]);
    }
    setLoading(false);
  };

  const handleCopy = (text, idx) => {
    navigator.clipboard.writeText(text);
    setCopied(idx);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleClear = () => {
    setMessages([]);
    setInput('');
  };

  const quickPrompts = [
    'Rewrite this scene to be more emotional',
    'Make the voiceover shorter and punchier',
    'Suggest a stronger CTA',
    'Add more visual detail to what we see',
    'Write an alternative version of this scene',
  ];

  return (
    <div className="fixed top-0 right-0 bottom-0 w-full sm:w-96 bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-700 z-50 flex flex-col shadow-2xl animate-slide-in-right">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-purple-500" />
          <h3 className="text-sm font-black text-gray-900 dark:text-gray-100">AI Script Assistant</h3>
        </div>
        <div className="flex items-center gap-1">
          {messages.length > 0 && (
            <button onClick={handleClear} className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Clear chat">
              <Trash2 size={14} />
            </button>
          )}
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Context indicator */}
      {(selectedText || selectedSceneId) && (
        <div className="px-4 py-2 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-100 dark:border-purple-800/30 shrink-0">
          <p className="text-[10px] text-purple-600 dark:text-purple-400 font-semibold uppercase tracking-wide">Context</p>
          {selectedText && (
            <p className="text-xs text-purple-700 dark:text-purple-300 italic line-clamp-2 mt-0.5">"{selectedText}"</p>
          )}
          {selectedSceneId && !selectedText && (
            <p className="text-xs text-purple-700 dark:text-purple-300 mt-0.5">Focused on selected scene</p>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <Sparkles size={28} className="mx-auto mb-3 text-gray-200" />
            <p className="text-sm text-gray-400 font-medium mb-1">Ask me anything about your script</p>
            <p className="text-xs text-gray-400 mb-4">I can rewrite scenes, refine VO, suggest ideas, or discuss creative direction.</p>
            <div className="space-y-1.5">
              {quickPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => { setInput(prompt); inputRef.current?.focus(); }}
                  className="w-full text-left text-xs text-gray-500 hover:text-purple-600 hover:bg-purple-50 px-3 py-2 rounded-lg transition-colors border border-gray-100 hover:border-purple-200"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 ${
              msg.role === 'user'
                ? 'bg-purple-600 text-white rounded-br-md'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded-bl-md'
            }`}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              {msg.role === 'assistant' && (
                <div className="flex items-center gap-1 mt-2 -mb-0.5">
                  <button
                    onClick={() => handleCopy(msg.content, i)}
                    className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
                  >
                    {copied === i ? <><Check size={10} className="text-green-500" /> Copied</> : <><Copy size={10} /> Copy</>}
                  </button>
                  {onApplyText && (
                    <button
                      onClick={() => onApplyText(msg.content)}
                      className="text-[10px] text-purple-400 hover:text-purple-600 flex items-center gap-1 ml-2 transition-colors"
                    >
                      <Sparkles size={10} /> Apply to scene
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 dark:bg-gray-800 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2 text-gray-400">
                <Loader2 size={14} className="animate-spin" />
                <span className="text-xs">Thinking...</span>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 shrink-0">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
            }}
            placeholder="Ask about your script..."
            className="flex-1 border border-gray-200 dark:border-gray-700 rounded-xl px-3 py-2.5 text-sm outline-none resize-none max-h-32 focus:border-purple-400 dark:bg-gray-800 dark:text-gray-200"
            rows={1}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || loading}
            className="p-2.5 rounded-xl bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-40 transition-colors shrink-0"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}

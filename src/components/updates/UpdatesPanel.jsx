import { useState, useEffect, useRef } from 'react';
import { X, Send, AtSign, Trash2, Pencil, Check, Paperclip } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import {
  getComments,
  createComment,
  updateComment,
  deleteComment,
  generateId,
} from '../../lib/dataService';
import { SAMPLE_USERS } from '../../lib/mockData';
import { formatIST, nowISOString } from '../../lib/timezone';
import clsx from 'clsx';

export default function UpdatesPanel({ productionId, onClose, inline = false }) {
  const { user, isAdmin } = useAuth();
  const { addNotification } = useNotifications();
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const textareaRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    Promise.resolve(getComments(productionId)).then(r => setComments(Array.isArray(r) ? r : []));
  }, [productionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  async function refresh() {
    const r = await Promise.resolve(getComments(productionId));
    setComments(Array.isArray(r) ? r : []);
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!body.trim()) return;

    // Extract mentions
    const mentionMatches = body.match(/@([\w\s]+?)(?=\s|$|@)/g) || [];
    const mentions = mentionMatches.map(m => m.slice(1).trim());

    const comment = {
      id: generateId('c'),
      production_id: productionId,
      user_id: user?.id,
      author: user?.name || 'Unknown',
      body,
      mentions,
      created_at: nowISOString(),
    };
    createComment(comment);

    // Notify mentioned users
    mentions.forEach(name => {
      const mentioned = SAMPLE_USERS.find(u => u.name.toLowerCase().includes(name.toLowerCase()));
      if (mentioned && mentioned.id !== user?.id) {
        addNotification('mention', `${user?.name} mentioned you in a comment`, productionId);
      }
    });

    setBody('');
    refresh();
  }

  function handleEdit(id, currentBody) {
    setEditingId(id);
    setEditBody(currentBody);
  }

  function handleSaveEdit(id) {
    updateComment(id, editBody);
    setEditingId(null);
    refresh();
  }

  function handleDelete(id) {
    if (!confirm('Delete this comment?')) return;
    deleteComment(id);
    refresh();
  }

  function insertMention(name) {
    setBody(b => b + `@${name} `);
    setShowMentions(false);
    textareaRef.current?.focus();
  }

  const content = (
    <div className={clsx('flex flex-col', inline ? 'h-[500px]' : 'h-full')}>
      {/* Header (only in drawer mode) */}
      {!inline && (
        <div
          className="flex items-center justify-between px-5 py-4 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--brand-border)' }}
        >
          <h2 className="font-black text-lg" style={{ color: 'var(--brand-primary)' }}>
            Updates
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>
      )}

      {/* Comments Feed */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {comments.length === 0 && (
          <div className="text-center py-10 text-gray-300 text-sm">
            No updates yet. Start the conversation.
          </div>
        )}

        {comments.map(comment => (
          <div key={comment.id} className="flex gap-3 group">
            {/* Avatar */}
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5"
              style={{ background: 'var(--brand-accent)' }}
            >
              {comment.author?.[0] || '?'}
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-semibold text-gray-800">{comment.author}</span>
                <span className="text-xs text-gray-400">{formatIST(comment.created_at)}</span>
              </div>

              {editingId === comment.id ? (
                <div className="mt-1">
                  <textarea
                    value={editBody}
                    onChange={e => setEditBody(e.target.value)}
                    rows={2}
                    className="brand-input text-sm resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setEditingId(null)} className="btn-secondary text-xs py-1">Cancel</button>
                    <button onClick={() => handleSaveEdit(comment.id)} className="btn-cta text-xs py-1">Save</button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-gray-700 mt-0.5 whitespace-pre-wrap break-words">
                  {comment.body.split(/(@[\w\s]+?)(?=\s|$)/).map((part, i) =>
                    part.startsWith('@')
                      ? <span key={i} className="text-blue-500 font-medium">{part}</span>
                      : part
                  )}
                </p>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {(user?.id === comment.user_id || isAdmin) && !editingId && (
                  <>
                    <button onClick={() => handleEdit(comment.id, comment.body)} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                      <Pencil size={10} /> Edit
                    </button>
                    <button onClick={() => handleDelete(comment.id)} className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1">
                      <Trash2 size={10} /> Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div
        className="flex-shrink-0 px-5 py-3"
        style={{ borderTop: '1px solid var(--brand-border)' }}
      >
        <form onSubmit={handleSubmit}>
          <div className="flex gap-2 items-end">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={body}
                onChange={e => setBody(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
                  if (e.key === '@') setShowMentions(true);
                }}
                placeholder="Leave an update… (@ to mention)"
                rows={2}
                className="brand-input text-sm resize-none"
              />

              {/* Mention Dropdown */}
              {showMentions && (
                <div className="absolute bottom-full left-0 mb-1 bg-white border rounded-xl shadow-xl overflow-hidden z-10 w-48">
                  {SAMPLE_USERS.map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => insertMention(u.name)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 text-left"
                    >
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                        style={{ background: 'var(--brand-accent)' }}
                      >
                        {u.name[0]}
                      </div>
                      {u.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowMentions(false)}
                    className="w-full px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 border-t"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowMentions(s => !s)}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Mention someone"
              >
                <AtSign size={15} />
              </button>
              <button
                type="submit"
                className="p-2 rounded-lg text-white transition-colors"
                style={{ background: 'var(--brand-accent)' }}
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  if (inline) return <div className="brand-card p-0 overflow-hidden">{content}</div>;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer-panel" style={{ width: 420 }}>
        {content}
      </div>
    </>
  );
}

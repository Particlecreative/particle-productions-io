import { useState, useEffect, useRef } from 'react';
import { X, Send, AtSign, Trash2, Pencil, Check, Link2, Bold, Italic, List, Palette, ExternalLink } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useNotifications } from '../../context/NotificationsContext';
import {
  getComments,
  createComment,
  updateComment,
  deleteComment,
  getLinks,
  createLink,
  generateId,
} from '../../lib/dataService';
import { SAMPLE_USERS } from '../../lib/mockData';
import { formatIST, nowISOString } from '../../lib/timezone';
import clsx from 'clsx';

// ─── Simple markdown-like rendering ─────────────────────────────────────────
function renderBody(text) {
  if (!text) return null;
  return text.split('\n').map((line, li) => {
    const isBullet = line.match(/^[\-\*•]\s/);
    const content = isBullet ? line.replace(/^[\-\*•]\s/, '') : line;
    const parts = formatInline(content);
    if (isBullet) return <li key={li} className="ml-4 list-disc">{parts}</li>;
    return <div key={li}>{parts}</div>;
  });
}

function formatInline(text) {
  // Bold **text**, Italic *text*, @mentions, links [text](url)
  const parts = [];
  let remaining = text;
  let key = 0;
  const regex = /(\*\*(.+?)\*\*|\*(.+?)\*|@([\w\s]+?)(?=\s|$|@)|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(remaining)) !== null) {
    if (match.index > lastIndex) parts.push(<span key={key++}>{remaining.slice(lastIndex, match.index)}</span>);
    if (match[2]) parts.push(<strong key={key++} className="font-bold">{match[2]}</strong>);
    else if (match[3]) parts.push(<em key={key++} className="italic">{match[3]}</em>);
    else if (match[4]) parts.push(<span key={key++} className="text-blue-500 font-medium bg-blue-50 rounded px-0.5">@{match[4]}</span>);
    else if (match[5] && match[6]) parts.push(
      <a key={key++} href={match[6]} target="_blank" rel="noopener noreferrer"
        className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
        {match[5]} <ExternalLink size={10} />
      </a>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < remaining.length) parts.push(<span key={key++}>{remaining.slice(lastIndex)}</span>);
  return parts.length ? parts : text;
}

// ─── Link attachment picker ─────────────────────────────────────────────────
function LinkPicker({ productionId, onInsert, onClose }) {
  const [links, setLinks] = useState([]);
  const [newUrl, setNewUrl] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [saveToTree, setSaveToTree] = useState(false);
  const [category, setCategory] = useState('General');
  const [mode, setMode] = useState('existing'); // 'existing' | 'new'

  useEffect(() => {
    async function load() {
      const l = await Promise.resolve(getLinks(productionId));
      setLinks(Array.isArray(l) ? l : []);
    }
    load();
  }, [productionId]);

  function handleInsertExisting(link) {
    onInsert(`[${link.label || link.url}](${link.url})`);
  }

  async function handleInsertNew() {
    if (!newUrl.trim()) return;
    const label = newLabel.trim() || newUrl;
    if (saveToTree) {
      await Promise.resolve(createLink({
        id: generateId('lnk'),
        production_id: productionId,
        url: newUrl,
        label,
        category,
        order: 0,
        created_at: nowISOString(),
      }));
    }
    onInsert(`[${label}](${newUrl})`);
  }

  const CATEGORIES = ['General', 'Concepts', 'Scripts', 'Pre-Production', 'Production', 'Post', 'Delivery', 'Admin'];

  return (
    <div className="absolute bottom-full left-0 mb-1 bg-white border rounded-xl shadow-xl z-20 w-72 max-h-64 overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b text-xs">
        <button onClick={() => setMode('existing')} className={clsx('flex-1 py-2 font-semibold', mode === 'existing' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400')}>
          Existing Links
        </button>
        <button onClick={() => setMode('new')} className={clsx('flex-1 py-2 font-semibold', mode === 'new' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400')}>
          New Link
        </button>
      </div>

      {mode === 'existing' ? (
        <div className="max-h-44 overflow-y-auto">
          {links.length === 0 && <div className="text-xs text-gray-400 p-3 text-center">No links yet</div>}
          {links.map(l => (
            <button key={l.id} onClick={() => handleInsertExisting(l)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-blue-50 text-left border-b border-gray-50">
              <Link2 size={12} className="text-blue-400 shrink-0" />
              <span className="truncate flex-1">{l.label || l.url}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="p-3 space-y-2">
          <input className="brand-input text-xs" placeholder="URL" value={newUrl} onChange={e => setNewUrl(e.target.value)} />
          <input className="brand-input text-xs" placeholder="Label (optional)" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
          <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
            <input type="checkbox" checked={saveToTree} onChange={e => setSaveToTree(e.target.checked)} className="rounded" />
            Save to Links tab
          </label>
          {saveToTree && (
            <select className="brand-input text-xs" value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          )}
          <button onClick={handleInsertNew} className="btn-cta text-xs w-full py-1.5">Insert Link</button>
        </div>
      )}

      <button onClick={onClose} className="w-full px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 border-t">
        Cancel
      </button>
    </div>
  );
}

// ─── Formatting toolbar ─────────────────────────────────────────────────────
function FormatBar({ onInsert, textareaRef }) {
  function wrap(before, after) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const text = ta.value;
    const selected = text.slice(start, end) || 'text';
    const newText = text.slice(0, start) + before + selected + (after || before) + text.slice(end);
    onInsert(newText, start + before.length, start + before.length + selected.length);
  }

  const btnClass = "p-1.5 rounded hover:bg-gray-100 text-gray-500 hover:text-gray-800 transition-colors";
  return (
    <div className="flex items-center gap-0.5 px-1 py-1 border-b" style={{ borderColor: 'var(--brand-border)' }}>
      <button type="button" onClick={() => wrap('**')} className={btnClass} title="Bold"><Bold size={13} /></button>
      <button type="button" onClick={() => wrap('*')} className={btnClass} title="Italic"><Italic size={13} /></button>
      <button type="button" onClick={() => wrap('\n- ', '')} className={btnClass} title="Bullet"><List size={13} /></button>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function UpdatesPanel({ productionId, onClose, inline = false }) {
  const { user, isAdmin } = useAuth();
  const { addNotification } = useNotifications();
  const [comments, setComments] = useState([]);
  const [body, setBody] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [showLinks, setShowLinks] = useState(false);
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

  function insertLink(markdown) {
    setBody(b => b + ' ' + markdown + ' ');
    setShowLinks(false);
    textareaRef.current?.focus();
  }

  function handleFormatInsert(newFullText, selStart, selEnd) {
    setBody(newFullText);
    setTimeout(() => {
      const ta = textareaRef.current;
      if (ta) { ta.setSelectionRange(selStart, selEnd); ta.focus(); }
    }, 0);
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
          <div key={comment.id} className="flex gap-3 group animate-fadeIn">
            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5 shadow-sm"
              style={{ background: 'var(--brand-accent)' }}
            >
              {comment.author?.[0] || '?'}
            </div>

            <div className="flex-1 min-w-0 bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3.5 py-2.5">
              <div className="flex items-baseline gap-2 flex-wrap">
                <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{comment.author}</span>
                <span className="text-[10px] text-gray-400">{formatIST(comment.created_at)}</span>
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
                <div className="text-sm text-gray-700 dark:text-gray-300 mt-1 whitespace-pre-wrap break-words leading-relaxed">
                  {renderBody(comment.body)}
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                {(user?.id === comment.user_id || isAdmin) && !editingId && (
                  <>
                    <button onClick={() => handleEdit(comment.id, comment.body)} className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
                      <Pencil size={9} /> Edit
                    </button>
                    <button onClick={() => handleDelete(comment.id)} className="text-[10px] text-red-400 hover:text-red-600 flex items-center gap-1">
                      <Trash2 size={9} /> Delete
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
          {/* Format toolbar */}
          <FormatBar onInsert={handleFormatInsert} textareaRef={textareaRef} />

          <div className="flex gap-2 items-end mt-1">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={body}
                onChange={e => setBody(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e); }
                  if (e.key === '@') setShowMentions(true);
                }}
                placeholder="Leave an update… **bold** *italic* - bullet @mention [link](url)"
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

              {/* Link Picker */}
              {showLinks && (
                <LinkPicker
                  productionId={productionId}
                  onInsert={insertLink}
                  onClose={() => setShowLinks(false)}
                />
              )}
            </div>

            <div className="flex flex-col gap-1 flex-shrink-0">
              <button
                type="button"
                onClick={() => { setShowMentions(s => !s); setShowLinks(false); }}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Mention someone"
              >
                <AtSign size={15} />
              </button>
              <button
                type="button"
                onClick={() => { setShowLinks(s => !s); setShowMentions(false); }}
                className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Attach a link"
              >
                <Link2 size={15} />
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
      <div className="drawer-panel" style={{ width: 440 }}>
        {content}
      </div>
    </>
  );
}

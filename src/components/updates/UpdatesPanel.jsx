import { useState, useEffect, useRef } from 'react';
import { X, Send, AtSign, Trash2, Pencil, Check, Link2, Bold, Italic, List, ListOrdered, Strikethrough, Code, Heading2, Quote, Minus, Highlighter, ExternalLink } from 'lucide-react';
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

// ─── Rich text rendering (markdown-like) ────────────────────────────────────
function renderBody(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Horizontal rule
    if (/^---+$/.test(line.trim())) {
      elements.push(<hr key={i} className="my-2 border-t" style={{ borderColor: 'var(--brand-border)' }} />);
      i++; continue;
    }
    // Heading ## text
    if (line.match(/^##\s/)) {
      elements.push(<div key={i} className="text-sm font-bold mt-2 mb-1" style={{ color: 'var(--brand-primary)' }}>{formatInline(line.replace(/^##\s/, ''))}</div>);
      i++; continue;
    }
    // Blockquote > text
    if (line.match(/^>\s/)) {
      elements.push(
        <div key={i} className="border-l-3 pl-3 my-1 text-gray-500 italic" style={{ borderLeftWidth: 3, borderLeftColor: 'var(--brand-accent)' }}>
          {formatInline(line.replace(/^>\s/, ''))}
        </div>
      );
      i++; continue;
    }
    // Numbered list 1. text
    if (line.match(/^\d+\.\s/)) {
      const num = line.match(/^(\d+)\.\s/)[1];
      elements.push(
        <div key={i} className="flex gap-2 ml-2">
          <span className="text-gray-400 font-mono text-xs mt-0.5 w-4 text-right shrink-0">{num}.</span>
          <span>{formatInline(line.replace(/^\d+\.\s/, ''))}</span>
        </div>
      );
      i++; continue;
    }
    // Bullet list - text or * text
    if (line.match(/^[\-\*•]\s/)) {
      elements.push(<li key={i} className="ml-4 list-disc">{formatInline(line.replace(/^[\-\*•]\s/, ''))}</li>);
      i++; continue;
    }
    // Code block ```
    if (line.trim() === '```') {
      const codeLines = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '```') {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={`code-${i}`} className="bg-gray-100 dark:bg-gray-800 rounded-lg px-3 py-2 my-1 text-xs font-mono overflow-x-auto" style={{ borderColor: 'var(--brand-border)', border: '1px solid var(--brand-border)' }}>
          {codeLines.join('\n')}
        </pre>
      );
      i++; continue;
    }
    // Regular line
    elements.push(<div key={i}>{line ? formatInline(line) : <br />}</div>);
    i++;
  }
  return elements;
}

function formatInline(text) {
  if (!text) return '';
  const parts = [];
  let key = 0;
  // Order matters: longer patterns first
  const regex = /(~~(.+?)~~|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`|==(.+?)==|@([\w\s]+?)(?=\s|$|@)|\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(<span key={key++}>{text.slice(lastIndex, match.index)}</span>);
    if (match[2]) parts.push(<span key={key++} className="line-through text-gray-400">{match[2]}</span>); // ~~strikethrough~~
    else if (match[3]) parts.push(<strong key={key++} className="font-bold">{match[3]}</strong>); // **bold**
    else if (match[4]) parts.push(<em key={key++} className="italic">{match[4]}</em>); // *italic*
    else if (match[5]) parts.push(<code key={key++} className="bg-gray-100 dark:bg-gray-700 text-pink-600 dark:text-pink-400 px-1 py-0.5 rounded text-xs font-mono">{match[5]}</code>); // `code`
    else if (match[6]) parts.push(<mark key={key++} className="bg-yellow-200 dark:bg-yellow-800/40 px-0.5 rounded">{match[6]}</mark>); // ==highlight==
    else if (match[7]) parts.push(<span key={key++} className="text-blue-500 font-medium bg-blue-50 dark:bg-blue-900/30 rounded px-0.5">@{match[7]}</span>); // @mention
    else if (match[8] && match[9]) parts.push(
      <a key={key++} href={match[9]} target="_blank" rel="noopener noreferrer"
        className="text-blue-600 hover:underline inline-flex items-center gap-0.5">
        {match[8]} <ExternalLink size={10} />
      </a>
    ); // [link](url)
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(<span key={key++}>{text.slice(lastIndex)}</span>);
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

  function insertLine(prefix) {
    const ta = textareaRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const text = ta.value;
    const beforeCursor = text.slice(0, start);
    const needsNewline = beforeCursor.length > 0 && !beforeCursor.endsWith('\n') ? '\n' : '';
    const newText = beforeCursor + needsNewline + prefix + text.slice(start);
    onInsert(newText, start + needsNewline.length + prefix.length, start + needsNewline.length + prefix.length);
  }

  const btnClass = "p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors";
  const sep = <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-0.5" />;

  return (
    <div className="flex items-center gap-0 px-1 py-1 border-b flex-wrap" style={{ borderColor: 'var(--brand-border)' }}>
      <button type="button" onClick={() => wrap('**')} className={btnClass} title="Bold (Ctrl+B)"><Bold size={13} /></button>
      <button type="button" onClick={() => wrap('*')} className={btnClass} title="Italic (Ctrl+I)"><Italic size={13} /></button>
      <button type="button" onClick={() => wrap('~~')} className={btnClass} title="Strikethrough"><Strikethrough size={13} /></button>
      <button type="button" onClick={() => wrap('`')} className={btnClass} title="Inline Code"><Code size={13} /></button>
      <button type="button" onClick={() => wrap('==')} className={btnClass} title="Highlight"><Highlighter size={13} /></button>
      {sep}
      <button type="button" onClick={() => insertLine('## ')} className={btnClass} title="Heading"><Heading2 size={13} /></button>
      <button type="button" onClick={() => insertLine('- ')} className={btnClass} title="Bullet List"><List size={13} /></button>
      <button type="button" onClick={() => insertLine('1. ')} className={btnClass} title="Numbered List"><ListOrdered size={13} /></button>
      <button type="button" onClick={() => insertLine('> ')} className={btnClass} title="Quote"><Quote size={13} /></button>
      <button type="button" onClick={() => insertLine('---')} className={btnClass} title="Divider"><Minus size={13} /></button>
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
                  // Keyboard shortcuts for formatting
                  if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
                    e.preventDefault();
                    const ta = e.target;
                    const s = ta.selectionStart, end = ta.selectionEnd;
                    const sel = body.slice(s, end) || 'text';
                    setBody(body.slice(0, s) + '**' + sel + '**' + body.slice(end));
                  }
                  if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
                    e.preventDefault();
                    const ta = e.target;
                    const s = ta.selectionStart, end = ta.selectionEnd;
                    const sel = body.slice(s, end) || 'text';
                    setBody(body.slice(0, s) + '*' + sel + '*' + body.slice(end));
                  }
                }}
                placeholder="Type an update… Ctrl+B bold, Ctrl+I italic, Shift+Enter new line"
                rows={3}
                className="brand-input text-sm resize-y"
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

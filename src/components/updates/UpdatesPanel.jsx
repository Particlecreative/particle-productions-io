import { useState, useEffect, useRef, useCallback } from 'react';
import { X, Send, AtSign, Trash2, Pencil, Check, Link2, Bold, Italic, List, ListOrdered, Palette, ExternalLink, Paperclip, ChevronDown } from 'lucide-react';
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
import { apiGet } from '../../lib/apiClient';
import { formatIST, nowISOString } from '../../lib/timezone';
import clsx from 'clsx';
import DOMPurify from 'dompurify';

// ─── Sanitize HTML (DOMPurify — safe against XSS) ───────────────────────────
function sanitizeHTML(html) {
  if (!html) return '';
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br', 'ul', 'ol', 'li', 'span', 'blockquote', 'code', 'pre'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style'],
    ALLOW_DATA_ATTR: false,
    FORCE_BODY: false,
  });
}

// ─── Color picker popover ───────────────────────────────────────────────────
const COLORS = [
  { name: 'Black', value: '#000000' },
  { name: 'Red', value: '#dc2626' },
  { name: 'Blue', value: '#2563eb' },
  { name: 'Green', value: '#16a34a' },
  { name: 'Orange', value: '#ea580c' },
  { name: 'Purple', value: '#9333ea' },
];

function ColorPicker({ onSelect, onClose }) {
  return (
    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-gray-800 border rounded-lg shadow-xl z-30 p-2 flex gap-1.5"
      style={{ borderColor: 'var(--brand-border)' }}>
      {COLORS.map(c => (
        <button
          key={c.value}
          type="button"
          onClick={() => { onSelect(c.value); onClose(); }}
          className="w-6 h-6 rounded-full border-2 border-white shadow-sm hover:scale-110 transition-transform"
          style={{ background: c.value }}
          title={c.name}
        />
      ))}
    </div>
  );
}

// ─── Rich text formatting toolbar ───────────────────────────────────────────
function RichFormatBar({ editorRef }) {
  const [showColor, setShowColor] = useState(false);

  function execFormat(cmd, value) {
    document.execCommand(cmd, false, value || null);
    editorRef.current?.focus();
  }

  function handleLink() {
    const sel = window.getSelection();
    const selectedText = sel?.toString() || '';
    const url = prompt('Enter URL:', 'https://');
    if (url) {
      if (selectedText) {
        execFormat('createLink', url);
        // Make the link open in new tab
        setTimeout(() => {
          const links = editorRef.current?.querySelectorAll('a');
          if (links) {
            links.forEach(a => {
              if (a.href === url) {
                a.setAttribute('target', '_blank');
                a.setAttribute('rel', 'noopener noreferrer');
              }
            });
          }
        }, 0);
      } else {
        const label = prompt('Link text:', url);
        execFormat('insertHTML', `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:underline;">${label || url}</a>`);
      }
    }
  }

  const btnClass = "p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 transition-colors flex items-center justify-center";

  return (
    <div className="flex items-center gap-0.5 px-2 py-1 border-b flex-wrap" style={{ borderColor: 'var(--brand-border)', minHeight: 28 }}>
      <button type="button" onClick={() => execFormat('bold')} className={btnClass} title="Bold">
        <Bold size={13} strokeWidth={3} />
      </button>
      <button type="button" onClick={() => execFormat('italic')} className={btnClass} title="Italic">
        <Italic size={13} />
      </button>
      <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-0.5" />
      <button type="button" onClick={() => execFormat('insertUnorderedList')} className={btnClass} title="Bullet List">
        <List size={13} />
      </button>
      <button type="button" onClick={() => execFormat('insertOrderedList')} className={btnClass} title="Numbered List">
        <ListOrdered size={13} />
      </button>
      <div className="w-px h-4 bg-gray-200 dark:bg-gray-600 mx-0.5" />
      <div className="relative">
        <button type="button" onClick={() => setShowColor(s => !s)} className={btnClass} title="Text Color">
          <Palette size={13} />
        </button>
        {showColor && (
          <ColorPicker
            onSelect={color => execFormat('foreColor', color)}
            onClose={() => setShowColor(false)}
          />
        )}
      </div>
      <button type="button" onClick={handleLink} className={btnClass} title="Insert Link">
        <Link2 size={13} />
      </button>
    </div>
  );
}

// ─── Link attachment picker ─────────────────────────────────────────────────
function LinkAttachPicker({ productionId, onAttach, onClose }) {
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

  function handlePickExisting(link) {
    onAttach({ url: link.url, title: link.label || link.url });
  }

  async function handleAddNew() {
    if (!newUrl.trim()) return;
    const title = newLabel.trim() || newUrl;
    if (saveToTree) {
      try {
        await Promise.resolve(createLink({
          production_id: productionId,
          url: newUrl,
          title,
          category,
        }));
      } catch (err) {
        console.warn('Failed to save link to tree:', err);
      }
    }
    onAttach({ url: newUrl, title });
  }

  const CATEGORIES = ['General', 'Concepts', 'Scripts', 'Pre-Production', 'Production', 'Post', 'Delivery', 'Admin'];

  return (
    <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-gray-800 border rounded-xl shadow-xl z-20 w-72 max-h-72 overflow-hidden"
      style={{ borderColor: 'var(--brand-border)' }}>
      {/* Tabs */}
      <div className="flex border-b text-xs" style={{ borderColor: 'var(--brand-border)' }}>
        <button onClick={() => setMode('existing')} className={clsx('flex-1 py-2 font-semibold', mode === 'existing' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400')}>
          From Production Links
        </button>
        <button onClick={() => setMode('new')} className={clsx('flex-1 py-2 font-semibold', mode === 'new' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-400')}>
          New Link
        </button>
      </div>

      {mode === 'existing' ? (
        <div className="max-h-48 overflow-y-auto">
          {links.length === 0 && <div className="text-xs text-gray-400 p-3 text-center">No links in this production yet</div>}
          {links.map(l => (
            <button key={l.id} onClick={() => handlePickExisting(l)}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left border-b"
              style={{ borderColor: 'var(--brand-border)' }}>
              <Link2 size={12} className="text-blue-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="truncate font-medium text-gray-700 dark:text-gray-200">{l.label || l.url}</div>
                {l.category && <div className="text-[10px] text-gray-400">{l.category}</div>}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="p-3 space-y-2">
          <input className="brand-input text-xs" placeholder="URL" value={newUrl} onChange={e => setNewUrl(e.target.value)} />
          <input className="brand-input text-xs" placeholder="Title (optional)" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer">
            <input type="checkbox" checked={saveToTree} onChange={e => setSaveToTree(e.target.checked)} className="rounded" />
            Save to Link Tree?
          </label>
          {saveToTree && (
            <select className="brand-input text-xs" value={category} onChange={e => setCategory(e.target.value)}>
              {CATEGORIES.map(c => <option key={c}>{c}</option>)}
            </select>
          )}
          <button type="button" onClick={handleAddNew} className="btn-cta text-xs w-full py-1.5">Attach Link</button>
        </div>
      )}

      <button onClick={onClose} className="w-full px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-t"
        style={{ borderColor: 'var(--brand-border)' }}>
        Cancel
      </button>
    </div>
  );
}

// ─── Attached link cards (shown below editor before posting) ────────────────
function AttachedLinkCards({ links, onRemove }) {
  if (!links.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {links.map((link, idx) => (
        <div key={idx}
          className="flex items-center gap-2 border rounded-lg px-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800"
          style={{ borderColor: 'var(--brand-border)' }}>
          <Link2 size={11} className="text-blue-500 shrink-0" />
          <span className="text-gray-700 dark:text-gray-300 font-medium truncate max-w-[160px]">{link.title}</span>
          <button type="button" onClick={() => onRemove(idx)} className="text-gray-400 hover:text-red-500 ml-1">
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Render link cards in posted updates ────────────────────────────────────
function PostedLinkCards({ html }) {
  // Extract link cards from the update-links div in HTML
  const match = html?.match(/<div class="update-links">([\s\S]*?)<\/div>\s*$/);
  if (!match) return null;
  const linkRegex = /<a\s+href="([^"]*)"[^>]*class="update-link-card"[^>]*>([^<]*)<\/a>/g;
  const cards = [];
  let m;
  while ((m = linkRegex.exec(match[1])) !== null) {
    cards.push({ url: m[1], title: m[2] });
  }
  if (!cards.length) return null;
  return (
    <div className="flex flex-wrap gap-2 mt-2">
      {cards.map((link, idx) => (
        <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer"
          className="flex items-start gap-2 border rounded-lg px-3 py-2 text-xs hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors max-w-[240px]"
          style={{ borderColor: 'var(--brand-border)' }}>
          <Link2 size={12} className="text-blue-500 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <div className="font-medium text-gray-700 dark:text-gray-200 truncate">{link.title}</div>
            <div className="text-[10px] text-gray-400 truncate">{link.url}</div>
          </div>
        </a>
      ))}
    </div>
  );
}

// ─── Get body HTML without the link cards section ───────────────────────────
function getBodyWithoutLinks(html) {
  if (!html) return '';
  return html.replace(/<div class="update-links">[\s\S]*?<\/div>\s*$/, '').trim();
}

// ─── Main component ─────────────────────────────────────────────────────────
export default function UpdatesPanel({ productionId, onClose, inline = false }) {
  const { user, isAdmin } = useAuth();
  const { addNotification } = useNotifications();
  const [comments, setComments] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [editBody, setEditBody] = useState('');
  const [showMentions, setShowMentions] = useState(false);
  const [mentionSearch, setMentionSearch] = useState('');
  const [allUsers, setAllUsers] = useState([]);
  const [showLinks, setShowLinks] = useState(false);
  const [attachedLinks, setAttachedLinks] = useState([]);
  const editorRef = useRef(null);
  const editEditorRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    Promise.resolve(getComments(productionId)).then(r => setComments(Array.isArray(r) ? r : []));
    // Fetch real users for @mentions
    apiGet('/users').then(u => setAllUsers(Array.isArray(u) ? u.filter(x => x.active !== false) : [])).catch(() => {});
  }, [productionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  async function refresh() {
    const r = await Promise.resolve(getComments(productionId));
    setComments(Array.isArray(r) ? r : []);
  }

  function getEditorHTML() {
    return editorRef.current?.innerHTML || '';
  }

  function buildLinksHTML(links) {
    if (!links.length) return '';
    const anchors = links.map(l =>
      `<a href="${l.url}" target="_blank" rel="noopener noreferrer" class="update-link-card">${l.title}</a>`
    ).join('');
    return `<div class="update-links">${anchors}</div>`;
  }

  function handleSubmit(e) {
    e.preventDefault();
    const rawHTML = getEditorHTML().trim();
    if (!rawHTML && !attachedLinks.length) return;

    // Extract @mentions from data-mention attributes (reliable, no regex issues)
    const mentionEls = editorRef.current?.querySelectorAll('[data-mention]') || [];
    const mentions = [...mentionEls].map(el => el.getAttribute('data-mention')).filter(Boolean);

    const body = rawHTML + buildLinksHTML(attachedLinks);

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
      const mentioned = allUsers.find(u => u.name?.toLowerCase() === name.toLowerCase());
      if (mentioned && mentioned.id !== user?.id) {
        addNotification('mention', `${user?.name} mentioned you in a comment`, productionId);
      }
    });

    // Clear editor
    if (editorRef.current) editorRef.current.innerHTML = '';
    setAttachedLinks([]);
    refresh();
  }

  function handleEdit(id, currentBody) {
    setEditingId(id);
    setEditBody(currentBody);
    setTimeout(() => {
      if (editEditorRef.current) {
        editEditorRef.current.innerHTML = getBodyWithoutLinks(currentBody);
      }
    }, 0);
  }

  function handleSaveEdit(id) {
    const html = editEditorRef.current?.innerHTML || editBody;
    // Preserve any existing link cards
    const existingLinks = editBody.match(/<div class="update-links">[\s\S]*?<\/div>\s*$/)?.[0] || '';
    updateComment(id, html + existingLinks);
    setEditingId(null);
    refresh();
  }

  function handleDelete(id) {
    if (!confirm('Delete this comment?')) return;
    deleteComment(id);
    refresh();
  }

  function insertMention(name) {
    if (editorRef.current) {
      document.execCommand('insertHTML', false, `<span class="mention-tag" data-mention="${name}" style="color:#3b82f6;font-weight:600;background:#eff6ff;padding:1px 4px;border-radius:4px;" contenteditable="false">@${name}</span>&nbsp;`);
      editorRef.current.focus();
    }
    setShowMentions(false);
    setMentionSearch('');
  }

  function handleAttachLink(link) {
    setAttachedLinks(prev => [...prev, link]);
    setShowLinks(false);
  }

  function removeAttachedLink(idx) {
    setAttachedLinks(prev => prev.filter((_, i) => i !== idx));
  }

  function handleEditorKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
    if (e.key === '@') {
      setShowMentions(true);
      setMentionSearch('');
    }
    // Ctrl/Cmd+B for bold
    if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
      e.preventDefault();
      document.execCommand('bold', false, null);
    }
    // Ctrl/Cmd+I for italic
    if ((e.metaKey || e.ctrlKey) && e.key === 'i') {
      e.preventDefault();
      document.execCommand('italic', false, null);
    }
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
                  <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--brand-border)' }}>
                    <RichFormatBar editorRef={editEditorRef} />
                    <div
                      ref={editEditorRef}
                      contentEditable
                      className="brand-input min-h-[60px] p-3 outline-none text-sm border-0"
                      style={{ whiteSpace: 'pre-wrap' }}
                      suppressContentEditableWarning
                    />
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => setEditingId(null)} className="btn-secondary text-xs py-1">Cancel</button>
                    <button onClick={() => handleSaveEdit(comment.id)} className="btn-cta text-xs py-1">Save</button>
                  </div>
                </div>
              ) : (
                <>
                  <div
                    className="text-sm text-gray-700 dark:text-gray-300 mt-1 break-words leading-relaxed update-body-rendered"
                    dangerouslySetInnerHTML={{ __html: sanitizeHTML(getBodyWithoutLinks(comment.body)) }}
                  />
                  <PostedLinkCards html={comment.body} />
                </>
              )}

              {/* Actions */}
              <div className="flex gap-2 mt-1.5 sm:opacity-0 opacity-60 sm:group-hover:opacity-100 transition-opacity">
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
          <div className="border rounded-lg overflow-hidden" style={{ borderColor: 'var(--brand-border)' }}>
            {/* Rich text toolbar */}
            <RichFormatBar editorRef={editorRef} />

            {/* ContentEditable editor */}
            <div
              ref={editorRef}
              contentEditable
              className="min-h-[80px] p-3 outline-none text-sm bg-white dark:bg-gray-900"
              style={{ whiteSpace: 'pre-wrap', color: 'var(--brand-text)' }}
              onKeyDown={handleEditorKeyDown}
              data-placeholder="Type an update... Ctrl+B bold, Ctrl+I italic, Shift+Enter new line"
              suppressContentEditableWarning
            />
          </div>

          {/* Attached link cards preview */}
          <AttachedLinkCards links={attachedLinks} onRemove={removeAttachedLink} />

          <div className="flex gap-2 items-center mt-2">
            <div className="flex-1 relative flex items-center gap-1">
              <button
                type="button"
                onClick={() => { setShowMentions(s => !s); setShowLinks(false); }}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors"
                title="Mention someone"
              >
                <AtSign size={15} />
              </button>
              <button
                type="button"
                onClick={() => { setShowLinks(s => !s); setShowMentions(false); }}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 hover:text-gray-600 transition-colors flex items-center gap-1"
                title="Attach a link"
              >
                <Paperclip size={15} />
                <span className="text-xs text-gray-400">Attach Link</span>
              </button>

              {/* Mention Dropdown */}
              {showMentions && (
                <div className="absolute bottom-full left-0 mb-1 bg-white dark:bg-gray-800 border rounded-xl shadow-xl overflow-hidden z-10 w-56"
                  style={{ borderColor: 'var(--brand-border)' }}>
                  <div className="px-2 py-1.5 border-b" style={{ borderColor: 'var(--brand-border)' }}>
                    <input autoFocus value={mentionSearch} onChange={e => setMentionSearch(e.target.value)}
                      placeholder="Search people…" className="w-full text-xs border-0 outline-none bg-transparent text-gray-700 placeholder:text-gray-400"
                      onKeyDown={e => { if (e.key === 'Escape') { setShowMentions(false); setMentionSearch(''); } }} />
                  </div>
                  <div className="max-h-40 overflow-y-auto">
                  {allUsers
                    .filter(u => !mentionSearch || u.name?.toLowerCase().includes(mentionSearch.toLowerCase()))
                    .map(u => (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => insertMention(u.name)}
                      className="flex items-center gap-2 w-full px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 text-left"
                    >
                      <div
                        className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                        style={{ background: 'var(--brand-accent)' }}
                      >
                        {u.name?.[0]?.toUpperCase() || '?'}
                      </div>
                      <span className="truncate">{u.name}</span>
                      <span className="text-[9px] text-gray-400 ml-auto shrink-0">{u.role}</span>
                    </button>
                  ))}
                  {allUsers.length === 0 && <div className="px-3 py-2 text-xs text-gray-400">Loading…</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => { setShowMentions(false); setMentionSearch(''); }}
                    className="w-full px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 border-t"
                    style={{ borderColor: 'var(--brand-border)' }}
                  >
                    Cancel
                  </button>
                </div>
              )}

              {/* Link Attachment Picker */}
              {showLinks && (
                <LinkAttachPicker
                  productionId={productionId}
                  onAttach={handleAttachLink}
                  onClose={() => setShowLinks(false)}
                />
              )}
            </div>

            <button
              type="submit"
              className="p-2 rounded-lg text-white transition-colors"
              style={{ background: 'var(--brand-accent)' }}
            >
              <Send size={15} />
            </button>
          </div>
        </form>
      </div>

      {/* Placeholder styling for contentEditable */}
      <style>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        .update-body-rendered a {
          color: #2563eb;
          text-decoration: underline;
        }
        .update-body-rendered a:hover {
          color: #1d4ed8;
        }
        .update-body-rendered ul {
          list-style-type: disc;
          padding-left: 1.5em;
          margin: 0.25em 0;
        }
        .update-body-rendered ol {
          list-style-type: decimal;
          padding-left: 1.5em;
          margin: 0.25em 0;
        }
        .update-body-rendered li {
          margin: 0.1em 0;
        }
      `}</style>
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

import { useState, useEffect, useRef } from 'react';
import { X, Trash2, Send, AtSign, Link2, Copy, Check } from 'lucide-react';
import clsx from 'clsx';
import { getTaskComments, addTaskComment } from '../../lib/dataService';
import SearchSelect from './SearchSelect';
import { PRIORITIES, PRIORITY_COLORS, statusColor, Avatar, timeAgo, userColor } from './taskUtils';

// Highlight @mentions of known users inside a comment body
function CommentBody({ body, users }) {
  const names = users.map(u => u.name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!names.length) return <p className="text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{body}</p>;
  const pattern = new RegExp(`@(${names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');
  // split with a capture group → odd indexes are the matched names
  const parts = String(body).split(pattern);
  return (
    <p className="text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap">
      {parts.map((part, i) =>
        i % 2 === 1
          ? <span key={i} className="font-bold" style={{ color: userColor(part) }}>@{part}</span>
          : part
      )}
    </p>
  );
}

export default function TaskModal({ task, statuses, users, productions, currentUser, canEdit, focusComments = false, onSave, onDelete, onDuplicate, onClose, onCommentPosted }) {
  const [linkCopied, setLinkCopied] = useState(false);
  const isNew = !task?.id;
  const [form, setForm] = useState({
    title: task?.title || '',
    description: task?.description || '',
    status: task?.status || 'Not Started',
    priority: task?.priority || 'Medium',
    due_date: task?.due_date ? String(task.due_date).slice(0, 10) : '',
    assignee_id: task?.assignee_id || '',
    production_id: task?.production_id || '',
  });
  const [saving, setSaving] = useState(false);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [mentionIds, setMentionIds] = useState([]);
  const commentInputRef = useRef(null);
  const commentsRef = useRef(null);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (isNew) return;
    Promise.resolve(getTaskComments(task.id)).then(c => setComments(Array.isArray(c) ? c : []));
  }, [task?.id, isNew]);

  // When opened from a card's comment icon, jump straight to the thread
  useEffect(() => {
    if (focusComments && !isNew) {
      setTimeout(() => {
        commentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        commentInputRef.current?.focus();
      }, 100);
    }
  }, [focusComments, isNew]);

  // ── @mention dropdown state ──
  const mentionMatch = newComment.match(/@(\w*)$/);
  const mentionCandidates = mentionMatch
    ? users.filter(u => u.name?.toLowerCase().includes(mentionMatch[1].toLowerCase())).slice(0, 5)
    : [];

  function insertMention(u) {
    setNewComment(prev => prev.replace(/@\w*$/, `@${u.name} `));
    setMentionIds(prev => prev.includes(u.id) ? prev : [...prev, u.id]);
    commentInputRef.current?.focus();
  }

  async function handleSave() {
    if (!form.title.trim() || saving) return;
    setSaving(true);
    try {
      await onSave({
        ...form,
        title: form.title.trim(),
        due_date: form.due_date || null,
        assignee_id: form.assignee_id || null,
        production_id: form.production_id || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handlePostComment() {
    if (!newComment.trim() || posting) return;
    setPosting(true);
    try {
      // Only send mentions whose @Name is still present in the final text
      const mentions = mentionIds.filter(id => {
        const u = users.find(x => x.id === id);
        return u && newComment.includes(`@${u.name}`);
      });
      await Promise.resolve(addTaskComment(task.id, newComment.trim(), currentUser?.id, currentUser?.name, mentions));
      setNewComment('');
      setMentionIds([]);
      const c = await Promise.resolve(getTaskComments(task.id));
      setComments(Array.isArray(c) ? c : []);
      onCommentPosted?.(task.id);
    } finally {
      setPosting(false);
    }
  }

  const inputCls = 'w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-[var(--brand-accent)] disabled:opacity-60';
  const labelCls = 'text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 block';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-2 sm:p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">{isNew ? 'New Task' : 'Edit Task'}</h2>
          <div className="flex items-center gap-1">
            {!isNew && (
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(`${window.location.origin}/tasks?task=${task.id}`);
                  setLinkCopied(true);
                  setTimeout(() => setLinkCopied(false), 1500);
                }}
                className="p-2 rounded-lg text-gray-400 hover:text-[var(--brand-accent)] hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                title="Copy link to this task"
              >
                {linkCopied ? <Check size={15} className="text-green-500" /> : <Link2 size={15} />}
              </button>
            )}
            {!isNew && canEdit && onDuplicate && (
              <button
                onClick={() => { onDuplicate(task); onClose(); }}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Duplicate task"
              >
                <Copy size={15} />
              </button>
            )}
            {!isNew && canEdit && (
              <button
                onClick={() => { onDelete(task.id); onClose(); }}
                className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                title="Delete task"
              >
                <Trash2 size={15} />
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Title */}
          <div>
            <label className={labelCls}>Title *</label>
            <input
              className={inputCls}
              value={form.title}
              onChange={e => set('title', e.target.value)}
              placeholder="What needs to be done?"
              disabled={!canEdit}
              autoFocus={isNew}
            />
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            <textarea
              className={inputCls}
              rows={3}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder="Details, links, context…"
              disabled={!canEdit}
            />
          </div>

          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Status</label>
              <select
                className={inputCls}
                style={{ borderLeftWidth: 4, borderLeftColor: statusColor(form.status) }}
                value={form.status}
                onChange={e => set('status', e.target.value)}
                disabled={!canEdit}
              >
                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select
                className={inputCls}
                style={{ borderLeftWidth: 4, borderLeftColor: PRIORITY_COLORS[form.priority] }}
                value={form.priority}
                onChange={e => set('priority', e.target.value)}
                disabled={!canEdit}
              >
                {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Assignee + Due date */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Assignee</label>
              <div className="flex items-center gap-2">
                <Avatar name={users.find(u => u.id === form.assignee_id)?.name} size={26} />
                <select className={inputCls} value={form.assignee_id} onChange={e => set('assignee_id', e.target.value)} disabled={!canEdit}>
                  <option value="">Unassigned</option>
                  {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className={labelCls}>Due Date</label>
              <input type="date" className={inputCls} value={form.due_date} onChange={e => set('due_date', e.target.value)} disabled={!canEdit} />
            </div>
          </div>

          {/* Production link — searchable by PRD code or name */}
          <div>
            <label className={labelCls}>Production</label>
            <SearchSelect
              placeholder="Search by PRD code or name…"
              disabled={!canEdit}
              value={form.production_id}
              onChange={v => set('production_id', v)}
              buttonClassName="py-2"
              items={[
                { value: '', label: 'General', sub: 'no production' },
                ...productions.map(p => ({ value: p.id, label: p.id, sub: p.project_name || 'Untitled' })),
              ]}
            />
          </div>

          {/* Meta */}
          {!isNew && (task.created_by_name || task.created_at) && (
            <p className="text-[10px] text-gray-400">
              Created{task.created_by_name ? <> by <span className="font-semibold" style={{ color: userColor(task.created_by_name) }}>{task.created_by_name}</span></> : ''}
              {task.created_at ? ` · ${timeAgo(task.created_at)}` : ''}
            </p>
          )}

          {/* Save */}
          {canEdit && (
            <button
              onClick={handleSave}
              disabled={!form.title.trim() || saving}
              className="btn-cta w-full py-2.5 text-sm disabled:opacity-50"
            >
              {saving ? 'Saving…' : isNew ? 'Create Task' : 'Save Changes'}
            </button>
          )}

          {/* Comments (existing tasks only) */}
          {!isNew && (
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800" ref={commentsRef}>
              <label className={labelCls}>Comments {comments.length > 0 && `(${comments.length})`}</label>
              <div className="space-y-2.5 max-h-52 overflow-y-auto mb-3">
                {comments.length === 0 && <p className="text-xs text-gray-400 italic py-2">No comments yet</p>}
                {comments.map(c => (
                  <div key={c.id} className="flex gap-2">
                    <Avatar name={c.author} size={24} />
                    <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-bold" style={{ color: userColor(c.author) }}>{c.author}</span>
                        <span className="text-[9px] text-gray-400" title={c.created_at ? new Date(c.created_at).toLocaleString() : ''}>
                          {timeAgo(c.created_at)}
                        </span>
                      </div>
                      <CommentBody body={c.body} users={users} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="relative">
                {/* @mention dropdown */}
                {mentionCandidates.length > 0 && (
                  <div className="absolute bottom-full mb-1 left-0 right-12 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 overflow-hidden">
                    {mentionCandidates.map(u => (
                      <button
                        key={u.id}
                        onClick={() => insertMention(u)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <Avatar name={u.name} size={20} />
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-200">{u.name}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <input
                    ref={commentInputRef}
                    className={clsx(inputCls, 'flex-1')}
                    placeholder="Write a comment… use @ to tag someone"
                    value={newComment}
                    onChange={e => setNewComment(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        if (mentionCandidates.length > 0) insertMention(mentionCandidates[0]);
                        else handlePostComment();
                      }
                    }}
                  />
                  <button
                    onClick={handlePostComment}
                    disabled={!newComment.trim() || posting}
                    className="px-3 rounded-lg bg-[var(--brand-accent)] text-white disabled:opacity-40 transition-opacity"
                    title="Post comment"
                  >
                    <Send size={14} />
                  </button>
                </div>
                <p className="flex items-center gap-1 text-[9px] text-gray-400 mt-1"><AtSign size={9} /> Tagged people get a notification</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

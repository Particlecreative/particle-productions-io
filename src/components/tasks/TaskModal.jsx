import { useState, useEffect } from 'react';
import { X, Trash2, Send } from 'lucide-react';
import clsx from 'clsx';
import { getTaskComments, addTaskComment } from '../../lib/dataService';
import { PRIORITIES, PRIORITY_COLORS, statusColor } from './taskUtils';

export default function TaskModal({ task, statuses, users, productions, currentUser, canEdit, onSave, onDelete, onClose }) {
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

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    if (isNew) return;
    Promise.resolve(getTaskComments(task.id)).then(c => setComments(Array.isArray(c) ? c : []));
  }, [task?.id, isNew]);

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
      await Promise.resolve(addTaskComment(task.id, newComment.trim(), currentUser?.id, currentUser?.name));
      setNewComment('');
      const c = await Promise.resolve(getTaskComments(task.id));
      setComments(Array.isArray(c) ? c : []);
    } finally {
      setPosting(false);
    }
  }

  const inputCls = 'w-full text-sm border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-100 focus:outline-none focus:border-[var(--brand-accent)] disabled:opacity-60';
  const labelCls = 'text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1 block';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-gray-900 z-10">
          <h2 className="text-sm font-bold text-gray-800 dark:text-gray-100">{isNew ? 'New Task' : 'Edit Task'}</h2>
          <div className="flex items-center gap-1">
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
              <select className={inputCls} value={form.assignee_id} onChange={e => set('assignee_id', e.target.value)} disabled={!canEdit}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Due Date</label>
              <input type="date" className={inputCls} value={form.due_date} onChange={e => set('due_date', e.target.value)} disabled={!canEdit} />
            </div>
          </div>

          {/* Production link */}
          <div>
            <label className={labelCls}>Production</label>
            <select className={inputCls} value={form.production_id} onChange={e => set('production_id', e.target.value)} disabled={!canEdit}>
              <option value="">General (no production)</option>
              {productions.map(p => <option key={p.id} value={p.id}>{p.id} — {p.project_name || 'Untitled'}</option>)}
            </select>
          </div>

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
            <div className="pt-2 border-t border-gray-100 dark:border-gray-800">
              <label className={labelCls}>Comments</label>
              <div className="space-y-2.5 max-h-52 overflow-y-auto mb-3">
                {comments.length === 0 && <p className="text-xs text-gray-400 italic py-2">No comments yet</p>}
                {comments.map(c => (
                  <div key={c.id} className="flex gap-2">
                    <div className="w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: 'var(--brand-accent)' }}>
                      {(c.author || '?')[0]}
                    </div>
                    <div className="flex-1 bg-gray-50 dark:bg-gray-800 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[10px] font-bold text-gray-600 dark:text-gray-300">{c.author}</span>
                        <span className="text-[9px] text-gray-400">
                          {c.created_at ? new Date(c.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}
                        </span>
                      </div>
                      <p className="text-xs text-gray-700 dark:text-gray-200 whitespace-pre-wrap">{c.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  className={clsx(inputCls, 'flex-1')}
                  placeholder="Write a comment…"
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handlePostComment(); } }}
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

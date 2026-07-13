import { useState, useEffect, useMemo } from 'react';
import { Plus, CheckSquare } from 'lucide-react';
import clsx from 'clsx';
import { useBrand } from '../context/BrandContext';
import { useAuth } from '../context/AuthContext';
import { apiGet } from '../lib/apiClient';
import { SAMPLE_USERS } from '../lib/mockData';
import {
  getTasks, addTask, updateTask, deleteTask, reorderTasks, getProductions,
} from '../lib/dataService';
import TaskKanban from '../components/tasks/TaskKanban';
import TaskTable from '../components/tasks/TaskTable';
import TaskByPerson from '../components/tasks/TaskByPerson';
import TaskModal from '../components/tasks/TaskModal';
import { getBoardStatuses } from '../components/tasks/taskUtils';

const IS_DEV = import.meta.env.DEV;

export default function Tasks() {
  const { brandId } = useBrand();
  const { user, isEditor } = useAuth();

  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [productions, setProductions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState(() => localStorage.getItem('cp_tasks_view') || 'kanban');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterProduction, setFilterProduction] = useState('');
  const [hideDone, setHideDone] = useState(false);
  const [modalTask, setModalTask] = useState(null); // null | 'new' | task object

  const statuses = useMemo(() => getBoardStatuses(), []);

  useEffect(() => { load(); }, [brandId]);

  async function load() {
    setLoading(true);
    try {
      const [t, prods, us] = await Promise.all([
        Promise.resolve(getTasks(brandId)),
        Promise.resolve(getProductions(brandId)),
        IS_DEV ? Promise.resolve(SAMPLE_USERS) : apiGet('/users'),
      ]);
      setTasks(Array.isArray(t) ? t : []);
      setProductions(Array.isArray(prods) ? prods : []);
      setUsers((Array.isArray(us) ? us : []).filter(u => u.active !== false));
    } finally {
      setLoading(false);
    }
  }

  async function refresh() {
    const t = await Promise.resolve(getTasks(brandId));
    setTasks(Array.isArray(t) ? t : []);
  }

  const filtered = useMemo(() => tasks.filter(t => {
    if (hideDone && t.status === 'Done') return false;
    if (filterAssignee === 'unassigned' && t.assignee_id) return false;
    if (filterAssignee && filterAssignee !== 'unassigned' && t.assignee_id !== filterAssignee) return false;
    if (filterProduction === 'general' && t.production_id) return false;
    if (filterProduction && filterProduction !== 'general' && t.production_id !== filterProduction) return false;
    return true;
  }), [tasks, hideDone, filterAssignee, filterProduction]);

  // ── Mutations (optimistic + resync on failure) ──
  async function handleCreate(form) {
    await Promise.resolve(addTask({ ...form, brand_id: brandId }));
    refresh();
  }

  async function handleSaveExisting(id, form) {
    setTasks(prev => prev.map(t => t.id === id
      ? { ...t, ...form, assignee_name: users.find(u => u.id === form.assignee_id)?.name || null, project_name: productions.find(p => p.id === form.production_id)?.project_name || null }
      : t));
    try { await Promise.resolve(updateTask(id, form)); } catch { /* resync below */ }
    refresh();
  }

  async function handleFieldUpdate(id, updates) {
    setTasks(prev => prev.map(t => t.id === id
      ? {
          ...t, ...updates,
          ...('assignee_id' in updates ? { assignee_name: users.find(u => u.id === updates.assignee_id)?.name || null } : {}),
          ...('production_id' in updates ? { project_name: productions.find(p => p.id === updates.production_id)?.project_name || null } : {}),
        }
      : t));
    try { await Promise.resolve(updateTask(id, updates)); } catch { refresh(); }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this task?')) return;
    setTasks(prev => prev.filter(t => t.id !== id));
    try { await Promise.resolve(deleteTask(id)); } catch { refresh(); }
  }

  // Called by the kanban after a drag: cols = { status: [orderedTaskIds] }
  async function handleTaskMove(taskId, newStatus, cols) {
    setTasks(prev => prev.map(t => {
      const st = Object.keys(cols).find(s => cols[s].includes(t.id));
      if (!st) return t;
      return { ...t, status: st, order: cols[st].indexOf(t.id) };
    }));
    try {
      await Promise.resolve(updateTask(taskId, { status: newStatus, order: cols[newStatus].indexOf(taskId) }));
      const orders = [];
      Object.values(cols).forEach(ids => ids.forEach((id, i) => { if (id !== taskId) orders.push({ id, order: i }); }));
      if (orders.length) await Promise.resolve(reorderTasks(orders));
    } catch {
      refresh();
    }
  }

  const selectCls = 'text-xs border border-gray-200 dark:border-gray-700 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 focus:outline-none focus:border-[var(--brand-accent)]';

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <CheckSquare size={20} className="text-[var(--brand-accent)]" />
          <h1 className="text-lg font-bold text-gray-800 dark:text-gray-100">Tasks</h1>
          <span className="text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
            {filtered.filter(t => t.status !== 'Done').length} open
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* Filters */}
          <select className={selectCls} value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
            <option value="">All people</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            <option value="unassigned">Unassigned</option>
          </select>
          <select className={selectCls} value={filterProduction} onChange={e => setFilterProduction(e.target.value)}>
            <option value="">All productions</option>
            <option value="general">General only</option>
            {productions.map(p => <option key={p.id} value={p.id}>{p.id} — {p.project_name || 'Untitled'}</option>)}
          </select>
          <button
            onClick={() => setHideDone(v => !v)}
            className={clsx('text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors',
              hideDone ? 'bg-green-50 border-green-300 text-green-700 dark:bg-green-900/20' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500'
            )}
          >
            {hideDone ? '✓ Hiding Done' : 'Hide Done'}
          </button>

          {/* View switcher */}
          <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {[
              { id: 'kanban', label: '▥', title: 'Board' },
              { id: 'table',  label: '☰', title: 'Table' },
              { id: 'person', label: '👤', title: 'By Person' },
            ].map(v => (
              <button key={v.id} title={v.title}
                onClick={() => { setView(v.id); localStorage.setItem('cp_tasks_view', v.id); }}
                className={clsx('px-2 py-1 rounded-md text-xs font-medium transition-colors',
                  view === v.id ? 'bg-white dark:bg-gray-700 shadow-sm text-gray-800 dark:text-gray-100' : 'text-gray-400 hover:text-gray-600'
                )}>
                {v.label}
              </button>
            ))}
          </div>

          {isEditor && (
            <button className="btn-cta flex items-center gap-1.5 text-xs px-4 py-1.5" onClick={() => setModalTask('new')}>
              <Plus size={13} strokeWidth={2.5} />
              New Task
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-20 text-sm text-gray-400">Loading tasks…</div>
      ) : view === 'kanban' ? (
        <TaskKanban
          tasks={filtered}
          statuses={statuses}
          onCardClick={t => setModalTask(t)}
          onTaskMove={handleTaskMove}
          canEdit={isEditor}
        />
      ) : view === 'table' ? (
        <TaskTable
          tasks={filtered}
          statuses={statuses}
          users={users}
          productions={productions}
          onUpdate={handleFieldUpdate}
          onDelete={handleDelete}
          onRowClick={t => setModalTask(t)}
          canEdit={isEditor}
        />
      ) : (
        <TaskByPerson tasks={filtered} users={users} onCardClick={t => setModalTask(t)} />
      )}

      {/* Modal */}
      {modalTask && (
        <TaskModal
          task={modalTask === 'new' ? null : modalTask}
          statuses={statuses}
          users={users}
          productions={productions}
          currentUser={user}
          canEdit={isEditor}
          onSave={form => modalTask === 'new' ? handleCreate(form) : handleSaveExisting(modalTask.id, form)}
          onDelete={handleDelete}
          onClose={() => setModalTask(null)}
        />
      )}
    </div>
  );
}

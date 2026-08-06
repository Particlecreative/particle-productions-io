import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, CheckSquare, Search, AlertTriangle } from 'lucide-react';
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
import SearchSelect from '../components/tasks/SearchSelect';
import { getBoardStatuses, isOverdue } from '../components/tasks/taskUtils';

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
  const [search, setSearch] = useState('');
  const [modalTask, setModalTask] = useState(null); // null | 'new' | task object
  const [modalFocusComments, setModalFocusComments] = useState(false);

  const statuses = useMemo(() => getBoardStatuses(), []);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => { load(); }, [brandId]);

  // Deep link: /tasks?task=<id> opens that task's modal (e.g. from a shared link)
  useEffect(() => {
    const tid = searchParams.get('task');
    if (!tid || loading) return;
    const t = tasks.find(x => String(x.id) === tid);
    if (t) setModalTask(t);
    searchParams.delete('task');
    setSearchParams(searchParams, { replace: true });
  }, [loading, tasks]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (search) {
      const q = search.toLowerCase();
      const hay = `${t.title} ${t.description || ''} ${t.assignee_name || ''} ${t.project_name || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }), [tasks, hideDone, filterAssignee, filterProduction, search]);

  const overdueCount = useMemo(() => tasks.filter(isOverdue).length, [tasks]);
  const myTasksActive = filterAssignee && filterAssignee === user?.id;

  function openTask(t, focusComments = false) {
    setModalFocusComments(focusComments);
    setModalTask(t);
  }

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

  async function handleDuplicate(task) {
    await Promise.resolve(addTask({
      brand_id: brandId,
      title: `${task.title} (copy)`,
      description: task.description || '',
      status: task.status,
      priority: task.priority,
      due_date: task.due_date ? String(task.due_date).slice(0, 10) : null,
      assignee_id: task.assignee_id || null,
      production_id: task.production_id || null,
    }));
    refresh();
  }

  function clearFilters() {
    setFilterAssignee(''); setFilterProduction(''); setHideDone(false); setSearch('');
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
          {overdueCount > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">
              <AlertTriangle size={10} /> {overdueCount} overdue
            </span>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              className={clsx(selectCls, 'pl-7 w-36 sm:w-44')}
              placeholder="Search tasks…"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          {/* My Tasks quick filter */}
          <button
            onClick={() => setFilterAssignee(myTasksActive ? '' : user?.id || '')}
            className={clsx('text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors',
              myTasksActive ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/20' : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500'
            )}
          >
            My Tasks
          </button>
          {/* Filters */}
          <select className={clsx(selectCls, 'max-w-[130px] sm:max-w-none')} value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)}>
            <option value="">All people</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            <option value="unassigned">Unassigned</option>
          </select>
          <SearchSelect
            className="w-[150px] sm:w-[220px]"
            placeholder="Production / PRD…"
            value={filterProduction}
            onChange={setFilterProduction}
            items={[
              { value: '', label: 'All productions' },
              { value: 'general', label: 'General only' },
              ...productions.map(p => ({ value: p.id, label: p.id, sub: p.project_name || 'Untitled' })),
            ]}
          />
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
      ) : filtered.length === 0 && tasks.length === 0 ? (
        <div className="text-center py-24">
          <CheckSquare size={40} className="mx-auto text-gray-200 dark:text-gray-700 mb-4" />
          <p className="text-sm font-semibold text-gray-500 mb-1">No tasks yet</p>
          <p className="text-xs text-gray-400 mb-5">Create your first task to start tracking work.</p>
          {isEditor && (
            <button className="btn-cta text-xs px-5 py-2" onClick={() => setModalTask('new')}>
              <Plus size={12} className="inline mr-1" /> New Task
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-24">
          <p className="text-sm font-semibold text-gray-500 mb-1">No tasks match your filters</p>
          <button onClick={clearFilters} className="text-xs text-[var(--brand-accent)] font-semibold hover:underline">
            Clear filters
          </button>
        </div>
      ) : view === 'kanban' ? (
        <TaskKanban
          tasks={filtered}
          statuses={statuses}
          onCardClick={t => openTask(t)}
          onTaskMove={handleTaskMove}
          onStatusChange={(id, status) => handleFieldUpdate(id, { status })}
          onCommentsClick={t => openTask(t, true)}
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
          onRowClick={t => openTask(t)}
          canEdit={isEditor}
        />
      ) : (
        <TaskByPerson
          tasks={filtered}
          users={users}
          statuses={statuses}
          onCardClick={t => openTask(t)}
          onStatusChange={(id, status) => handleFieldUpdate(id, { status })}
          onCommentsClick={t => openTask(t, true)}
          canEdit={isEditor}
        />
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
          focusComments={modalFocusComments}
          onSave={form => modalTask === 'new' ? handleCreate(form) : handleSaveExisting(modalTask.id, form)}
          onDelete={handleDelete}
          onDuplicate={handleDuplicate}
          onClose={() => { setModalTask(null); setModalFocusComments(false); }}
          onCommentPosted={() => refresh()}
        />
      )}
    </div>
  );
}

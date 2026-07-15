import { Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { PRIORITIES, PRIORITY_COLORS, statusColor, isOverdue, Avatar } from './taskUtils';

export default function TaskTable({ tasks, statuses, users, productions, onUpdate, onDelete, onRowClick, canEdit }) {
  const sorted = [...tasks].sort((a, b) =>
    statuses.indexOf(a.status) - statuses.indexOf(b.status) || (a.order ?? 0) - (b.order ?? 0)
  );

  const selectCls = 'text-xs bg-transparent border border-gray-200 dark:border-gray-700 rounded-md px-1.5 py-1 text-gray-700 dark:text-gray-200 dark:bg-gray-800 focus:outline-none focus:border-[var(--brand-accent)] cursor-pointer';

  return (
    <div className="brand-card rounded-xl overflow-x-auto">
      <table className="w-full text-left" style={{ minWidth: 760 }}>
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-700 text-[10px] uppercase tracking-wider text-gray-400">
            <th className="px-4 py-3">Task</th>
            <th className="px-3 py-3">Production</th>
            <th className="px-3 py-3">Assignee</th>
            <th className="px-3 py-3">Priority</th>
            <th className="px-3 py-3">Due</th>
            <th className="px-3 py-3">Status</th>
            {canEdit && <th className="px-2 py-3" />}
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={canEdit ? 7 : 6} className="px-4 py-12 text-center text-sm text-gray-400">No tasks yet</td></tr>
          )}
          {sorted.map(task => {
            const overdue = isOverdue(task);
            return (
              <tr key={task.id} className="border-b border-gray-50 dark:border-gray-800 hover:bg-gray-50/60 dark:hover:bg-gray-800/40 transition-colors">
                <td className="px-4 py-2.5 cursor-pointer" onClick={() => onRowClick?.(task)}>
                  <p className="text-xs font-bold text-gray-800 dark:text-gray-100">{task.title}</p>
                  {task.description && <p className="text-[10px] text-gray-400 truncate max-w-xs">{task.description}</p>}
                </td>
                <td className="px-3 py-2.5">
                  {canEdit ? (
                    <select className={selectCls} value={task.production_id || ''} onChange={e => onUpdate(task.id, { production_id: e.target.value || null })}>
                      <option value="">General</option>
                      {productions.map(p => <option key={p.id} value={p.id}>{p.project_name || p.id}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs text-gray-500">{task.project_name || 'General'}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Avatar name={task.assignee_name} size={20} />
                    {canEdit ? (
                      <select className={selectCls} value={task.assignee_id || ''} onChange={e => onUpdate(task.id, { assignee_id: e.target.value || null })}>
                        <option value="">Unassigned</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    ) : (
                      <span className="text-xs text-gray-500">{task.assignee_name || 'Unassigned'}</span>
                    )}
                  </div>
                </td>
                <td className="px-3 py-2.5">
                  {canEdit ? (
                    <select
                      className={selectCls}
                      style={{ color: PRIORITY_COLORS[task.priority], fontWeight: 700 }}
                      value={task.priority || 'Medium'}
                      onChange={e => onUpdate(task.id, { priority: e.target.value })}
                    >
                      {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                  ) : (
                    <span className="text-xs font-bold" style={{ color: PRIORITY_COLORS[task.priority] }}>{task.priority}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {canEdit ? (
                    <input
                      type="date"
                      className={clsx(selectCls, overdue && '!text-red-500 font-bold')}
                      value={task.due_date ? String(task.due_date).slice(0, 10) : ''}
                      onChange={e => onUpdate(task.id, { due_date: e.target.value || null })}
                    />
                  ) : (
                    <span className={clsx('text-xs', overdue ? 'text-red-500 font-bold' : 'text-gray-500')}>
                      {task.due_date ? String(task.due_date).slice(0, 10) : '—'}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {canEdit ? (
                    <select
                      className="text-[11px] font-bold rounded-full px-2.5 py-1 text-white border-0 cursor-pointer focus:outline-none"
                      style={{ background: statusColor(task.status) }}
                      value={task.status}
                      onChange={e => onUpdate(task.id, { status: e.target.value })}
                    >
                      {statuses.map(s => <option key={s} value={s} style={{ background: '#fff', color: '#111' }}>{s}</option>)}
                    </select>
                  ) : (
                    <span className="text-[11px] font-bold rounded-full px-2.5 py-1 text-white" style={{ background: statusColor(task.status) }}>{task.status}</span>
                  )}
                </td>
                {canEdit && (
                  <td className="px-2 py-2.5">
                    <button
                      onClick={() => onDelete(task.id)}
                      className="p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                      title="Delete task"
                    >
                      <Trash2 size={13} />
                    </button>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

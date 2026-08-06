import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, MessageSquare, AlignLeft } from 'lucide-react';
import clsx from 'clsx';
import { PRIORITY_COLORS, isOverdue, fmtDue, statusColor, Avatar } from './taskUtils';

// Pure display card — also used inside DragOverlay and the By-Person view.
// showStatus renders a quick-change status pill (used outside the kanban columns
// and on the kanban too, per request: change status without opening the task).
export function TaskCardInner({ task, statuses = [], onStatusChange, onCommentsClick, canEdit = false, dragging = false }) {
  const overdue = isOverdue(task);
  return (
    <div
      className={clsx(
        'bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all',
        overdue && 'border-l-[3px] border-l-red-400',
        dragging && 'shadow-lg rotate-1'
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-xs font-bold text-gray-800 dark:text-gray-100 line-clamp-2">{task.title}</p>
        <span
          className="shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded-full text-white"
          style={{ background: PRIORITY_COLORS[task.priority] || '#9ca3af' }}
        >
          {task.priority}
        </span>
      </div>
      <p className="text-[10px] text-gray-400 mb-2 truncate">
        {task.project_name || (task.production_id ? task.production_id : 'General')}
      </p>
      <div className="flex items-center justify-between gap-1.5">
        {/* Quick status change without opening the task */}
        {canEdit && statuses.length > 0 ? (
          <select
            className="text-[9px] font-bold rounded-full pl-2 pr-1 py-0.5 text-white border-0 cursor-pointer focus:outline-none max-w-[45%]"
            style={{ background: statusColor(task.status) }}
            value={task.status}
            onClick={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
            onChange={e => { e.stopPropagation(); onStatusChange?.(task.id, e.target.value); }}
          >
            {statuses.map(s => <option key={s} value={s} style={{ background: '#fff', color: '#111' }}>{s}</option>)}
          </select>
        ) : (
          <span className="text-[9px] font-bold rounded-full px-2 py-0.5 text-white" style={{ background: statusColor(task.status) }}>
            {task.status}
          </span>
        )}
        <div className="flex items-center gap-2">
          {task.description && <AlignLeft size={10} className="text-gray-300 dark:text-gray-500" title="Has description" />}
          {task.due_date && (
            <span className={clsx('flex items-center gap-1 text-[10px]', overdue ? 'text-red-500 font-bold' : 'text-gray-500')}>
              <Calendar size={10} /> {fmtDue(task.due_date)}
            </span>
          )}
          <button
            onClick={e => { e.stopPropagation(); onCommentsClick?.(task); }}
            onPointerDown={e => e.stopPropagation()}
            className={clsx(
              'flex items-center gap-0.5 text-[10px] rounded px-1 py-0.5 transition-colors',
              task.comment_count > 0
                ? 'text-[var(--brand-accent)] font-bold hover:bg-blue-50 dark:hover:bg-blue-900/20'
                : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700'
            )}
            title={task.comment_count > 0 ? `${task.comment_count} comments` : 'Add comment'}
          >
            <MessageSquare size={11} />
            {task.comment_count > 0 && task.comment_count}
          </button>
          <Avatar name={task.assignee_name} size={20} />
        </div>
      </div>
    </div>
  );
}

// Sortable wrapper used on the kanban board
export default function TaskCard({ task, statuses, onClick, onStatusChange, onCommentsClick, disabled = false }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onClick?.(task)}
      className={clsx(isDragging && 'opacity-40')}
    >
      <TaskCardInner
        task={task}
        statuses={statuses}
        onStatusChange={onStatusChange}
        onCommentsClick={onCommentsClick}
        canEdit={!disabled}
      />
    </div>
  );
}

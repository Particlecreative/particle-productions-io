import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Calendar, MessageSquare } from 'lucide-react';
import clsx from 'clsx';
import { PRIORITY_COLORS, isOverdue, fmtDue } from './taskUtils';

// Pure display card — also used inside DragOverlay
export function TaskCardInner({ task, dragging = false }) {
  const overdue = isOverdue(task);
  return (
    <div
      className={clsx(
        'bg-white dark:bg-gray-800 rounded-lg p-3 shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer hover:shadow-md hover:border-gray-300 transition-all',
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
      <p className="text-[10px] text-gray-400 mb-1.5 truncate">
        {task.project_name || (task.production_id ? task.production_id : 'General')}
      </p>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {task.due_date && (
            <span className={clsx('flex items-center gap-1 text-[10px]', overdue ? 'text-red-500 font-bold' : 'text-gray-500')}>
              <Calendar size={10} /> {fmtDue(task.due_date)}
            </span>
          )}
          {task.comment_count > 0 && (
            <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
              <MessageSquare size={10} /> {task.comment_count}
            </span>
          )}
        </div>
        {task.assignee_name ? (
          <div
            className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
            style={{ background: 'var(--brand-accent)' }}
            title={task.assignee_name}
          >
            {task.assignee_name[0]}
          </div>
        ) : (
          <div className="w-5 h-5 rounded-full border border-dashed border-gray-300 dark:border-gray-600" title="Unassigned" />
        )}
      </div>
    </div>
  );
}

// Sortable wrapper used on the kanban board
export default function TaskCard({ task, onClick, disabled = false }) {
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
      <TaskCardInner task={task} />
    </div>
  );
}

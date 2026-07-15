import { useState, useEffect } from 'react';
import {
  DndContext, DragOverlay, PointerSensor, useSensor, useSensors,
  closestCorners, useDroppable,
} from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import TaskCard, { TaskCardInner } from './TaskCard';
import { statusColor } from './taskUtils';

function KanbanColumn({ status, taskIds, tasksById, statuses, onCardClick, onStatusChange, onCommentsClick, canEdit }) {
  const { setNodeRef } = useDroppable({ id: 'col:' + status });
  return (
    <div className="shrink-0 w-[80vw] sm:w-64 snap-start bg-gray-50 dark:bg-gray-800/30 rounded-xl border-t-2" style={{ borderTopColor: statusColor(status) }}>
      <div className="px-3 py-2.5 flex items-center justify-between">
        <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">{status}</span>
        <span className="text-[10px] font-mono text-gray-400 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">{taskIds.length}</span>
      </div>
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="px-2 pb-2 space-y-2 min-h-[80px] max-h-[calc(100vh-320px)] overflow-y-auto">
          {taskIds.map(id => tasksById[id] && (
            <TaskCard
              key={id}
              task={tasksById[id]}
              statuses={statuses}
              onClick={onCardClick}
              onStatusChange={onStatusChange}
              onCommentsClick={onCommentsClick}
              disabled={!canEdit}
            />
          ))}
          {taskIds.length === 0 && (
            <p className="text-[10px] text-gray-400 text-center py-4 italic">No tasks</p>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

export default function TaskKanban({ tasks, statuses, onCardClick, onTaskMove, onStatusChange, onCommentsClick, canEdit }) {
  const [cols, setCols] = useState({});
  const [activeId, setActiveId] = useState(null);

  const tasksById = Object.fromEntries(tasks.map(t => [t.id, t]));

  // Rebuild columns from tasks whenever they change (outside an active drag)
  useEffect(() => {
    const next = {};
    statuses.forEach(s => { next[s] = []; });
    [...tasks]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .forEach(t => {
        const s = statuses.includes(t.status) ? t.status : statuses[0];
        next[s].push(t.id);
      });
    setCols(next);
  }, [tasks, statuses]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  function findContainer(id) {
    if (typeof id === 'string' && id.startsWith('col:')) return id.slice(4);
    return Object.keys(cols).find(s => cols[s].includes(id));
  }

  function handleDragOver({ active, over }) {
    if (!over) return;
    const from = findContainer(active.id);
    const to = findContainer(over.id);
    if (!from || !to || from === to) return;
    setCols(prev => {
      const fromIds = prev[from].filter(id => id !== active.id);
      const toIds = prev[to].filter(id => id !== active.id);
      let insertIdx = toIds.length;
      if (!String(over.id).startsWith('col:')) {
        const overIdx = toIds.indexOf(over.id);
        if (overIdx >= 0) insertIdx = overIdx;
      }
      toIds.splice(insertIdx, 0, active.id);
      return { ...prev, [from]: fromIds, [to]: toIds };
    });
  }

  function handleDragEnd({ active, over }) {
    setActiveId(null);
    if (!over) return;
    const to = findContainer(over.id) || findContainer(active.id);
    if (!to) return;
    let next = cols;
    if (!String(over.id).startsWith('col:') && active.id !== over.id) {
      const ids = cols[to];
      const oldIdx = ids.indexOf(active.id);
      const newIdx = ids.indexOf(over.id);
      if (oldIdx >= 0 && newIdx >= 0 && oldIdx !== newIdx) {
        next = { ...cols, [to]: arrayMove(ids, oldIdx, newIdx) };
        setCols(next);
      }
    }
    onTaskMove?.(active.id, to, next);
  }

  const board = (
    <div className="flex gap-4 overflow-x-auto pb-4 snap-x" style={{ minHeight: 400 }}>
      {statuses.map(status => (
        <KanbanColumn
          key={status}
          status={status}
          taskIds={cols[status] || []}
          tasksById={tasksById}
          statuses={statuses}
          onCardClick={onCardClick}
          onStatusChange={onStatusChange}
          onCommentsClick={onCommentsClick}
          canEdit={canEdit}
        />
      ))}
    </div>
  );

  if (!canEdit) return board;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active }) => setActiveId(active.id)}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      {board}
      <DragOverlay>
        {activeId && tasksById[activeId] ? <TaskCardInner task={tasksById[activeId]} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}

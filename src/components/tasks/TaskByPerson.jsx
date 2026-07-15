import { TaskCardInner } from './TaskCard';
import { Avatar } from './taskUtils';

export default function TaskByPerson({ tasks, users, statuses, onCardClick, onStatusChange, onCommentsClick, canEdit }) {
  // Group by assignee; Unassigned last
  const groups = [];
  users.forEach(u => {
    const theirs = tasks.filter(t => t.assignee_id === u.id);
    if (theirs.length) groups.push({ id: u.id, name: u.name, tasks: theirs });
  });
  const unassigned = tasks.filter(t => !t.assignee_id || !users.some(u => u.id === t.assignee_id));
  if (unassigned.length) groups.push({ id: null, name: 'Unassigned', tasks: unassigned });

  if (!groups.length) {
    return <div className="text-center py-16 text-sm text-gray-400">No tasks yet</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
      {groups.map(group => {
        const open = group.tasks.filter(t => t.status !== 'Done').length;
        return (
          <div key={group.id || 'unassigned'} className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-3">
            <div className="flex items-center gap-2 mb-3 px-1">
              <Avatar name={group.id ? group.name : null} size={28} />
              <span className="text-sm font-bold text-gray-700 dark:text-gray-200">{group.name}</span>
              <span className="ml-auto text-[10px] font-mono text-gray-400 bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded-full">
                {open} open / {group.tasks.length}
              </span>
            </div>
            <div className="space-y-2">
              {[...group.tasks]
                .sort((a, b) => {
                  const doneDiff = (a.status === 'Done') - (b.status === 'Done');
                  if (doneDiff) return doneDiff;
                  return String(a.due_date || '9999').localeCompare(String(b.due_date || '9999'));
                })
                .map(task => (
                  <div key={task.id} onClick={() => onCardClick?.(task)} className={task.status === 'Done' ? 'opacity-50' : ''}>
                    <TaskCardInner
                      task={task}
                      statuses={statuses}
                      onStatusChange={onStatusChange}
                      onCommentsClick={onCommentsClick}
                      canEdit={canEdit}
                    />
                  </div>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

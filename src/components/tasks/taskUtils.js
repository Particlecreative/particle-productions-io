// Shared constants + helpers for the Tasks board
import { getList, getListItemColor } from '../../lib/listService';

export const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'];

export const PRIORITY_COLORS = {
  Low:    '#9ca3af',
  Medium: '#3b82f6',
  High:   '#f59e0b',
  Urgent: '#ef4444',
};

// Preferred board column order; any extra admin-added statuses are appended
const BOARD_ORDER = ['Not Started', 'Working on it', 'Stuck', 'Done'];

export function getBoardStatuses() {
  const list = getList('lineItemStatuses').map(i => (typeof i === 'object' ? i.label : i));
  const ordered = BOARD_ORDER.filter(s => list.includes(s));
  const extras  = list.filter(s => !BOARD_ORDER.includes(s));
  return [...ordered, ...extras];
}

export function statusColor(status) {
  return getListItemColor('lineItemStatuses', status) || '#9ca3af';
}

export function isOverdue(task) {
  if (!task?.due_date || task.status === 'Done') return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return new Date(String(task.due_date).slice(0, 10) + 'T00:00:00') < today;
}

export function fmtDue(dateStr) {
  if (!dateStr) return '';
  return new Date(String(dateStr).slice(0, 10) + 'T00:00:00')
    .toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

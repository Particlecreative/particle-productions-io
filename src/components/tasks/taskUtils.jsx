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

// ── Per-user avatar colors — deterministic hash of the name into a distinct palette ──
const USER_PALETTE = [
  '#6366f1', '#ec4899', '#14b8a6', '#f59e0b', '#8b5cf6',
  '#ef4444', '#3b82f6', '#22c55e', '#f97316', '#06b6d4',
];

export function userColor(nameOrId) {
  if (!nameOrId) return '#9ca3af';
  let hash = 0;
  const s = String(nameOrId);
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  return USER_PALETTE[hash % USER_PALETTE.length];
}

export function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

// Small initial-in-circle avatar, colored per user
export function Avatar({ name, size = 20, title }) {
  if (!name) {
    return (
      <div
        className="rounded-full border border-dashed border-gray-300 dark:border-gray-600 shrink-0"
        style={{ width: size, height: size }}
        title={title || 'Unassigned'}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
      style={{ width: size, height: size, background: userColor(name), fontSize: Math.max(8, size * 0.45) }}
      title={title || name}
    >
      {name[0]}
    </div>
  );
}

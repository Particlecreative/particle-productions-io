import { useNavigate } from 'react-router-dom';
import {
  X, Bell, BellOff, Check, Trash2, Pencil, Receipt, AlertTriangle, Star,
  AtSign, MessageSquare, UserPlus, CheckSquare, FileSignature, Flag,
  Bookmark, Info, Trash,
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationsContext';
import { formatIST } from '../../lib/timezone';

// ── Per-type visual config (icon + soft color) ──────────────────────────────
const TYPE_CONFIG = {
  casting_alert:   { Icon: AlertTriangle, cls: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30' },
  casting:         { Icon: Star,          cls: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30' },
  invoice_received:{ Icon: Receipt,       cls: 'bg-green-100 text-green-600 dark:bg-green-900/30' },
  invoice:         { Icon: Receipt,       cls: 'bg-green-100 text-green-600 dark:bg-green-900/30' },
  edit:            { Icon: Pencil,        cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800' },
  delete:          { Icon: Trash,         cls: 'bg-red-100 text-red-500 dark:bg-red-900/30' },
  stage_change:    { Icon: Flag,          cls: 'bg-violet-100 text-violet-600 dark:bg-violet-900/30' },
  contract_sent:   { Icon: FileSignature, cls: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30' },
  contract_signed: { Icon: FileSignature, cls: 'bg-green-100 text-green-600 dark:bg-green-900/30' },
  mention:         { Icon: AtSign,        cls: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30' },
  task_mention:    { Icon: AtSign,        cls: 'bg-pink-100 text-pink-600 dark:bg-pink-900/30' },
  task_assigned:   { Icon: UserPlus,      cls: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30' },
  task_status:     { Icon: CheckSquare,   cls: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30' },
  task_comment:    { Icon: MessageSquare, cls: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30' },
  view_save:       { Icon: Bookmark,      cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800' },
  system:          { Icon: Info,          cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800' },
};
function configFor(type = '') {
  if (TYPE_CONFIG[type]) return TYPE_CONFIG[type];
  if (type.startsWith('task')) return { Icon: CheckSquare, cls: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30' };
  if (type.startsWith('casting')) return { Icon: AlertTriangle, cls: 'bg-amber-100 text-amber-600 dark:bg-amber-900/30' };
  if (type.startsWith('invoice')) return { Icon: Receipt, cls: 'bg-green-100 text-green-600 dark:bg-green-900/30' };
  if (type.startsWith('contract')) return { Icon: FileSignature, cls: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30' };
  return { Icon: Bell, cls: 'bg-gray-100 text-gray-500 dark:bg-gray-800' };
}

function relTime(iso) {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function dayBucket(iso) {
  const d = new Date(iso); const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return 'Earlier';
}

// Collapse repeated notifications (same type + message) into one row with a count
function collapse(notifs) {
  const sorted = [...notifs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const map = new Map();
  for (const n of sorted) {
    const sig = `${n.type}|${(n.message || '').trim()}`;
    if (!map.has(sig)) {
      map.set(sig, { ...n, count: 1, ids: [n.id], anyUnread: !n.read });
    } else {
      const g = map.get(sig);
      g.count += 1;
      g.ids.push(n.id);
      g.anyUnread = g.anyUnread || !n.read;
    }
  }
  return [...map.values()];
}

function routeFor(notif) {
  const t = notif.type || '';
  if (t.startsWith('task')) return '/tasks';
  if (t.startsWith('casting')) return '/casting-rights';
  if (notif.production_id) return `/production/${notif.production_id}`;
  return null;
}

export default function NotificationsPanel({ onClose }) {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const navigate = useNavigate();

  const groups = collapse(notifications);
  // Bucket collapsed groups by day
  const buckets = { Today: [], Yesterday: [], Earlier: [] };
  for (const g of groups) buckets[dayBucket(g.created_at)]?.push(g);

  function handleClick(group) {
    group.ids.forEach(id => markRead(id));
    const route = routeFor(group);
    if (route) navigate(route);
    onClose();
  }

  let rowIdx = 0;

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer-panel flex flex-col" style={{ width: 400 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 shrink-0" style={{ borderBottom: '1px solid var(--brand-border)' }}>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Bell size={17} style={{ color: 'var(--brand-primary)' }} />
              {unreadCount > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[var(--brand-accent)]" />}
            </div>
            <h2 className="font-black text-base" style={{ color: 'var(--brand-primary)' }}>Notifications</h2>
            {unreadCount > 0 && (
              <span className="px-2 py-0.5 text-[11px] font-bold text-white rounded-full" style={{ background: 'var(--brand-accent)' }}>
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors">
                <Check size={12} /> Mark read
              </button>
            )}
            {notifications.length > 0 && (
              <button onClick={clearAll} className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 transition-colors" title="Clear all notifications">
                <Trash2 size={12} /> Clear
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {groups.length === 0 ? (
            <div className="text-center py-20 px-6">
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gray-50 dark:bg-gray-800 flex items-center justify-center">
                <BellOff size={24} className="text-gray-300" />
              </div>
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">You're all caught up</p>
              <p className="text-xs text-gray-400 mt-0.5">New activity will show up here.</p>
            </div>
          ) : (
            ['Today', 'Yesterday', 'Earlier'].map(bucket => buckets[bucket].length > 0 && (
              <div key={bucket}>
                <div className="sticky top-0 z-10 px-5 py-1.5 bg-gray-50/90 dark:bg-gray-900/90 backdrop-blur-sm border-b border-gray-100 dark:border-gray-800">
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{bucket}</span>
                </div>
                {buckets[bucket].map(group => {
                  const { Icon, cls } = configFor(group.type);
                  return (
                    <button
                      key={group.ids[0]}
                      onClick={() => handleClick(group)}
                      style={{ animationDelay: `${Math.min(rowIdx++, 12) * 30}ms` }}
                      className={`fs-card-in w-full flex items-start gap-3 px-5 py-3.5 border-b border-gray-100 dark:border-gray-800 text-left transition-colors relative hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                        group.anyUnread ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''
                      }`}
                    >
                      {group.anyUnread && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--brand-accent)]" />}
                      <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${cls}`}>
                        <Icon size={16} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] leading-snug ${group.anyUnread ? 'font-semibold text-gray-800 dark:text-gray-100' : 'text-gray-600 dark:text-gray-300'}`}>
                          {group.message}
                        </p>
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {group.production_id && !group.type?.startsWith('task') && (
                            <span className="text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{group.production_id}</span>
                          )}
                          {group.count > 1 && (
                            <span className="text-[10px] font-bold text-gray-500 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded-full" title={`${group.count} times`}>
                              ×{group.count}
                            </span>
                          )}
                          <span className="text-[11px] text-gray-400" title={formatIST(group.created_at)}>{relTime(group.created_at)}</span>
                        </div>
                      </div>
                      {group.anyUnread && <span className="w-2 h-2 rounded-full bg-[var(--brand-accent)] shrink-0 mt-1.5" />}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
}

import { useNavigate } from 'react-router-dom';
import { X, Bell, Check, Trash2 } from 'lucide-react';
import { useNotifications } from '../../context/NotificationsContext';
import { formatIST } from '../../lib/timezone';

const NOTIF_ICONS = {
  contract_sent: '📝',
  contract_signed: '✅',
  invoice_received: '🧾',
  invoice_mismatch: '⚠️',
  mention: '💬',
  budget_overrun: '🔴',
  payment_due: '⏰',
  field_change: '✏️',
};

export default function NotificationsPanel({ onClose }) {
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useNotifications();
  const navigate = useNavigate();

  function handleClick(notif) {
    markRead(notif.id);
    if (notif.production_id) navigate(`/production/${notif.production_id}`);
    onClose();
  }

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer-panel" style={{ width: 380 }}>
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: '1px solid var(--brand-border)' }}
        >
          <div className="flex items-center gap-2">
            <Bell size={16} style={{ color: 'var(--brand-primary)' }} />
            <h2 className="font-black text-base" style={{ color: 'var(--brand-primary)' }}>
              Notifications
            </h2>
            {unreadCount > 0 && (
              <span
                className="px-2 py-0.5 text-xs font-bold text-white rounded-full"
                style={{ background: 'var(--brand-accent)' }}
              >
                {unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
              >
                <Check size={12} /> All read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1"
                title="Clear all notifications"
              >
                <Trash2 size={12} /> Clear all
              </button>
            )}
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1" style={{ maxHeight: 'calc(100vh - 80px)' }}>
          {notifications.length === 0 ? (
            <div className="text-center py-16 text-gray-300">
              <Bell size={32} className="mx-auto mb-3" />
              <p className="text-sm">No notifications yet</p>
            </div>
          ) : notifications.map(notif => (
            <button
              key={notif.id}
              onClick={() => handleClick(notif)}
              className={`w-full flex items-start gap-3 px-5 py-4 border-b border-gray-100 text-left hover:bg-gray-50 transition-colors ${
                !notif.read ? 'bg-blue-50/40' : ''
              }`}
            >
              <span className="text-lg flex-shrink-0 mt-0.5">
                {NOTIF_ICONS[notif.type] || '🔔'}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm ${!notif.read ? 'font-semibold text-gray-800' : 'text-gray-600'}`}>
                  {notif.message}
                </p>
                {notif.production_id && (
                  <p className="text-xs text-gray-400 mt-0.5">{notif.production_id}</p>
                )}
                <p className="text-xs text-gray-300 mt-0.5">{formatIST(notif.created_at)}</p>
              </div>
              {!notif.read && (
                <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-2" />
              )}
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

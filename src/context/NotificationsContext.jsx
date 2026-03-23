import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './AuthContext';
import {
  getNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  clearAllNotifications,
  generateId,
} from '../lib/dataService';
import { nowISOString } from '../lib/timezone';

const NotificationsContext = createContext(null);

export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);

  // Load / reload notifications whenever user changes
  const refresh = useCallback(() => {
    if (!user) { setNotifications([]); return; }
    const result = getNotifications(user.id);
    if (result && typeof result.then === 'function') {
      result.then(n => setNotifications(n || [])).catch(() => setNotifications([]));
    } else {
      setNotifications(result || []);
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { refresh(); }, [refresh]);

  function addNotification(type, message, productionId, byUserId, byUserName) {
    if (!user) return;
    // Deduplication: skip if same type+message was added in the last 60 seconds
    const now = Date.now();
    const isDuplicate = notifications.some(n =>
      n.type === type && n.message === message &&
      (now - new Date(n.created_at).getTime()) < 60_000
    );
    if (isDuplicate) return;
    const notif = {
      id: generateId('notif'),
      user_id: user.id,
      type,
      message,
      production_id: productionId,
      by_user_id: byUserId ?? user.id,
      by_user_name: byUserName ?? user.name,
      read: false,
      created_at: nowISOString(),
    };
    createNotification(notif);
    setNotifications(prev => [notif, ...prev]);
  }

  function markRead(id) {
    markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  function markAllRead() {
    if (!user) return;
    markAllNotificationsRead(user.id);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  function clearAll() {
    if (!user) return;
    clearAllNotifications(user.id);
    setNotifications([]);
  }

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, addNotification, markRead, markAllRead, clearAll, refresh }}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}

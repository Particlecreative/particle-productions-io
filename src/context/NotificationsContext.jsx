import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from './AuthContext';
import {
  getNotifications,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
  clearAllNotifications,
  generateId,
} from '../lib/dataService';
import { apiGet, apiPut } from '../lib/apiClient';
import { nowISOString } from '../lib/timezone';
import { routeOf, NOTIFY_LOOK } from '../lib/notifyRoute';

const NotificationsContext = createContext(null);
const DEV = import.meta.env.DEV;
const POLL_MS = 30 * 1000;
const DEFAULT_SETTINGS = { types: {}, toast: true, desktop: false };

/**
 * Notifications for the whole platform. 25 Nov 2026: the server now makes them too (a task's status moved, an update or
 * reply on your task, you were tagged, put on a task, your ad started running) — so CP checks every 45 seconds and when
 * you come back to the tab, shows a quiet pop-up for what's new, and (if you turned it on) a desktop notification
 * while CP is in the background. What you get is yours to choose (settings).
 */
export function NotificationsProvider({ children }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [types, setTypes] = useState({});
  const [toasts, setToasts] = useState([]);
  const known = useRef(null);   // ids seen so far — null until the first load (nothing pops on page load)
  const settingsRef = useRef(DEFAULT_SETTINGS);
  settingsRef.current = settings;

  const open = useCallback((n) => {
    const r = routeOf(n, user?.role);
    if (r?.to) navigate(r.to); else if (r?.href) window.open(r.href, '_blank', 'noopener');
  }, [navigate, user?.role]);

  const absorb = useCallback((list) => {
    const rows = Array.isArray(list) ? list : [];
    if (known.current) {
      // the team's moves are quiet — the bell counts them, they don't pop up
      const fresh = rows.filter(n => !known.current.has(n.id) && !n.read && n.type !== 'team' && (n.link || NOTIFY_LOOK[n.type]));
      if (fresh.length) {
        const s = settingsRef.current;
        if (s.toast !== false) setToasts(t => [...fresh.slice(0, 3).map(n => ({ ...n, toastAt: Date.now() })), ...t].slice(0, 4));
        if (s.desktop && typeof document !== 'undefined' && document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          for (const n of fresh.slice(0, 3)) {
            try {
              const d = new Notification('CP', { body: n.message, tag: String(n.id), icon: '/favicon.ico' });
              d.onclick = () => { window.focus(); open(n); d.close(); };
            } catch { /* some browsers refuse */ }
          }
        }
      }
    }
    known.current = new Set(rows.map(n => n.id));
    setNotifications(rows);
  }, [open]);

  // Load / reload notifications whenever user changes
  const refresh = useCallback(() => {
    if (!user) { setNotifications([]); known.current = null; return; }
    const result = getNotifications(user.id);
    if (result && typeof result.then === 'function') result.then(absorb).catch(() => {});
    else absorb(result || []);
  }, [user?.id, absorb]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    known.current = null;
    refresh();
    if (!user) return undefined;
    const t = setInterval(() => { if (!document.hidden) refresh(); }, POLL_MS);
    const back = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', back);
    window.addEventListener('focus', back);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', back); window.removeEventListener('focus', back); };
  }, [refresh, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Their settings
  useEffect(() => {
    if (!user) return;
    if (DEV) {
      try { const s = JSON.parse(localStorage.getItem('cp_notify_settings') || 'null'); if (s) setSettings({ ...DEFAULT_SETTINGS, ...s }); } catch { /* none */ }
      setTypes({ mention: { label: 'Someone tags you' }, comment: { label: 'New updates and replies on your tasks' }, status: { label: 'Status changes on your tasks' }, assigned: { label: 'You’re put on a task' }, ad_live: { label: 'Your ad is uploaded to Meta / starts running' }, requests: { label: 'Tickets you asked for: ready for review, done, stuck' } });
      return;
    }
    apiGet('/notifications/settings').then(r => { setSettings({ ...DEFAULT_SETTINGS, ...(r.settings || {}) }); setTypes(r.types || {}); }).catch(() => {});
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveSettings = useCallback(async (patch) => {
    const next = { ...settingsRef.current, ...patch, types: { ...(settingsRef.current.types || {}), ...(patch.types || {}) } };
    setSettings(next);
    if (DEV) { try { localStorage.setItem('cp_notify_settings', JSON.stringify(next)); } catch { /* private mode */ } return next; }
    try { const r = await apiPut('/notifications/settings', { settings: next }); setSettings({ ...DEFAULT_SETTINGS, ...(r.settings || next) }); } catch { /* keep the local choice */ }
    return next;
  }, []);

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
    known.current?.add(notif.id);
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

  const dismissToast = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);
  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, addNotification, markRead, markAllRead, clearAll, refresh, settings, saveSettings, types, open }}>
      {children}
      <Toasts toasts={toasts} onClose={dismissToast} onOpen={(n) => { dismissToast(n.id); markRead(n.id); open(n); }} />
    </NotificationsContext.Provider>
  );
}

/** Quiet pop-ups, bottom right: what's new, one click to open it. They leave on their own. */
function Toasts({ toasts, onClose, onOpen }) {
  const [hover, setHover] = useState(false);
  useEffect(() => {
    if (hover || !toasts.length) return undefined;
    const t = setTimeout(() => onClose(toasts[toasts.length - 1].id), 7000);
    return () => clearTimeout(t);
  }, [toasts, hover, onClose]);
  if (!toasts.length || typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed bottom-5 right-5 z-[120] flex flex-col gap-2 w-[340px] max-w-[calc(100vw-32px)]" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)} role="status" aria-live="polite">
      {toasts.map(n => {
        const look = NOTIFY_LOOK[n.type] || { emoji: '•', color: '#676879', label: 'Update' };
        return (
          <div key={n.id} className="group flex items-start gap-3 rounded-2xl bg-white/95 backdrop-blur border border-gray-200 shadow-[0_12px_40px_rgba(3,11,46,.18)] p-3.5 cursor-pointer fs-card-in"
            onClick={() => onOpen(n)}>
            <span className="w-9 h-9 rounded-xl flex-none flex items-center justify-center text-[14px] font-bold text-white" style={{ background: look.color }}>{look.emoji}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: look.color }}>{look.label}</div>
              <div className="text-[13px] text-[#030b2e] leading-snug line-clamp-3">{n.message}</div>
              {n.meta?.from && n.meta?.to && (
                <div className="flex items-center gap-1.5 mt-1.5 text-[11px] font-semibold">
                  <span className="px-1.5 py-0.5 rounded text-white" style={{ background: n.meta.from_color || '#c4c4c4' }}>{n.meta.from}</span>→
                  <span className="px-1.5 py-0.5 rounded text-white" style={{ background: n.meta.to_color || '#579bfc' }}>{n.meta.to}</span>
                </div>
              )}
            </div>
            <button type="button" onClick={(e) => { e.stopPropagation(); onClose(n.id); }} className="p-1 rounded-lg text-gray-300 hover:text-gray-600 opacity-0 group-hover:opacity-100" aria-label="Dismiss"><X size={14} /></button>
          </div>
        );
      })}
    </div>, document.body);
}

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationsProvider');
  return ctx;
}

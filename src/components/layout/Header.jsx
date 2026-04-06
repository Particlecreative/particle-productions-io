import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Bell, LogOut, Menu, User, ChevronDown } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useBrand } from '../../context/BrandContext';
import { useNotifications } from '../../context/NotificationsContext';
import { useCurrency } from '../../context/CurrencyContext';
import NotificationsPanel from '../notifications/NotificationsPanel';
import clsx from 'clsx';

export default function Header({ onMenuToggle }) {
  const { user, logout } = useAuth();
  const { brand } = useBrand();
  const { unreadCount } = useNotifications();
  const { currency, toggleCurrency } = useCurrency();
  const [showNotif, setShowNotif] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [now, setNow] = useState(new Date());
  const navigate = useNavigate();

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <header
        className="flex items-center gap-3 px-4 py-3 border-b flex-shrink-0"
        style={{
          background: 'var(--brand-surface)',
          borderColor: 'var(--brand-border)',
          height: 64,
        }}
      >
        {/* Mobile menu toggle */}
        <button
          onClick={onMenuToggle}
          className="md:hidden p-2 rounded hover:bg-gray-100"
        >
          <Menu size={18} />
        </button>

        {/* Page title area */}
        <div className="hidden md:flex items-center gap-2 min-w-0">
          <span
            className="text-lg font-black brand-title"
            style={{
              color: 'var(--brand-primary)',
              fontFamily: 'inherit',
            }}
          >
            CP Panel
          </span>
          <span className="text-gray-300 text-sm">·</span>
          <span className="text-sm text-gray-500">{brand.name}</span>
        </div>

        <div className="flex-1" />

        {/* Date/Time */}
        <div className="hidden md:flex flex-col items-end text-right leading-tight">
          <span className="text-xs font-semibold text-gray-600">
            {now.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <span className="text-[11px] text-gray-400 tabular-nums">
            {now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span>
        </div>

        {/* Global Search */}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('open-global-search'))}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-600 border border-gray-200 hover:border-gray-300 transition-all"
          style={{ minWidth: 200 }}
        >
          <Search size={14} />
          <span>Search everything...</span>
          <kbd className="ml-auto text-xs bg-gray-100 px-1.5 py-0.5 rounded text-gray-400">⌘K</kbd>
        </button>

        {/* Currency Toggle */}
        <div className="currency-toggle" title="Switch currency (USD / ILS)">
          <button
            className={clsx(currency === 'USD' && 'active')}
            onClick={() => currency !== 'USD' && toggleCurrency()}
            aria-label="Switch to US Dollars"
          >$</button>
          <button
            className={clsx(currency === 'ILS' && 'active')}
            onClick={() => currency !== 'ILS' && toggleCurrency()}
            aria-label="Switch to Israeli Shekels"
          >₪</button>
        </div>

        {/* Notifications */}
        <div className="relative">
          <button
            onClick={() => setShowNotif(true)}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-700 relative transition-colors"
          >
            <Bell size={18} />
            {unreadCount > 0 && (
              <span className="notif-dot">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>
        </div>

        {/* User Menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(s => !s)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
              style={{ background: 'var(--brand-accent)' }}
            >
              {user?.name?.[0] || 'U'}
            </div>
            <div className="hidden md:block text-left">
              <div className="text-xs font-semibold text-gray-700 leading-tight">{user?.name}</div>
              <div className="text-[10px] text-gray-400 leading-tight capitalize">{user?.role}</div>
            </div>
            <ChevronDown size={12} className="text-gray-400 hidden md:block" />
          </button>

          {showUserMenu && (
            <div
              className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 animate-fade-in"
            >
              <div className="px-3 py-2 border-b border-gray-100">
                <div className="text-sm font-semibold">{user?.name}</div>
                <div className="text-xs text-gray-400">{user?.email}</div>
              </div>
              <button
                onClick={() => { setShowUserMenu(false); logout(); navigate('/login'); }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Panels */}
      {showNotif && <NotificationsPanel onClose={() => setShowNotif(false)} />}

      {/* Click outside user menu */}
      {showUserMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowUserMenu(false)}
        />
      )}
    </>
  );
}

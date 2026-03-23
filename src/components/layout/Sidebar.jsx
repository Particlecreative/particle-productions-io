import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, DollarSign, BookOpen, Settings, Users, ChevronLeft, ChevronRight,
  History, FileText, Link, FileSignature, Clapperboard, Users2, GripVertical,
  GanttChartSquare, Check, Star, Sun, Moon, Grid3x3, X as XIcon,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useBrand } from '../../context/BrandContext';
import { useAuth } from '../../context/AuthContext';
import { useDarkMode } from '../../context/DarkModeContext';
import BrandLogo from './BrandLogo';
import BrandSwitcher from './BrandSwitcher';
import { saveViewOrder, getViewOrder, getAllCasting } from '../../lib/dataService';
import { useNotifications } from '../../context/NotificationsContext';
import clsx from 'clsx';

const DEFAULT_NAV_ITEMS = [
  { to: '/',               icon: LayoutDashboard,  label: 'Productions', exact: true, accountingHide: true },
  { to: '/links',          icon: Link,             label: 'Links',       accountingHide: true },
  { to: '/contracts',      icon: FileSignature,    label: 'Contracts',   accountingHide: true },
  { to: '/suppliers',      icon: Users2,           label: 'Suppliers',   accountingHide: true },
  { to: '/studio-tickets', icon: Clapperboard,     label: 'Studio',      accountingHide: true },
  { to: '/gantts',         icon: GanttChartSquare, label: 'Gantts',      accountingHide: true },
  { to: '/call-sheets',    icon: FileText,         label: 'Call Sheets', accountingHide: true },
  { to: '/financial',      icon: DollarSign,       label: 'Financial' },
  { to: '/accounting',     icon: BookOpen,         label: 'Accounting' },
  { to: '/invoices',       icon: FileText,         label: 'Invoices' },
  { to: '/history',        icon: History,          label: 'History' },
  { to: '/casting-rights', icon: Star,             label: 'Casting',      accountingHide: true },
  { to: '/manual',         icon: BookOpen,         label: 'Manual',       accountingHide: true },
];

const ADMIN_ITEMS = [
  { to: '/settings', icon: Settings, label: 'Settings' },
  { to: '/users',    icon: Users,    label: 'Users' },
];

function applySavedOrder(items, order) {
  if (!order?.length) return items;
  return [...items].sort((a, b) => {
    const ai = order.indexOf(a.to);
    const bi = order.indexOf(b.to);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export default function Sidebar({ open, onToggle }) {
  const { brand } = useBrand();
  const { isAdmin, isAccounting, user } = useAuth();
  const { dark, toggle: toggleDark } = useDarkMode();
  const navigate = useNavigate();
  const userId = user?.id ?? 'guest';
  const [showMoreMenu, setShowMoreMenu] = useState(false);

  const [navItems, setNavItems] = useState(() => {
    const saved = getViewOrder('sidebar', userId);
    return applySavedOrder(DEFAULT_NAV_ITEMS, saved);
  });
  const [pendingOrder, setPendingOrder] = useState(null);
  const [savedFlash, setSavedFlash] = useState(false);

  // Casting risk badge
  const [castingRiskCount, setCastingRiskCount] = useState(0);
  const [castingBadgeColor, setCastingBadgeColor] = useState('bg-red-500');
  const { notifications, addNotification } = useNotifications();
  const notificationsRef = useRef(notifications);

  useEffect(() => {
    async function checkCasting() {
      try {
        const allCast = await Promise.resolve(getAllCasting());
        const brandCast = (Array.isArray(allCast) ? allCast : []).filter(c => c.brand_id === brand.id);
        const overdueCount = brandCast.filter(c => c.contract_status === 'Overdue').length;
        const closeCount   = brandCast.filter(c => c.contract_status === 'Close to Overdue').length;
        const total = overdueCount + closeCount;
        setCastingRiskCount(total);
        setCastingBadgeColor(overdueCount > 0 ? 'bg-red-500' : 'bg-orange-500');
        if (total > 0) {
          const today = new Date().toISOString().slice(0, 10);
          const alreadyToday = notificationsRef.current.some(
            n => n.type === 'casting_risk' && n.created_at?.startsWith(today)
          );
          if (!alreadyToday) {
            addNotification(
              'casting_risk',
              `⚠️ ${total} cast member${total > 1 ? 's have' : ' has'} expiring or overdue rights — review Casting`,
              null, null, null
            );
          }
        }
      } catch {}
    }
    checkCasting();
    window.addEventListener('focus', checkCasting);
    return () => window.removeEventListener('focus', checkCasting);
  }, [brand.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleItems = isAccounting
    ? navItems.filter(i => !i.accountingHide)
    : navItems;

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const oldIdx = visibleItems.findIndex(i => i.to === active.id);
    const newIdx = visibleItems.findIndex(i => i.to === over.id);
    const newVisible = arrayMove(visibleItems, oldIdx, newIdx);

    // Rebuild full navItems preserving positions of hidden items
    const visibleTos = new Set(visibleItems.map(i => i.to));
    const newFull = [...navItems];
    const slots = newFull
      .map((item, idx) => (visibleTos.has(item.to) ? idx : -1))
      .filter(idx => idx !== -1);
    newVisible.forEach((item, i) => { newFull[slots[i]] = item; });

    setNavItems(newFull);
    setPendingOrder(newFull.map(i => i.to));
  }

  function handleSave(forAll) {
    saveViewOrder('sidebar', userId, navItems.map(i => i.to), forAll);
    setPendingOrder(null);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  }

  function handleReset() {
    setNavItems(DEFAULT_NAV_ITEMS);
    setPendingOrder(null);
    localStorage.removeItem(`cp_view_order_sidebar_${userId}`);
    localStorage.removeItem('cp_view_order_sidebar_global');
  }

  return (
    <>
      {/* Desktop Sidebar */}
      <div className={clsx(
        'sidebar hidden md:flex flex-col h-full transition-all duration-300 flex-shrink-0',
        open ? 'w-56' : 'w-[60px]',
      )}>
        {/* Logo */}
        <div className="flex items-center px-3 py-4 border-b border-white/10 min-h-[64px]">
          <button onClick={() => navigate('/')} className="flex items-center gap-2 flex-1 min-w-0">
            <BrandLogo compact={!open} />
          </button>
          <button onClick={onToggle} className="ml-auto text-white/50 hover:text-white p-1 rounded flex-shrink-0">
            {open ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        {/* Brand Switcher */}
        <div className={clsx('px-2 py-3 border-b border-white/10', !open && 'px-1')}>
          <BrandSwitcher compact={!open} />
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
          {open ? (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={visibleItems.map(i => i.to)} strategy={verticalListSortingStrategy}>
                {visibleItems.map(item => (
                  <SortableNavItem
                    key={item.to}
                    {...item}
                    badge={item.to === '/casting-rights' ? castingRiskCount : 0}
                    badgeColor={item.to === '/casting-rights' ? castingBadgeColor : undefined}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            visibleItems.map(item => (
              <SidebarLink
                key={item.to}
                {...item}
                collapsed
                badge={item.to === '/casting-rights' ? castingRiskCount : 0}
                badgeColor={item.to === '/casting-rights' ? castingBadgeColor : undefined}
              />
            ))
          )}

          {isAdmin && (
            <>
              <div className={clsx(
                'text-white/30 text-[10px] uppercase tracking-widest mt-4 mb-1 px-2',
                !open && 'hidden',
              )}>
                Admin
              </div>
              {ADMIN_ITEMS.map(item => (
                <SidebarLink key={item.to} {...item} collapsed={!open} />
              ))}
            </>
          )}
        </nav>

        {/* Save banner */}
        {pendingOrder && (
          <div className="px-2 py-2 border-t border-white/10 bg-white/5 text-white/80 text-xs">
            {open ? (
              <div className="space-y-1.5">
                <p className="text-white/50 leading-none">Order changed — Save for:</p>
                <div className="flex gap-1">
                  <button
                    onClick={() => handleSave(false)}
                    className="flex-1 rounded bg-white/10 hover:bg-white/20 px-2 py-1"
                  >Me</button>
                  <button
                    onClick={() => handleSave(true)}
                    className="flex-1 rounded bg-white/10 hover:bg-white/20 px-2 py-1"
                  >Everyone</button>
                  <button
                    onClick={handleReset}
                    className="rounded bg-white/5 hover:bg-white/15 px-2 py-1 text-white/40"
                  >↺</button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-1 items-center">
                <button onClick={() => handleSave(false)} className="w-full rounded bg-white/10 hover:bg-white/20 py-1 text-center">✓</button>
                <button onClick={handleReset} className="w-full rounded bg-white/5 hover:bg-white/15 py-1 text-center text-white/40">↺</button>
              </div>
            )}
          </div>
        )}

        {savedFlash && (
          <div className="px-3 py-2 border-t border-white/10 text-green-400 text-xs flex items-center gap-1.5">
            <Check size={12} />
            {open && 'Order saved'}
          </div>
        )}

        {/* Dark mode toggle + Version */}
        {!pendingOrder && !savedFlash && (
          <div className={clsx(
            'border-t border-white/10 flex items-center',
            open ? 'px-4 py-3 justify-between' : 'px-2 py-3 justify-center'
          )}>
            {open && <span className="text-white/20 text-[10px]">CP Panel v1.9 · {brand.name}</span>}
            <button
              onClick={toggleDark}
              title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="text-white/40 hover:text-white/80 transition-colors p-1 rounded"
            >
              {dark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
          </div>
        )}
      </div>

      {/* Mobile Bottom Nav */}
      <div className="mobile-nav">
        {!isAccounting && (
          <button onClick={() => navigate('/')} className="sidebar-link flex-col">
            <LayoutDashboard size={18} />
            <span>Productions</span>
          </button>
        )}
        <button onClick={() => navigate('/financial')} className="sidebar-link flex-col">
          <DollarSign size={18} />
          <span>Financial</span>
        </button>
        <button onClick={() => navigate('/accounting')} className="sidebar-link flex-col">
          <BookOpen size={18} />
          <span>Accounting</span>
        </button>
        <button onClick={() => navigate('/history')} className="sidebar-link flex-col">
          <History size={18} />
          <span>History</span>
        </button>
        {/* More button — shows overlay with secondary pages */}
        <button onClick={() => setShowMoreMenu(true)} className="sidebar-link flex-col">
          <Grid3x3 size={18} />
          <span>More</span>
        </button>
      </div>

      {/* Mobile "More" overlay */}
      {showMoreMenu && (
        <>
          <div
            className="fixed inset-0 bg-black/40 z-40"
            onClick={() => setShowMoreMenu(false)}
          />
          <div className="fixed inset-x-0 bottom-16 bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl p-4 z-50 animate-slide-in-right"
            style={{ animation: 'none', transform: 'none' }}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">More pages</span>
              <button onClick={() => setShowMoreMenu(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <XIcon size={16} />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { to: '/links',          icon: Link,             label: 'Links' },
                { to: '/gantts',         icon: GanttChartSquare, label: 'Gantts' },
                { to: '/call-sheets',    icon: FileText,         label: 'Call Sheets' },
                { to: '/suppliers',      icon: Users2,           label: 'Suppliers' },
                { to: '/casting-rights', icon: Star,             label: 'Casting' },
                { to: '/contracts',      icon: FileSignature,    label: 'Contracts' },
                { to: '/invoices',       icon: FileText,         label: 'Invoices' },
                { to: '/manual',         icon: BookOpen,         label: 'Manual' },
                ...(isAdmin ? [
                  { to: '/settings', icon: Settings, label: 'Settings' },
                  { to: '/users',    icon: Users,    label: 'Users' },
                ] : []),
              ].map(({ to, icon: Icon, label }) => (
                <button
                  key={to}
                  onClick={() => { navigate(to); setShowMoreMenu(false); }}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <Icon size={20} className="text-gray-600 dark:text-gray-300" />
                  <span className="text-[11px] font-medium text-gray-600 dark:text-gray-300">{label}</span>
                </button>
              ))}
            </div>
            {/* Dark mode toggle in more menu */}
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
              <button
                onClick={() => { toggleDark(); setShowMoreMenu(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {dark ? <Sun size={16} className="text-amber-500" /> : <Moon size={16} className="text-indigo-500" />}
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {dark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                </span>
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function SortableNavItem({ to, icon: Icon, label, badge, badgeColor }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: to });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 }}
      className="flex items-center group gap-0.5"
    >
      <button
        {...attributes}
        {...listeners}
        className="text-white/20 hover:text-white/60 cursor-grab active:cursor-grabbing p-1 flex-shrink-0 rounded opacity-0 group-hover:opacity-100 transition-opacity"
        tabIndex={-1}
        aria-label="Drag to reorder"
      >
        <GripVertical size={12} />
      </button>
      <NavLink
        to={to}
        end={to === '/' || to === '/financial'}
        className={({ isActive }) => clsx('sidebar-link flex-1', isActive && 'active')}
      >
        <div className="relative flex-shrink-0">
          <Icon size={16} />
          {badge > 0 && (
            <span className={clsx(
              'absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none',
              badgeColor || 'bg-red-500'
            )}>
              {badge > 9 ? '9+' : badge}
            </span>
          )}
        </div>
        <span className="truncate">{label}</span>
      </NavLink>
    </div>
  );
}

function SidebarLink({ to, icon: Icon, label, collapsed, badge, badgeColor }) {
  return (
    <NavLink
      to={to}
      end={to === '/' || to === '/financial'}
      className={({ isActive }) => clsx('sidebar-link', isActive && 'active')}
    >
      <div className="relative flex-shrink-0">
        <Icon size={16} />
        {badge > 0 && (
          <span className={clsx(
            'absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] px-0.5 rounded-full text-white text-[9px] font-bold flex items-center justify-center leading-none',
            badgeColor || 'bg-red-500'
          )}>
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </div>
      {!collapsed && <span className="truncate">{label}</span>}
    </NavLink>
  );
}

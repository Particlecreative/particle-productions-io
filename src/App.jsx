import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { BrandProvider } from './context/BrandContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CurrencyProvider } from './context/CurrencyContext';
import { NotificationsProvider } from './context/NotificationsContext';
import { ListsProvider } from './context/ListsContext';
import { DarkModeProvider, useDarkMode } from './context/DarkModeContext';
import { initializeData } from './lib/dataService';
import ErrorBoundary from './components/ui/ErrorBoundary';
import GlobalSearch from './components/ui/GlobalSearch';

import Login from './pages/Login';
import AppShell from './components/layout/AppShell';
import Dashboard from './pages/Dashboard';
import ProductionBoard from './pages/ProductionBoard';
import Financial from './pages/Financial';
import Accounting from './pages/Accounting';
import Invoices from './pages/Invoices';
import Settings from './pages/Settings';
import Users from './pages/Users';
import History from './pages/History';
import Contracts from './pages/Contracts';
import Suppliers from './pages/Suppliers';
import StudioTickets from './pages/StudioTickets';
import SupplierForm from './pages/SupplierForm';
import CCPaymentForm from './pages/CCPaymentForm';
import CastingRights from './pages/CastingRights';
import Gantts from './pages/Gantts';
import CallSheets from './pages/CallSheets';
import Manual from './pages/Manual';
import ContractSign from './pages/ContractSign';
import WeeklySharePage from './pages/WeeklySharePage';
import Scripts from './pages/Scripts';
import ScriptSharePage from './pages/ScriptSharePage';
import Tasks from './pages/Tasks';

// Creative Weekly is code-split: its deck engine + `motion` never touch the main bundle.
// After a deploy an open tab may request chunk hashes that no longer exist — reload once.
function lazyPage(loader) {
  const key = 'cp_chunk_reload';
  return lazy(() => loader().then((mod) => { sessionStorage.removeItem(key); return mod; }).catch((err) => {
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, '1');
      window.location.reload();
      return new Promise(() => {});
    }
    sessionStorage.removeItem(key);
    throw err;
  }));
}
const StudioPage = lazyPage(() => import('./pages/studio/StudioPage'));
const TrackerPage = lazyPage(() => import('./pages/tracker/TrackerPage'));
const LibraryPage = lazyPage(() => import('./pages/library/LibraryPage'));
const CreativeReportsPage = lazyPage(() => import('./pages/creative/CreativeReportsPage'));
const CreativeReportEditorPage = lazyPage(() => import('./pages/creative/CreativeReportEditorPage'));
const CreativeReportPresentPage = lazyPage(() => import('./pages/creative/CreativeReportPresentPage'));
const CreativeReportSharePage = lazyPage(() => import('./pages/creative/CreativeReportSharePage'));

function DeckSplash() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: '#030b2e', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 44, height: 44, borderRadius: 99, border: '3px solid rgba(140,147,255,.25)', borderTopColor: '#8c93ff', animation: 'spin 0.9s linear infinite' }} />
    </div>
  );
}
const lazyEl = (el, fallback = null) => <Suspense fallback={fallback}>{el}</Suspense>;

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', (e) => {
    if (!sessionStorage.getItem('cp_chunk_reload')) {
      e.preventDefault();
      sessionStorage.setItem('cp_chunk_reload', '1');
      window.location.reload();
    }
  });
}

function ProtectedRoute({ children, adminOnly = false, blockForAccounting = false, blockForStudio = false }) {
  const { user, loading, isAdmin, isAccounting, isStudio } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  if (blockForAccounting && isAccounting) return <Navigate to="/financial" replace />;
  if (blockForStudio && isStudio) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  const { toggle: toggleDark } = useDarkMode();
  const navigate = useNavigate();
  const location = useLocation();
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKey(e) {
      const tag = document.activeElement?.tagName?.toLowerCase();
      const isEditing = ['input', 'textarea', 'select'].includes(tag) ||
        document.activeElement?.isContentEditable;

      // Ctrl+K / ⌘K — global search (always works)
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setGlobalSearchOpen(true);
        return;
      }

      if (isEditing) return;

      // D — toggle dark mode
      if (e.key === 'd' || e.key === 'D') { toggleDark(); return; }

      // N — new production (dashboard only)
      if ((e.key === 'n' || e.key === 'N') && location.pathname === '/') {
        window.dispatchEvent(new CustomEvent('open-new-production'));
        return;
      }

      // / — open global search
      if (e.key === '/') { e.preventDefault(); setGlobalSearchOpen(true); return; }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [toggleDark, location.pathname]);

  // Header button fires this event to open the same command palette
  useEffect(() => {
    function handleOpen() { setGlobalSearchOpen(true); }
    window.addEventListener('open-global-search', handleOpen);
    return () => window.removeEventListener('open-global-search', handleOpen);
  }, []);

  return (
    <>
      <GlobalSearch open={globalSearchOpen} onClose={() => setGlobalSearchOpen(false)} />
      <Routes>
        <Route path="/login" element={loading ? null : (user ? <Navigate to="/" replace /> : <Login />)} />
        <Route path="/" element={<ProtectedRoute blockForAccounting><AppShell><ErrorBoundary><Dashboard /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/production/:id" element={<ProtectedRoute><AppShell><ErrorBoundary><ProductionBoard /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/financial" element={<ProtectedRoute blockForStudio><AppShell><ErrorBoundary><Financial /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/accounting" element={<ProtectedRoute blockForStudio><AppShell><ErrorBoundary><Accounting /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/invoices" element={<ProtectedRoute blockForStudio><AppShell><ErrorBoundary><Invoices /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute adminOnly><AppShell><ErrorBoundary><Settings /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute adminOnly><AppShell><ErrorBoundary><Users /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute blockForStudio><AppShell><ErrorBoundary><History /></ErrorBoundary></AppShell></ProtectedRoute>} />
        {/* The Library replaced Links */}
        <Route path="/links" element={<Navigate to="/library" replace />} />
        <Route path="/contracts" element={<ProtectedRoute blockForStudio><AppShell><ErrorBoundary><Contracts /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/suppliers" element={<ProtectedRoute blockForStudio><AppShell><ErrorBoundary><Suppliers /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/studio-tickets" element={<ProtectedRoute><AppShell><ErrorBoundary><StudioTickets /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/library" element={<ProtectedRoute blockForAccounting><AppShell><ErrorBoundary>{lazyEl(<LibraryPage />)}</ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/tracker" element={<ProtectedRoute blockForAccounting blockForStudio><AppShell><ErrorBoundary>{lazyEl(<TrackerPage />)}</ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/studio" element={<ProtectedRoute blockForAccounting blockForStudio><AppShell><ErrorBoundary>{lazyEl(<StudioPage />)}</ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/gantts" element={<ProtectedRoute blockForAccounting blockForStudio><AppShell><ErrorBoundary><Gantts /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/casting-rights" element={<ProtectedRoute blockForStudio><AppShell><ErrorBoundary><CastingRights /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/call-sheets" element={<ProtectedRoute blockForAccounting blockForStudio><AppShell><ErrorBoundary><CallSheets /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/manual" element={<ProtectedRoute><AppShell><ErrorBoundary><Manual /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute><AppShell><ErrorBoundary><Tasks /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/creative-reports" element={<ProtectedRoute blockForAccounting blockForStudio><AppShell><ErrorBoundary>{lazyEl(<CreativeReportsPage />)}</ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/creative-reports/:id" element={<ProtectedRoute blockForAccounting blockForStudio><AppShell><ErrorBoundary>{lazyEl(<CreativeReportEditorPage />)}</ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/creative-reports/:id/present" element={<ProtectedRoute blockForAccounting blockForStudio><ErrorBoundary>{lazyEl(<CreativeReportPresentPage />, <DeckSplash />)}</ErrorBoundary></ProtectedRoute>} />
        <Route path="/creative-report/:token" element={<ErrorBoundary>{lazyEl(<CreativeReportSharePage />, <DeckSplash />)}</ErrorBoundary>} />
        {/* Public forms — no auth required */}
        <Route path="/supplier-form/:productionId" element={<SupplierForm />} />
        <Route path="/cc-payment/:productionId" element={<CCPaymentForm />} />
        <Route path="/sign/:contractId/:token" element={<ErrorBoundary><ContractSign /></ErrorBoundary>} />
        <Route path="/weekly/:token" element={<WeeklySharePage />} />
        <Route path="/script/:token" element={<ScriptSharePage />} />
        <Route path="/scripts" element={<ProtectedRoute blockForAccounting><AppShell><ErrorBoundary><Scripts /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  useEffect(() => { initializeData(); }, []);

  return (
    <DarkModeProvider>
      <BrandProvider>
        <AuthProvider>
          <ListsProvider>
            <CurrencyProvider>
              <BrowserRouter>
                <NotificationsWrapper />
              </BrowserRouter>
            </CurrencyProvider>
          </ListsProvider>
        </AuthProvider>
      </BrandProvider>
    </DarkModeProvider>
  );
}

function NotificationsWrapper() {
  return (
    <NotificationsProvider>
      <AppRoutes />
    </NotificationsProvider>
  );
}

import { useEffect, useState } from 'react';
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
import Links from './pages/Links';
import Contracts from './pages/Contracts';
import Suppliers from './pages/Suppliers';
import StudioTickets from './pages/StudioTickets';
import SupplierForm from './pages/SupplierForm';
import CCPaymentForm from './pages/CCPaymentForm';
import CastingRights from './pages/CastingRights';
import Gantts from './pages/Gantts';
import CallSheets from './pages/CallSheets';
import Manual from './pages/Manual';

function ProtectedRoute({ children, adminOnly = false, blockForAccounting = false }) {
  const { user, loading, isAdmin, isAccounting } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && !isAdmin) return <Navigate to="/" replace />;
  if (blockForAccounting && isAccounting) return <Navigate to="/financial" replace />;
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
        <Route path="/financial" element={<ProtectedRoute><AppShell><ErrorBoundary><Financial /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/accounting" element={<ProtectedRoute><AppShell><ErrorBoundary><Accounting /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/invoices" element={<ProtectedRoute><AppShell><ErrorBoundary><Invoices /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute adminOnly><AppShell><ErrorBoundary><Settings /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/users" element={<ProtectedRoute adminOnly><AppShell><ErrorBoundary><Users /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/history" element={<ProtectedRoute><AppShell><ErrorBoundary><History /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/links" element={<ProtectedRoute><AppShell><ErrorBoundary><Links /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/contracts" element={<ProtectedRoute><AppShell><ErrorBoundary><Contracts /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/suppliers" element={<ProtectedRoute><AppShell><ErrorBoundary><Suppliers /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/studio-tickets" element={<ProtectedRoute><AppShell><ErrorBoundary><StudioTickets /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/gantts" element={<ProtectedRoute blockForAccounting><AppShell><ErrorBoundary><Gantts /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/casting-rights" element={<ProtectedRoute><AppShell><ErrorBoundary><CastingRights /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/call-sheets" element={<ProtectedRoute blockForAccounting><AppShell><ErrorBoundary><CallSheets /></ErrorBoundary></AppShell></ProtectedRoute>} />
        <Route path="/manual" element={<ProtectedRoute><AppShell><ErrorBoundary><Manual /></ErrorBoundary></AppShell></ProtectedRoute>} />
        {/* Public forms — no auth required */}
        <Route path="/supplier-form/:productionId" element={<SupplierForm />} />
        <Route path="/cc-payment/:productionId" element={<CCPaymentForm />} />
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

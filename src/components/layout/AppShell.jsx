import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { meApi } from '../../lib/meService';
import { pageName } from '../../lib/pageNames';
import Sidebar from './Sidebar';
import Header from './Header';
import ToastContainer from '../ui/ToastContainer';
import CompletionPromptHost from '../library/CompletionPromptHost';
import FinancePromptHost from '../finance/FinancePromptHost';

export default function AppShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Team activity: every page anyone opens (the server keeps one line per page per 10 minutes; the super admin isn't logged)
  const { pathname } = useLocation();
  const { user } = useAuth();
  useEffect(() => { if (user && !user.super_admin) meApi.pageView(pageName(pathname)); }, [pathname, user]);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--brand-bg)' }}>
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />
      <div
        className="flex flex-col flex-1 overflow-hidden main-content"
        style={{ marginLeft: 0 }}
      >
        <Header onMenuToggle={() => setSidebarOpen(o => !o)} sidebarOpen={sidebarOpen} />
        <main className="flex-1 overflow-auto p-1 sm:p-6">
          {children}
        </main>
      </div>
      <ToastContainer />
      <CompletionPromptHost />
      <FinancePromptHost />
    </div>
  );
}

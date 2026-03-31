import { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import ToastContainer from '../ui/ToastContainer';

export default function AppShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--brand-bg)' }}>
      <Sidebar open={sidebarOpen} onToggle={() => setSidebarOpen(o => !o)} />
      <div
        className="flex flex-col flex-1 overflow-hidden main-content"
        style={{ marginLeft: 0 }}
      >
        <Header onMenuToggle={() => setSidebarOpen(o => !o)} sidebarOpen={sidebarOpen} />
        <main className="flex-1 overflow-auto p-6">
          {children}
        </main>
      </div>
      <ToastContainer />
    </div>
  );
}

import { createContext, useContext, useState, useEffect } from 'react';

const DarkModeContext = createContext(null);

export function DarkModeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    try { return localStorage.getItem('cp_dark') === 'true'; } catch { return false; }
  });

  useEffect(() => {
    const el = document.documentElement;
    el.classList.toggle('dark', dark);
    try { localStorage.setItem('cp_dark', String(dark)); } catch {}

    // Apply dark mode CSS variables via inline style (Tailwind CSS Layers override html.dark in stylesheet)
    const darkVars = {
      '--brand-bg': '#0d1117',
      '--brand-surface': '#161b22',
      '--brand-card-bg': '#1c2028',
      '--brand-border': 'rgba(255,255,255,0.08)',
      '--brand-text': '#e6edf3',
      '--brand-text-muted': '#8b949e',
      '--brand-primary': '#6e8ef7',
      '--brand-accent': '#5b7df5',
      '--brand-secondary': '#4a6cf0',
      '--brand-sidebar-bg': '#0d1117',
      '--brand-sidebar-active': '#5b7df5',
      '--brand-gradient': 'linear-gradient(135deg, #4a6cf0 0%, #6e8ef7 100%)',
      '--brand-glow': 'rgba(110, 142, 247, 0.15)',
      '--card-shadow': '0 1px 3px rgba(0,0,0,0.2), 0 4px 12px rgba(0,0,0,0.1)',
      '--card-shadow-hover': '0 2px 6px rgba(0,0,0,0.3), 0 8px 24px rgba(0,0,0,0.15)',
    };
    if (dark) {
      Object.entries(darkVars).forEach(([k, v]) => el.style.setProperty(k, v));
    } else {
      Object.keys(darkVars).forEach(k => el.style.removeProperty(k));
    }
  }, [dark]);

  return (
    <DarkModeContext.Provider value={{ dark, toggle: () => setDark(d => !d) }}>
      {children}
    </DarkModeContext.Provider>
  );
}

export function useDarkMode() {
  const ctx = useContext(DarkModeContext);
  if (!ctx) throw new Error('useDarkMode must be used within DarkModeProvider');
  return ctx;
}

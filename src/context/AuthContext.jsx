import { createContext, useContext, useState, useEffect } from 'react';
import { SAMPLE_USERS } from '../lib/mockData';
import { api, apiGet } from '../lib/apiClient';

const AuthContext = createContext(null);
const TOKEN_KEY  = 'cp_auth_token';
const IS_DEV     = import.meta.env.DEV;

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  // ── Restore session on mount ───────────────────────────────
  useEffect(() => {
    if (IS_DEV) {
      // Dev: restore from sessionStorage (no token expiry)
      try {
        const stored = sessionStorage.getItem('cp_user');
        if (stored) setUser(JSON.parse(stored));
      } catch {}
      setLoading(false);
      return;
    }
    // Prod: validate JWT with backend
    // Skip auth check on public pages (signing, forms)
    const publicPaths = ['/sign/', '/supplier-form/', '/cc-payment/', '/script/', '/weekly/'];
    const isPublicPage = publicPaths.some(p => window.location.pathname.startsWith(p));
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token || isPublicPage) { setLoading(false); return; }
    apiGet('/auth/me')
      .then(u => { if (u) setUser(u); })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); })
      .finally(() => setLoading(false));
  }, []);

  // ── Login ──────────────────────────────────────────────────
  async function login(email, password) {
    if (IS_DEV) {
      const found = SAMPLE_USERS.find(u => u.email.toLowerCase() === email.toLowerCase());
      const match = found
        ?? (email === 'admin@demo.com'
            ? { id: 'u-admin', email, name: 'Admin User', role: 'Admin', brand: 'particle', brand_ids: ['particle', 'blurr'], active: true, super_admin: true }
            : null);
      if (match) {
        setUser(match);
        sessionStorage.setItem('cp_user', JSON.stringify(match));
        return { success: true, user: match };
      }
      return { success: false, error: 'Invalid credentials. Try omer@particleformen.com or admin@demo.com' };
    }
    try {
      const data = await api('/auth/login', { method: 'POST', body: { email, password } });
      localStorage.setItem(TOKEN_KEY, data.token);
      setUser(data.user);
      return { success: true, user: data.user };
    } catch (err) {
      return { success: false, error: err.message || 'Login failed' };
    }
  }

  // ── Logout ─────────────────────────────────────────────────
  function logout() {
    setUser(null);
    if (IS_DEV) {
      sessionStorage.removeItem('cp_user');
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  }

  // ── Change password ────────────────────────────────────────
  async function resetPassword(email, newPassword) {
    if (IS_DEV) return { success: true }; // no-op in dev
    try {
      await api('/auth/change-password', { method: 'POST', body: { new_password: newPassword } });
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  // ── Role helpers ───────────────────────────────────────────
  const effectiveRole = user?.role ?? 'Viewer';
  const isAdmin       = effectiveRole === 'Admin';
  const isEditor      = effectiveRole === 'Editor' || isAdmin;
  const isViewer      = !!user;
  const isAccounting  = effectiveRole === 'Accounting';
  const isStudio      = effectiveRole === 'Studio';

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      login,
      logout,
      resetPassword,
      isAdmin,
      isEditor,
      isViewer,
      isAccounting,
      isStudio,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

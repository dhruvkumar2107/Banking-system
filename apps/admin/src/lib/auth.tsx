'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, tokens } from './api';
import type { AdminRole, AdminUser, LoginResponse } from './types';

interface AuthState {
  user: AdminUser | null;
  status: 'loading' | 'authed' | 'anon';
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasRole: (...roles: AdminRole[]) => boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');

  // Rehydrate from storage on mount, then re-validate against /auth/me.
  useEffect(() => {
    const stored = tokens.storedUser<AdminUser>();
    const access = tokens.access();
    if (stored && access) {
      setUser(stored);
      setStatus('authed');
      // Background refresh of the principal; api.ts handles 401 → refresh/logout.
      api
        .get<AdminUser & { type?: string }>('/auth/me')
        .then((me) => {
          const next: AdminUser = {
            id: me.id,
            name: me.name,
            email: me.email,
            role: me.role,
            assignedVillages: me.assignedVillages ?? [],
          };
          setUser(next);
          tokens.setUser(next);
        })
        .catch(() => {
          /* handled by api client (refresh / forced logout) */
        });
    } else {
      setStatus('anon');
    }
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.postPublic<LoginResponse>('/auth/admin/login', { email, password });
    tokens.set(res.accessToken, res.refreshToken);
    tokens.setUser(res.admin);
    setUser(res.admin);
    setStatus('authed');
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = tokens.refresh();
    try {
      await api.post('/auth/logout', { refreshToken });
    } catch {
      /* revoke is best-effort */
    }
    tokens.clear();
    setUser(null);
    setStatus('anon');
    if (typeof window !== 'undefined') window.location.href = '/login';
  }, []);

  const hasRole = useCallback(
    (...roles: AdminRole[]) => (user ? roles.includes(user.role) : false),
    [user],
  );

  const value = useMemo(
    () => ({ user, status, login, logout, hasRole }),
    [user, status, login, logout, hasRole],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}

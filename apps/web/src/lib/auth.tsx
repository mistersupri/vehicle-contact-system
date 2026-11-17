import { createContext, useContext, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from './api';
import type { User } from './types';

interface AuthCtx { user: User | null; loading: boolean; refresh: () => Promise<void>; logout: () => Promise<void> }
const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['me'], retry: false, staleTime: 60_000,
    queryFn: async () => { try { return (await api<{ user: User }>('/auth/me')).user; } catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e; } },
  });
  const value: AuthCtx = {
    user: q.data ?? null, loading: q.isLoading,
    refresh: async () => { await qc.invalidateQueries({ queryKey: ['me'] }); },
    logout: async () => { await api('/auth/logout', { method: 'POST', body: {} }).catch(() => {}); qc.clear(); qc.setQueryData(['me'], null); },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export const useAuth = () => useContext(Ctx);

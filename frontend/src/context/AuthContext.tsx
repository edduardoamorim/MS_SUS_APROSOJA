import React, { useState, useEffect, createContext, useContext } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: string | null;
  loading: boolean;
  logout: () => Promise<void>;
  setFallbackSession: (user: any, role: string) => void;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  loading: true,
  logout: async () => {},
  setFallbackSession: () => {},
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadUserRole = async (usr: User | null) => {
    if (!usr) {
      setRole(null);
      return;
    }

    // 1. Recuperar papel do cache local imediatamente para não travar offline
    const cachedRoleKey = `ms_cached_role_${usr.id}`;
    const localRole = localStorage.getItem(cachedRoleKey) || localStorage.getItem('ms_last_active_role');
    if (localRole) {
      setRole(localRole);
    }

    const metaRole = usr.user_metadata?.role;
    if (metaRole) {
      setRole(metaRole);
      localStorage.setItem(cachedRoleKey, metaRole);
      localStorage.setItem('ms_last_active_role', metaRole);
      return;
    }

    try {
      const { data: byId } = await supabase.from('perfis').select('role').eq('id', usr.id).maybeSingle();
      if (byId?.role) {
        setRole(byId.role);
        localStorage.setItem(cachedRoleKey, byId.role);
        localStorage.setItem('ms_last_active_role', byId.role);
        return;
      }

      if (usr.email) {
        const cleanEmail = usr.email.trim().toLowerCase();
        const { data: byEmail } = await supabase.from('perfis').select('role').ilike('email', cleanEmail).maybeSingle();
        if (byEmail?.role) {
          setRole(byEmail.role);
          localStorage.setItem(cachedRoleKey, byEmail.role);
          localStorage.setItem('ms_last_active_role', byEmail.role);
          return;
        }

        if (cleanEmail.includes('tecnico') || cleanEmail.includes('analistacampo') || cleanEmail.includes('patricia') || cleanEmail.includes('alexandre')) {
          setRole('tecnico');
          localStorage.setItem(cachedRoleKey, 'tecnico');
          localStorage.setItem('ms_last_active_role', 'tecnico');
          return;
        }
        if (cleanEmail.includes('gestor')) {
          setRole('gestor');
          localStorage.setItem(cachedRoleKey, 'gestor');
          localStorage.setItem('ms_last_active_role', 'gestor');
          return;
        }
        if (cleanEmail.includes('produtor')) {
          setRole('produtor');
          localStorage.setItem(cachedRoleKey, 'produtor');
          localStorage.setItem('ms_last_active_role', 'produtor');
          return;
        }
      }

      const defaultRole = localRole || 'produtor';
      setRole(defaultRole);
    } catch (e) {
      console.warn('Erro ao carregar papel do usuário da rede, usando cache local:', e);
      if (localRole) {
        setRole(localRole);
      } else {
        setRole('tecnico'); // Para técnicos em campo, fallback resiliente
      }
    }
  };

  const setFallbackSession = (fallbackUser: any, userRole: string) => {
    const fakeSession: any = {
      access_token: 'fallback-token',
      token_type: 'bearer',
      user: fallbackUser
    };
    localStorage.setItem('ms_auth_fallback_session', JSON.stringify({
      user: fallbackUser,
      role: userRole
    }));
    setUser(fallbackUser);
    setSession(fakeSession);
    setRole(userRole);
  };

  const logout = async () => {
    localStorage.removeItem('ms_auth_fallback_session');
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Erro ao fazer logout do Supabase:', e);
    }
    setSession(null);
    setUser(null);
    setRole(null);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setSession(session);
        setUser(session.user);
        const userRole = session.user.user_metadata?.role || localStorage.getItem('ms_last_active_role') || 'tecnico';
        localStorage.setItem('ms_auth_fallback_session', JSON.stringify({
          user: session.user,
          role: userRole
        }));
        loadUserRole(session.user).finally(() => setLoading(false));
      } else {
        const stored = localStorage.getItem('ms_auth_fallback_session');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed.user) {
              setSession({ access_token: 'fallback-token', user: parsed.user } as any);
              setUser(parsed.user);
              setRole(parsed.role || 'tecnico');
              setLoading(false);
              return;
            }
          } catch (e) {}
        }
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        if (!isOffline) {
          setSession(null);
          setUser(null);
          setRole(null);
        }
        setLoading(false);
      }
    }).catch(err => {
      console.warn('Erro ao obter sessão remota, usando cache local:', err);
      const stored = localStorage.getItem('ms_auth_fallback_session');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed.user) {
            setUser(parsed.user);
            setRole(parsed.role || 'tecnico');
            setSession({ access_token: 'fallback-token', user: parsed.user } as any);
            setLoading(false);
            return;
          }
        } catch (e) {}
      }
      const lastRole = localStorage.getItem('ms_last_active_role') || 'tecnico';
      setRole(lastRole);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setSession(session);
        setUser(session.user);
        const userRole = session.user.user_metadata?.role || localStorage.getItem('ms_last_active_role') || 'tecnico';
        localStorage.setItem('ms_auth_fallback_session', JSON.stringify({
          user: session.user,
          role: userRole
        }));
        await loadUserRole(session.user);
      } else {
        // Blindagem contra perda de sessão em oscilações de rede offline
        const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
        const stored = localStorage.getItem('ms_auth_fallback_session');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed.user) {
              setUser(parsed.user);
              setRole(parsed.role || 'tecnico');
              setSession({ access_token: 'fallback-token', user: parsed.user } as any);
              setLoading(false);
              return;
            }
          } catch (e) {}
        }
        if (!isOffline) {
          setSession(null);
          setUser(null);
          setRole(null);
        }
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, role, loading, logout, setFallbackSession }}>
      {children}
    </AuthContext.Provider>
  );
};

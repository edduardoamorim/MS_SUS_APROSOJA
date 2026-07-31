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

    const metaRole = usr.user_metadata?.role;
    if (metaRole) {
      setRole(metaRole);
      return;
    }

    try {
      const { data: byId } = await supabase.from('perfis').select('role').eq('id', usr.id).maybeSingle();
      if (byId?.role) {
        setRole(byId.role);
        return;
      }

      if (usr.email) {
        const cleanEmail = usr.email.trim().toLowerCase();
        const { data: byEmail } = await supabase.from('perfis').select('role').ilike('email', cleanEmail).maybeSingle();
        if (byEmail?.role) {
          setRole(byEmail.role);
          return;
        }

        if (cleanEmail.includes('tecnico') || cleanEmail.includes('analistacampo')) {
          setRole('tecnico');
          return;
        }
        if (cleanEmail.includes('gestor')) {
          setRole('gestor');
          return;
        }
        if (cleanEmail.includes('produtor')) {
          setRole('produtor');
          return;
        }
      }

      setRole('produtor');
    } catch (e) {
      console.warn('Erro ao carregar papel do usuário:', e);
      setRole('produtor');
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
        loadUserRole(session.user).finally(() => setLoading(false));
      } else {
        const stored = localStorage.getItem('ms_auth_fallback_session');
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (parsed.user && parsed.role) {
              setSession({ access_token: 'fallback-token', user: parsed.user } as any);
              setUser(parsed.user);
              setRole(parsed.role);
              setLoading(false);
              return;
            }
          } catch (e) {
            localStorage.removeItem('ms_auth_fallback_session');
          }
        }
        setSession(null);
        setUser(null);
        setRole(null);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setSession(session);
        setUser(session.user);
        await loadUserRole(session.user);
      } else {
        const stored = localStorage.getItem('ms_auth_fallback_session');
        if (!stored) {
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

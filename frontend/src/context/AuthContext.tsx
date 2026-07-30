import React, { useState, useEffect, createContext, useContext } from 'react';

import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  role: string | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  role: null,
  loading: true,
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
      // 1. Tenta buscar por ID na tabela perfis
      const { data: byId } = await supabase.from('perfis').select('role').eq('id', usr.id).maybeSingle();
      if (byId?.role) {
        setRole(byId.role);
        return;
      }

      // 2. Se não achou por ID, tenta buscar por e-mail
      if (usr.email) {
        const cleanEmail = usr.email.trim().toLowerCase();
        const { data: byEmail } = await supabase.from('perfis').select('role').ilike('email', cleanEmail).maybeSingle();
        if (byEmail?.role) {
          setRole(byEmail.role);
          return;
        }

        // 3. Fallback inteligente por convenção de e-mail de teste
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

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserRole(session.user).finally(() => setLoading(false));
      } else {
        setRole(null);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await loadUserRole(session.user);
      } else {
        setRole(null);
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ session, user, role, loading }}>
      {children}
    </AuthContext.Provider>
  );
};


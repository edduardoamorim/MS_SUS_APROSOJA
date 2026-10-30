import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  allowedRoles: string[];
}

export default function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { user, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-2 text-emerald-700">
          <Loader2 className="w-8 h-8 animate-spin" />
          <p className="font-medium">Carregando permissões...</p>
        </div>
      </div>
    );
  }

  // Se não houver usuário no AuthContext
  if (!user) {
    // Blindagem de Contingência Offline: se houver sessão de fallback em localStorage, autoriza
    const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('ms_auth_fallback_session') : null;
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed?.user) {
          const userRole = parsed.role || 'tecnico';
          if (allowedRoles.includes(userRole)) {
            return <Outlet />;
          }
        }
      } catch (e) {}
    }
    return <Navigate to="/login" replace />;
  }

  // Se estiver logado mas a role não bater
  if (!role || !allowedRoles.includes(role)) {
    const lastRole = typeof localStorage !== 'undefined' ? localStorage.getItem('ms_last_active_role') : null;
    if (lastRole && allowedRoles.includes(lastRole)) {
      return <Outlet />;
    }
    return <Navigate to="/unauthorized" replace />;
  }

  // Se tudo certo, renderiza o componente filho
  return <Outlet />;
}

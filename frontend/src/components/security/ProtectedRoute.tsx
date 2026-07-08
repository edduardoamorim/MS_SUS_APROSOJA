
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

  // Se não estiver logado, redireciona para o login
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Se estiver logado mas a role não bater, redireciona para Não Autorizado
  if (!role || !allowedRoles.includes(role)) {
    return <Navigate to="/unauthorized" replace />;
  }

  // Se tudo certo, renderiza o componente filho (Outlet gerencia as rotas filhas)
  return <Outlet />;
}

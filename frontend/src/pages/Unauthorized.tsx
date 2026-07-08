
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';

export default function Unauthorized() {
  const navigate = useNavigate();
  const { role } = useAuth();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const handleGoBack = () => {
    if (role === 'produtor') navigate('/produtor');
    else if (role === 'tecnico') navigate('/tecnico');
    else if (role === 'gestor') navigate('/gestor');
    else navigate('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-10 rounded-xl shadow-sm border border-gray-100 text-center">
        <div className="flex justify-center">
          <div className="bg-red-100 p-4 rounded-full">
            <AlertTriangle className="w-12 h-12 text-red-600" />
          </div>
        </div>
        <div>
          <h2 className="mt-4 text-3xl font-extrabold text-gray-900">
            Acesso Negado
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Você não possui permissões suficientes para acessar esta página.
            Seu perfil atual é: <span className="font-bold text-gray-900 uppercase">{role || 'Desconhecido'}</span>.
          </p>
        </div>
        <div className="flex flex-col gap-3 mt-6">
          <button
            onClick={handleGoBack}
            className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700"
          >
            Voltar para meu Painel
          </button>
          <button
            onClick={handleLogout}
            className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            Sair e Entrar com outra conta
          </button>
        </div>
      </div>
    </div>
  );
}

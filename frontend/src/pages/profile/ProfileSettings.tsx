import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { User, Mail, Shield, Loader2, CheckCircle2, ArrowLeft, Eye, EyeOff } from 'lucide-react';

export default function ProfileSettings() {
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password.length < 8) {
      return setError('A senha deve ter pelo menos 8 caracteres.');
    }
    const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;
    if (!PASSWORD_REGEX.test(password)) {
      return setError('A senha deve conter pelo menos uma letra maiúscula, uma letra minúscula, um número e um caractere especial.');
    }
    
    setLoading(true);
    setError('');
    setSuccess('');

    const { error: updateError } = await supabase.auth.updateUser({
      password: password
    });

    if (updateError) {
      setError(updateError.message);
    } else {
      setSuccess('Senha atualizada com sucesso!');
      setPassword('');
    }
    setLoading(false);
  };

  if (!user) return null;

  return (
    <div className="space-y-8 max-w-4xl mx-auto">
      {/* Header com Navegação Explícita */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-200/60 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Meu Perfil</h1>
          <p className="text-gray-500 mt-1">Gerencie suas configurações e credenciais de segurança.</p>
        </div>
        
        {/* Botão de Voltar Redundante para acessibilidade */}
        <button 
          onClick={() => navigate(-1)}
          className="hidden sm:flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-gray-900 bg-white hover:bg-gray-50 border border-gray-200 px-4 py-2 rounded-xl shadow-sm transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar ao Painel
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Card 1: Informações de Perfil */}
        <div className="bg-white/80 backdrop-blur-sm shadow-sm border border-emerald-100 rounded-2xl overflow-hidden group hover:shadow-md transition-shadow duration-300">
          <div className="px-6 py-5 border-b border-emerald-50 bg-gradient-to-r from-emerald-50 to-teal-50 flex items-center gap-3">
            <div className="bg-white p-2 rounded-lg shadow-sm">
              <User className="w-5 h-5 text-emerald-600" />
            </div>
            <h2 className="font-bold text-lg text-emerald-900">Dados da Conta</h2>
          </div>
          
          <div className="p-6">
            <dl className="space-y-6">
              <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-100">
                <dt className="text-sm font-semibold text-gray-500 flex items-center gap-2 mb-1 uppercase tracking-wider">
                  <Mail className="w-4 h-4 text-emerald-600" /> E-mail de Acesso
                </dt>
                <dd className="text-base text-gray-900 font-medium truncate">{user.email}</dd>
              </div>
              
              <div className="bg-emerald-50/30 p-4 rounded-xl border border-emerald-100/50">
                <dt className="text-sm font-semibold text-gray-500 flex items-center gap-2 mb-1 uppercase tracking-wider">
                  <Shield className="w-4 h-4 text-emerald-600" /> Nível de Acesso (RBAC)
                </dt>
                <dd className="mt-1">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-black bg-emerald-100 text-emerald-800 uppercase tracking-widest border border-emerald-200 shadow-sm">
                    {role || 'Não definido'}
                  </span>
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {/* Card 2: Segurança */}
        <div className="bg-white/80 backdrop-blur-sm shadow-sm border border-gray-200/60 rounded-2xl overflow-hidden group hover:shadow-md transition-shadow duration-300">
          <div className="px-6 py-5 border-b border-gray-100 bg-gray-50 flex items-center gap-3">
            <div className="bg-white p-2 rounded-lg shadow-sm">
              <Shield className="w-5 h-5 text-gray-700" />
            </div>
            <h2 className="font-bold text-lg text-gray-900">Segurança de Senha</h2>
          </div>
          
          <div className="p-6">
            <form onSubmit={handleUpdatePassword} className="space-y-5">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-sm font-medium animate-fade-in-down">
                  {error}
                </div>
              )}
              {success && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-2 animate-fade-in-down">
                  <CheckCircle2 className="w-5 h-5" /> {success}
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-sm font-bold text-gray-700">Definir Nova Senha</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres (Maiúscula, Minúscula, Número, Símbolo)"
                    className="block w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all text-sm bg-gray-50 focus:bg-white text-foreground"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-gray-400 hover:text-gray-600 rounded-lg transition-colors cursor-pointer"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
                <span className="text-[10px] text-gray-500 block mt-1 leading-normal font-semibold">
                  A senha deve conter pelo menos 8 caracteres, com uma letra maiúscula, uma letra minúscula, um número e um caractere especial.
                </span>
              </div>
              
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-xl shadow-sm text-sm font-bold text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-70 transition-colors"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : null}
                {loading ? 'Atualizando...' : 'Salvar Nova Senha'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

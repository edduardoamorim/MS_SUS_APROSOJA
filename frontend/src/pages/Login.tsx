import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate, Link } from 'react-router-dom';
import { ShieldCheck, Loader2, Play, Users, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../context/ToastContext';

export default function Login() {
  const navigate = useNavigate();
  const { info } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError('E-mail ou senha inválidos.');
      setLoading(false);
      return;
    }

    if (data.user) {
      const role = data.user.user_metadata?.role;
      if (role === 'produtor') navigate('/produtor');
      else if (role === 'tecnico') navigate('/tecnico');
      else if (role === 'gestor') navigate('/gestor');
      else navigate('/');
    }
  };

  const handleCreateTestUsers = async () => {
    setLoading(true);
    setError('');
    try {
      const usersToCreate = [
        { email: 'gestor@ms.gov.br', name: 'Gestor Teste MS', role: 'gestor' },
        { email: 'tecnico@ms.gov.br', name: 'Técnico Teste MS', role: 'tecnico' },
        { email: 'produtor@ms.gov.br', name: 'Produtor Teste MS', role: 'produtor' }
      ];

      for (const u of usersToCreate) {
        // Tenta criar
        const { error: signUpError } = await supabase.auth.signUp({
          email: u.email,
          password: 'Senha@123',
          options: { data: { full_name: u.name, role: u.role } }
        });

        if (signUpError && signUpError.message.includes('already registered')) {
          // Se já existe, tenta fazer login com a senha antiga para atualizar para a nova
          try {
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
              email: u.email,
              password: 'senha123',
            });

            if (!signInError && signInData.user) {
              // Se conseguiu entrar com a antiga, atualiza para a nova
              await supabase.auth.updateUser({ password: 'Senha@123' });
              await supabase.auth.signOut();
            }
          } catch (e) {
            console.error('Erro ao atualizar senha antiga para:', u.email, e);
          }
        } else if (signUpError) {
          throw signUpError;
        }
      }

      info('Contas de teste garantidas no banco local com a nova senha de segurança!\n- gestor@ms.gov.br (Senha@123)\n- tecnico@ms.gov.br (Senha@123)\n- produtor@ms.gov.br (Senha@123)', 6000);
    } catch (err: any) {
      console.error(err);
      setError('Erro ao criar/atualizar usuários de teste: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleQuickLogin = async (selectedEmail: string) => {
    setLoading(true);
    setError('');
    setEmail(selectedEmail);
    setPassword('Senha@123');

    try {
      let { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: selectedEmail,
        password: 'Senha@123',
      });

      // Compatibilidade retroativa se a conta já existia no banco local com a senha antiga
      if (signInError) {
        const { data: retryData, error: retryError } = await supabase.auth.signInWithPassword({
          email: selectedEmail,
          password: 'senha123',
        });

        if (retryError) {
          setError('Conta de teste não encontrada ou senha incorreta. Se você alterou a senha no perfil, digite-a manualmente.');
          setLoading(false);
          return;
        }
        
        data = retryData;
        setPassword('senha123');
      }

      if (data.user) {
        const role = data.user.user_metadata?.role;
        if (role === 'produtor') navigate('/produtor');
        else if (role === 'tecnico') navigate('/tecnico');
        else if (role === 'gestor') navigate('/gestor');
        else navigate('/');
      }
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <ShieldCheck className="w-16 h-16 text-emerald-700" />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Acesse sua Conta
        </h2>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100 animate-in fade-in duration-300">
          <form className="space-y-6" onSubmit={handleLogin}>
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm text-center font-medium">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-sm font-medium text-gray-700">E-mail</label>
              <div className="mt-1">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-foreground"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="block text-sm font-medium text-gray-700">Senha</label>
                <div className="text-sm">
                  <Link to="/esqueci-a-senha" className="font-medium text-emerald-600 hover:text-emerald-500">
                    Esqueceu a senha?
                  </Link>
                </div>
              </div>
              <div className="mt-1 relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 pr-10 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm text-foreground animate-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600 rounded-lg transition-colors cursor-pointer"
                >
                  {showPassword ? (
                    <EyeOff className="w-4.5 h-4.5" />
                  ) : (
                    <Eye className="w-4.5 h-4.5" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-70 cursor-pointer font-bold"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Entrar'}
              </button>
            </div>
          </form>
          
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">Novo por aqui?</span>
              </div>
            </div>

            <div className="mt-6">
              <Link
                to="/cadastro"
                className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
              >
                Cadastre-se na Plataforma
              </Link>
            </div>
          </div>
        </div>

        {/* Painel de Desenvolvimento/Testes */}
        <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 animate-in slide-in-from-bottom-2 duration-300">
          <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
            <Users className="w-5 h-5 text-emerald-800" />
            <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">
              Painel de Testes & Desenvolvimento
            </h3>
          </div>
          
          <p className="text-xs text-slate-600 leading-relaxed font-medium">
            Como gestores e técnicos são cadastrados diretamente no banco de dados, você pode usar os botões abaixo para criar as contas e fazer login com um clique no ambiente local.
          </p>

          <div className="flex flex-col gap-2.5">
            <button
              onClick={handleCreateTestUsers}
              className="w-full py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded text-xs font-bold transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
            >
              <Play className="w-3.5 h-3.5 fill-current" /> Criar/Garantir Contas de Teste no Banco
            </button>

            <div className="grid grid-cols-3 gap-2 pt-1">
              <button
                onClick={() => handleQuickLogin('gestor@ms.gov.br')}
                className="py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded text-[11px] font-bold transition-all cursor-pointer shadow-sm"
              >
                Gestor
              </button>
              <button
                onClick={() => handleQuickLogin('tecnico@ms.gov.br')}
                className="py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded text-[11px] font-bold transition-all cursor-pointer shadow-sm"
              >
                Técnico
              </button>
              <button
                onClick={() => handleQuickLogin('produtor@ms.gov.br')}
                className="py-2 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 rounded text-[11px] font-bold transition-all cursor-pointer shadow-sm"
              >
                Produtor
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

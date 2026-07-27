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
      let role = data.user.user_metadata?.role;
      if (!role) {
        try {
          const { data: profile } = await supabase.from('perfis').select('role').eq('id', data.user.id).maybeSingle();
          role = profile?.role;
        } catch (e) {
          console.warn('Erro ao buscar perfil:', e);
        }
      }
      if (role === 'produtor') navigate('/produtor');
      else if (role === 'tecnico') navigate('/tecnico');
      else if (role === 'gestor') navigate('/gestor');
      else navigate('/produtor');
    }
  };

  const TEST_USERS: Record<string, { name: string; role: string }> = {
    'gestor@ms.gov.br': { name: 'Gestor Teste MS', role: 'gestor' },
    'tecnico@ms.gov.br': { name: 'Técnico Teste MS', role: 'tecnico' },
    'produtor@ms.gov.br': { name: 'Produtor Teste MS', role: 'produtor' },
  };

  const withRetry = async <T,>(fn: () => Promise<T>, retries = 3, delayMs = 1000): Promise<T> => {
    let lastError: any;
    for (let i = 0; i < retries; i++) {
      try {
        return await fn();
      } catch (err: any) {
        lastError = err;
        if (err?.message?.toLowerCase().includes('failed to fetch') && i < retries - 1) {
          await new Promise((res) => setTimeout(res, delayMs));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  };

  const ensureAndSignInTestUser = async (selectedEmail: string) => {
    const userInfo = TEST_USERS[selectedEmail] || { name: 'Usuário Teste', role: 'produtor' };
    
    try {
      return await withRetry(async () => {
        // 1. Tenta login com a senha padrao Senha@123
        let { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: selectedEmail,
          password: 'Senha@123',
        });

        // 2. Se falhar com Senha@123, tenta com a senha legada senha123
        if (signInError) {
          if (signInError.message?.toLowerCase().includes('failed to fetch')) {
            throw signInError;
          }

          const { data: legacyData, error: legacyError } = await supabase.auth.signInWithPassword({
            email: selectedEmail,
            password: 'senha123',
          });

          if (!legacyError && legacyData.user) {
            try {
              await supabase.auth.updateUser({ password: 'Senha@123' });
            } catch (e) {
              console.warn('Erro ao atualizar senha legada:', e);
            }
            data = legacyData;
          } else {
            if (legacyError?.message?.toLowerCase().includes('failed to fetch')) {
              throw legacyError;
            }

            // 3. Tenta auto-criar a conta via signUp
            const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
              email: selectedEmail,
              password: 'Senha@123',
              options: {
                data: { full_name: userInfo.name, role: userInfo.role }
              }
            });

            if (signUpError && !signUpError.message.includes('already registered')) {
              if (signUpError.message?.toLowerCase().includes('failed to fetch')) {
                throw signUpError;
              }
              throw signUpError;
            }

            // Se o signUp ja retornou uma sessao/usuario ativo
            if (signUpData?.user && signUpData?.session) {
              data = signUpData;
            } else {
              // Tenta sign in logo apos o signUp
              const { data: finalSignInData, error: finalError } = await supabase.auth.signInWithPassword({
                email: selectedEmail,
                password: 'Senha@123',
              });

              if (finalError) {
                if (finalError.message?.toLowerCase().includes('failed to fetch')) {
                  throw finalError;
                }
                if (finalError.message?.toLowerCase().includes('email not confirmed')) {
                  throw new Error('E-mail de teste não confirmado no Supabase Cloud. Confirme o e-mail ou desative a confirmação no painel do Supabase.');
                }
                throw new Error('Conta de teste existe com senha personalizada ou e-mail pendente. Digite a senha manualmente.');
              }

              data = finalSignInData;
            }
          }
        }

        return data;
      });
    } catch (err: any) {
      if (err?.message?.toLowerCase().includes('failed to fetch')) {
        throw new Error('Falha de conexão com o Supabase. Verifique se o Docker e os containers do banco de dados estão rodando.');
      }
      throw err;
    }
  };

  const handleCreateTestUsers = async () => {
    setLoading(true);
    setError('');
    try {
      for (const email of Object.keys(TEST_USERS)) {
        await ensureAndSignInTestUser(email);
        await supabase.auth.signOut();
      }

      info('Contas de teste garantidas no banco local com a senha Senha@123!\n- gestor@ms.gov.br\n- tecnico@ms.gov.br\n- produtor@ms.gov.br', 6000);
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
      const data = await ensureAndSignInTestUser(selectedEmail);

      if (data.user) {
        const role = data.user.user_metadata?.role || TEST_USERS[selectedEmail]?.role;
        if (role === 'produtor') navigate('/produtor');
        else if (role === 'tecnico') navigate('/tecnico');
        else if (role === 'gestor') navigate('/gestor');
        else navigate('/');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao efetuar login de teste.');
    } finally {
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
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100 animate-zoom-in">
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
        <div className="mt-6 bg-slate-50 border border-slate-200 rounded-xl p-5 shadow-sm space-y-4 animate-fade-in-up delay-100" style={{ animationFillMode: 'both' }}>
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

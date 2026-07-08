import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { KeyRound, Loader2, Lock } from 'lucide-react';
import { useToast } from '../../context/ToastContext';

export default function ResetPassword() {
  const navigate = useNavigate();
  const { success } = useToast();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Supabase injeta um access_token na hash da URL após clicar no e-mail
    // Se a sessão foi restabelecida com sucesso pelo onAuthStateChange, a senha pode ser alterada.
  }, []);

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      return setError('As senhas não coincidem.');
    }
    
    setLoading(true);
    setError('');

    const { error: updateError } = await supabase.auth.updateUser({
      password: password
    });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
    } else {
      // Senha atualizada com sucesso, como a sessão foi restabelecida, o usuário já pode ser redirecionado
      success("Senha atualizada com sucesso!");
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 overflow-hidden bg-slate-900">
      
      {/* Dynamic Background Elements */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-emerald-500/20 blur-[120px] mix-blend-screen animate-pulse duration-10000" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-teal-500/20 blur-[120px] mix-blend-screen animate-pulse duration-7000" />
        <div className="absolute top-[40%] left-[60%] w-[30%] h-[30%] rounded-full bg-cyan-500/20 blur-[100px] mix-blend-screen" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        
        {/* Logo/Header */}
        <div className="text-center mb-8 animate-fade-in-up">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl mb-6">
            <KeyRound className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-3xl font-bold text-white tracking-tight">
            Criar Nova Senha
          </h2>
          <p className="mt-3 text-slate-400">
            Digite sua nova senha abaixo para acessar sua conta.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-2xl rounded-3xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.3)] border border-white/10 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          <form className="space-y-6" onSubmit={handleUpdate}>
            {error && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm font-medium text-red-400 text-center animate-fade-in">
                {error}
              </div>
            )}
            
            <div className="space-y-4">
              {/* Senha */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300 ml-1">Nova Senha</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-emerald-400 transition-colors" />
                  </div>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="block w-full pl-11 pr-4 py-3.5 bg-slate-900/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all duration-200"
                  />
                </div>
              </div>

              {/* Confirmar Senha */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300 ml-1">Confirmar Nova Senha</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-slate-400 group-focus-within:text-emerald-400 transition-colors" />
                  </div>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a senha"
                    className="block w-full pl-11 pr-4 py-3.5 bg-slate-900/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all duration-200"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !password || !confirmPassword}
              className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Nova Senha'
              )}
            </button>
          </form>
        </div>
        
        {/* Footer */}
        <p className="mt-10 text-center text-xs text-slate-500">
          © 2026 Programa MS Sustentável - RTRS. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}

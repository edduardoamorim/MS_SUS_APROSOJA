import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import { KeyRound, Loader2, CheckCircle2, ArrowLeft, Mail, ExternalLink } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Verifica se o e-mail existe no sistema
    const { data: emailExists, error: checkError } = await supabase.rpc('check_email_exists', { p_email: email });

    if (checkError) {
      setError('Erro ao verificar e-mail. Tente novamente.');
      setLoading(false);
      return;
    }

    if (!emailExists) {
      setError('Este e-mail não está cadastrado no sistema.');
      setLoading(false);
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/redefinir-senha`,
    });

    if (resetError) {
      setError(resetError.message);
    } else {
      setSuccess(true);
    }
    setLoading(false);
  };

  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

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
            Recuperar Senha
          </h2>
          <p className="mt-3 text-slate-400">
            Informe seu e-mail para receber as instruções de redefinição.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/10 backdrop-blur-2xl rounded-3xl p-8 shadow-[0_8px_32px_rgba(0,0,0,0.3)] border border-white/10 animate-fade-in-up" style={{ animationDelay: '100ms' }}>
          {success ? (
            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center w-20 h-20 bg-emerald-500/20 rounded-full mb-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
              </div>
              <h3 className="text-2xl font-bold text-white">E-mail enviado!</h3>
              <p className="text-slate-300">
                Enviamos um link de redefinição para <span className="font-semibold text-white">{email}</span>.
              </p>
              
              {isLocalhost && (
                <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-left">
                  <p className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-2">Ambiente Local (Desenvolvimento)</p>
                  <p className="text-sm text-blue-200 mb-3">
                    Como você está rodando localmente, o e-mail não vai para a sua caixa real. Verifique o servidor local de e-mails (Inbucket).
                  </p>
                  <a 
                    href="http://localhost:54324" 
                    target="_blank" 
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 px-4 py-2 rounded-lg transition-colors"
                  >
                    Abrir Caixa de E-mail Local <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}

              <div className="pt-6">
                <Link 
                  to="/login" 
                  className="inline-flex items-center justify-center gap-2 w-full py-3 px-4 bg-white/5 hover:bg-white/10 text-white font-medium rounded-xl border border-white/10 transition-all duration-200 hover:scale-[1.02]"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Voltar para o Login
                </Link>
              </div>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleReset}>
              {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-sm font-medium text-red-400 text-center animate-fade-in">
                  {error}
                </div>
              )}
              
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300 ml-1">E-mail de Cadastro</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-slate-400 group-focus-within:text-emerald-400 transition-colors" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="voce@exemplo.com.br"
                    className="block w-full pl-11 pr-4 py-3.5 bg-slate-900/50 border border-white/10 rounded-xl text-white placeholder-slate-500 focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-all duration-200"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !email}
                className="w-full flex justify-center items-center gap-2 py-3.5 px-4 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:-translate-y-0.5"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  'Enviar Link de Recuperação'
                )}
              </button>

              <div className="text-center pt-2">
                <Link 
                  to="/login" 
                  className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Lembrei minha senha
                </Link>
              </div>
            </form>
          )}
        </div>
        
        {/* Footer */}
        <p className="mt-10 text-center text-xs text-slate-500">
          © 2026 Programa MS Sustentável - RTRS. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
}

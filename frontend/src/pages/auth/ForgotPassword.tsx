import React, { useState } from 'react';

import { supabase } from '../../lib/supabase';
import { Link } from 'react-router-dom';
import { KeyRound, Loader2, CheckCircle2 } from 'lucide-react';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

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

  return (
    <div className="min-h-[80vh] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <KeyRound className="w-12 h-12 text-emerald-700 mx-auto" />
        <h2 className="mt-6 text-3xl font-extrabold text-gray-900">Recuperar Senha</h2>
        <p className="mt-2 text-sm text-gray-600">
          Informe seu e-mail para receber as instruções.
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-gray-100">
          {success ? (
            <div className="text-center space-y-4">
              <div className="bg-emerald-100 text-emerald-700 p-4 rounded-full inline-block">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-medium text-gray-900">E-mail enviado!</h3>
              <p className="text-sm text-gray-500">
                Verifique sua caixa de entrada (e pasta de spam) para o link de redefinição.
              </p>
              <div className="mt-6">
                <Link to="/login" className="font-medium text-emerald-600 hover:text-emerald-500">
                  Voltar para o Login
                </Link>
              </div>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleReset}>
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded text-sm text-center font-medium">
                  {error}
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700">Seu E-mail</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-emerald-500 focus:border-emerald-500 sm:text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none disabled:opacity-70"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enviar Link de Recuperação'}
              </button>

              <div className="text-center mt-4">
                <Link to="/login" className="font-medium text-gray-600 hover:text-gray-900 text-sm">
                  Cancelar
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}



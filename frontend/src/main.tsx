import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { isSupabaseConfigured } from './lib/supabase'

function DevDiagnosticScreen() {
  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-6 font-sans">
      <div className="max-w-2xl w-full bg-slate-850 border border-slate-700 rounded-2xl shadow-2xl p-8 space-y-6">
        {/* Header */}
        <div className="flex items-center space-x-4 border-b border-slate-750 pb-5">
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide">Vite Dev Server Conectado!</h1>
            <p className="text-sm text-slate-400">A infraestrutura de rede e portas do Codespaces está funcionando perfeitamente.</p>
          </div>
        </div>

        {/* Content */}
        <div className="space-y-4">
          <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 text-sm flex items-start space-x-3">
            <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
            </svg>
            <div>
              <span className="font-semibold block mb-0.5">Configuração do Supabase Ausente no Frontend</span>
              As variáveis de ambiente necessárias para o banco de dados não foram encontradas.
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-sm text-slate-300">
              Para o frontend se comunicar com o banco de dados, você precisa configurar o arquivo <code className="px-1.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-amber-400 font-mono text-xs">.env.local</code> dentro da subpasta <code className="px-1.5 py-0.5 bg-slate-950 border border-slate-700 rounded text-slate-300 font-mono text-xs">frontend/</code>.
            </p>

            <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 space-y-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider block">Estrutura esperada em frontend/.env.local</span>
              <pre className="text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap select-all p-2 bg-slate-900/50 rounded border border-slate-900">
{`# Credenciais do Supabase para o Frontend
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anon-key-aqui`}
              </pre>
            </div>

            <div className="bg-slate-900/40 p-4 rounded-xl border border-slate-800 text-xs text-slate-400 space-y-2">
              <span className="font-semibold text-slate-300 block">Como obter essas chaves no Supabase:</span>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Acesse o painel do seu projeto no Supabase.</li>
                <li>Vá em <strong>Project Settings</strong> (Ícone de Engrenagem) &gt; <strong>API</strong>.</li>
                <li>Copie a <strong>Project URL</strong> e insira no <code className="text-amber-400 font-mono">VITE_SUPABASE_URL</code>.</li>
                <li>Copie a chave <strong>anon public</strong> (não use a service_role!) e insira no <code className="text-amber-400 font-mono">VITE_SUPABASE_ANON_KEY</code>.</li>
              </ol>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-4 border-t border-slate-750 flex justify-between items-center text-xs text-slate-500">
          <span>MS Sustentável - Ambiente de Desenvolvimento</span>
          <span className="flex items-center space-x-1.5 text-emerald-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Vite + React Ativo</span>
          </span>
        </div>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isSupabaseConfigured ? <App /> : <DevDiagnosticScreen />}
  </StrictMode>,
)


import React, { useState, useEffect, useRef } from 'react';
import { WifiOff, Database, RefreshCw, CheckCircle2, AlertTriangle, Trash2, LogIn } from 'lucide-react';
import { useSync } from '../../context/SyncContext';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { syncEngine } from '../../services/syncEngine';
import { db } from '../../lib/offlineDb';

export default function SyncStatusBar() {
  const { connectionState, isOnline, isSyncing, pendingCounts, syncProgress, syncNow, purgeQueue } = useSync();
  const { user, logout } = useAuth();
  const [purging, setPurging] = useState(false);

  // DEBOUNCE E ESTABILIZAÇÃO DE TRANSIÇÃO DE ESTADOS (MÍNIMO 1 SEGUNDO)
  // Previne flapping rápido entre [Atenção] -> [Sincronizando] -> [Sinal Instável]
  const [activeDisplayPhase, setActiveDisplayPhase] = useState(syncProgress.phase);
  const lastPhaseChangeRef = useRef<number>(Date.now());
  const pendingPhaseRef = useRef(syncProgress.phase);

  useEffect(() => {
    const now = Date.now();
    const elapsed = now - lastPhaseChangeRef.current;
    pendingPhaseRef.current = syncProgress.phase;

    // Feedback imediato quando começar a sincronizar ou em caso de logout
    if (syncProgress.phase === 'syncing' || isSyncing) {
      setActiveDisplayPhase('syncing');
      lastPhaseChangeRef.current = now;
      return;
    }

    // Feedback imediato para offline (0ms) - NUNCA debouncar transição para Modo Campo!
    if (!isOnline || syncProgress.phase === 'offline' || connectionState === 'OFFLINE') {
      setActiveDisplayPhase('offline');
      lastPhaseChangeRef.current = now;
      return;
    }

    // Debounce de transição apenas para estados de aviso/erro transitório
    if (elapsed >= 1000) {
      setActiveDisplayPhase(syncProgress.phase);
      lastPhaseChangeRef.current = now;
    } else {
      const remaining = 1000 - elapsed;
      const timer = setTimeout(() => {
        setActiveDisplayPhase(pendingPhaseRef.current);
        lastPhaseChangeRef.current = Date.now();
      }, remaining);
      return () => clearTimeout(timer);
    }
  }, [syncProgress.phase, isSyncing, isOnline, connectionState]);

  // Auto-limpeza reativa: se o usuário está autenticado, nunca permite fase auth_required presa
  useEffect(() => {
    if (user && syncProgress.phase === 'auth_required') {
      syncEngine.clearAuthError();
    }
  }, [user, syncProgress.phase]);

  // Auto-dreno resiliente da fila quando conectado à rede com pendências locais
  // Bloqueado se estiver em partial_failure ou error para evitar loop de flapping a cada 1s
  useEffect(() => {
    if (
      isOnline &&
      pendingCounts.total > 0 &&
      !isSyncing &&
      syncProgress.phase !== 'auth_required' &&
      syncProgress.phase !== 'error' &&
      syncProgress.phase !== 'partial_failure'
    ) {
      const timer = setTimeout(() => {
        syncNow(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [isOnline, pendingCounts.total, isSyncing, syncProgress.phase]);

  const isActuallyOffline =
    (typeof navigator !== 'undefined' && !navigator.onLine) ||
    !isOnline ||
    connectionState === 'OFFLINE' ||
    activeDisplayPhase === 'offline' ||
    syncProgress.phase === 'offline';

  const isIdle =
    !isActuallyOffline &&
    (activeDisplayPhase === 'idle' || syncProgress.phase === 'idle') &&
    !isSyncing &&
    pendingCounts.total === 0 &&
    isOnline &&
    connectionState !== 'OFFLINE' &&
    (pendingCounts.deadLetter || 0) === 0;

  const renderContent = () => {
    // 1. Fase offline prioritária (Modo Campo Ativo confirmado - 0ms)
    if (isActuallyOffline) {
      return (
        <div className="bg-gradient-to-r from-amber-700 via-amber-800 to-amber-900 text-white px-4 py-2 sm:py-2.5 shadow-md flex items-center justify-between text-xs sm:text-sm font-semibold border-b border-amber-950 animate-fade-in">
          <div className="flex items-center gap-2 max-w-5xl mx-auto w-full justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="p-1 bg-white/20 rounded-md shrink-0">
                <WifiOff className="w-4 h-4 text-amber-100" />
              </div>
              <div className="truncate">
                <span className="font-extrabold uppercase tracking-wide text-amber-200 mr-1.5">[Modo Campo Ativo]</span>
                <span className="truncate">Você está offline. Vistorias, respostas e fotos serão salvas no aparelho.</span>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-black/30 px-2.5 py-1 rounded-full text-xs font-bold text-amber-100 border border-white/15 shrink-0">
              <Database className="w-3.5 h-3.5 text-amber-300" />
              <span>{pendingCounts.total} item(ns) na fila local</span>
            </div>
          </div>
        </div>
      );
    }

    // 2. Fase: Sessão Expirada / Login Necessário
    if (activeDisplayPhase === 'auth_required' && !user) {
      const handleLoginOrRevalidate = async () => {
        try {
          if (user) {
            const { data, error: refErr } = await supabase.auth.refreshSession();
            if (!refErr && data?.session) {
              syncEngine.clearAuthError();
              await syncNow(true);
              return;
            }
          }
          await logout();
        } catch (err) {
          console.warn('Erro ao processar redirecionamento de login:', err);
        }
        window.location.href = '/login';
      };

      return (
        <div className="bg-gradient-to-r from-amber-900 via-orange-950 to-amber-950 text-white px-4 py-2.5 shadow-md flex items-center justify-between border-b border-amber-800 animate-fade-in">
          <div className="flex items-center justify-between max-w-5xl mx-auto w-full gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1 bg-amber-500/20 rounded-md shrink-0 border border-amber-400/30">
                <AlertTriangle className="w-4 h-4 text-amber-300" />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 truncate">
                <span className="font-extrabold uppercase tracking-wide text-amber-300 text-xs shrink-0">
                  [Sessão Expirada]
                </span>
                <span className="text-slate-100 text-xs sm:text-sm truncate">
                  Faça login novamente para transmitir os dados de campo salvos no aparelho.
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={handleLoginOrRevalidate}
              className="px-3 py-1 bg-amber-500 hover:bg-amber-600 text-slate-950 font-black rounded-lg text-xs transition-all flex items-center gap-1.5 cursor-pointer shrink-0 shadow-sm"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Fazer Login</span>
            </button>
          </div>
        </div>
      );
    }

    // 3. Fase de sincronização ativa
    if (activeDisplayPhase === 'syncing' || isSyncing) {
      const total = syncProgress.totalItems || pendingCounts.total || 1;
      const completed = syncProgress.completedItems || 0;
      const percent = syncProgress.progressPercent ?? (total > 0 ? Math.round((completed / total) * 100) : 0);

      return (
        <div className="bg-gradient-to-r from-slate-950 via-blue-950 to-slate-950 text-white px-4 py-2.5 shadow-lg border-b border-blue-800/60 relative overflow-hidden animate-fade-in">
          <div className="flex items-center justify-between max-w-5xl mx-auto w-full gap-3">
            {/* Esquerda: Indicador girando + Tipo de item */}
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1 bg-blue-500/20 rounded-md shrink-0 border border-blue-400/30">
                <RefreshCw className="w-4 h-4 text-blue-400 animate-spin" />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 truncate">
                <span className="font-extrabold text-blue-300 uppercase tracking-wider text-[11px] sm:text-xs shrink-0">
                  [Sincronizando]
                </span>
                <span className="text-slate-200 text-xs sm:text-sm font-medium truncate">
                  {syncProgress.currentItemLabel || `Transmitindo dados (${completed} de ${total})...`}
                </span>
              </div>
            </div>

            {/* Direita: Contagem e Percentual autêntico */}
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-[11px] sm:text-xs font-bold text-slate-300 bg-white/10 px-2 py-0.5 rounded-md border border-white/10">
                {completed}/{total}
              </span>
              <span className="font-black text-xs sm:text-sm text-blue-300 min-w-[36px] text-right">
                {percent}%
              </span>
            </div>
          </div>

          {/* Micro barra de progresso horizontal em alto contraste na base */}
          <div className="absolute bottom-0 left-0 right-0 h-1.5 bg-slate-800/90">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-teal-400 to-emerald-400 transition-all duration-300 ease-out shadow-sm"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      );
    }

    // 4. Fase de sucesso efêmero (3 segundos de confirmação)
    if (activeDisplayPhase === 'success' || syncProgress.phase === 'success') {
      const drained = syncProgress.lastDrainedCount || syncProgress.completedItems || 1;

      return (
        <div className="bg-gradient-to-r from-[#1B7547] via-emerald-800 to-[#0B3B23] text-white px-4 py-2 sm:py-2.5 shadow-md flex items-center justify-between text-xs sm:text-sm font-semibold border-b border-emerald-950 animate-fade-in">
          <div className="flex items-center gap-2.5 max-w-5xl mx-auto w-full">
            <div className="p-1 bg-white/20 rounded-md shrink-0">
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
            </div>
            <div className="flex items-center gap-2 truncate">
              <span className="font-extrabold uppercase tracking-wide text-emerald-200">[Sincronizado]</span>
              <span className="truncate">Tudo atualizado com a nuvem! {drained} item(ns) enviados com sucesso.</span>
            </div>
          </div>
        </div>
      );
    }

    // 5. Fase de falha parcial ou erro de envio com Dead-Letter Queue
    if (pendingCounts.total > 0 && (activeDisplayPhase === 'partial_failure' || activeDisplayPhase === 'error' || syncProgress.phase === 'partial_failure' || syncProgress.phase === 'error')) {
      const deadLetterCount = syncProgress.deadLetterCount ?? pendingCounts.deadLetter ?? 0;
      const hasDeadLetter = deadLetterCount > 0;

      const handlePurge = async () => {
        setPurging(true);
        try {
          await db.sync_journal.where('status').equals('failed').delete();
          await purgeQueue();
          syncEngine.clearAuthError();
          setActiveDisplayPhase('idle');
          await syncEngine.notify();
        } catch (err) {
          console.warn('Erro ao purgar itens com falha:', err);
        } finally {
          setPurging(false);
        }
      };

      return (
        <div className="bg-gradient-to-r from-rose-950 via-rose-900 to-red-950 text-white px-4 py-2.5 shadow-md flex items-center justify-between border-b border-rose-950 animate-fade-in">
          <div className="flex items-center justify-between max-w-5xl mx-auto w-full gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="p-1 bg-rose-500/20 rounded-md shrink-0 border border-rose-400/30">
                <AlertTriangle className="w-4 h-4 text-amber-300" />
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-0.5 sm:gap-2 truncate">
                <span className="font-extrabold uppercase tracking-wide text-amber-300 text-xs shrink-0">
                  [Atenção]
                </span>
                <span className="text-slate-100 text-xs sm:text-sm truncate">
                  {syncProgress.errorMessage || (hasDeadLetter ? `${deadLetterCount} item(ns) com pendência de validação.` : 'Falha no envio. Os dados continuam salvos no aparelho.')}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {hasDeadLetter && (
                <button
                  type="button"
                  onClick={handlePurge}
                  disabled={isSyncing || purging}
                  className="px-2.5 py-1 bg-rose-800/80 hover:bg-rose-700 text-rose-100 rounded-lg text-xs font-bold transition-all border border-rose-600/50 flex items-center gap-1.5 cursor-pointer disabled:opacity-60 shadow-xs"
                  title="Descartar registros com erro permanente de validação/schema"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Descartar Inválidos</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => syncNow(true)}
                disabled={isSyncing || purging}
                className={`px-3 py-1 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-bold transition-all border border-white/20 flex items-center gap-1.5 shadow-xs ${
                  isSyncing || purging ? 'pointer-events-none opacity-60 cursor-not-allowed' : 'cursor-pointer active:scale-95'
                }`}
                title="Tentar sincronizar novamente agora"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing || purging ? 'animate-spin' : ''}`} />
                <span>{isSyncing || purging ? 'Sincronizando...' : 'Tentar Novamente'}</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div
      className={`w-full transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] shrink-0 z-30 overflow-hidden ${
        isIdle ? 'max-h-0 opacity-0 pointer-events-none' : 'max-h-20 opacity-100'
      }`}
    >
      {renderContent()}
    </div>
  );
}

import React from 'react';
import { Wifi, WifiOff, RefreshCw, UploadCloud, AlertCircle } from 'lucide-react';
import { useSync } from '../../context/SyncContext';

export default function NetworkStatusIndicator() {
  const { connectionState, isOnline, isSyncing, pendingCounts, syncProgress, syncNow } = useSync();

  return (
    <div className="flex items-center gap-2">
      {/* Badge de Status de Conexão */}
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all shadow-xs border ${
          isSyncing
            ? 'bg-blue-50 text-blue-900 border-blue-300 animate-pulse'
            : connectionState === 'UNSTABLE'
            ? 'bg-amber-50 text-amber-900 border-amber-300'
            : isOnline
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
            : 'bg-amber-50 text-amber-900 border-amber-300 animate-pulse'
        }`}
        title={
          isSyncing
            ? `Sincronizando: ${syncProgress.completedItems} de ${syncProgress.totalItems || pendingCounts.total}`
            : connectionState === 'UNSTABLE'
            ? 'Conexão instável (área rural) - Retries automáticos com backoff exponencial ativos'
            : isOnline
            ? 'Conexão ativa e estável com o Supabase'
            : 'Modo Campo Offline - Todas as alterações estão salvas no dispositivo'
        }
      >
        {isSyncing ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 text-blue-700 animate-spin shrink-0" />
            <span className="hidden sm:inline">Sincronizando</span>
            {syncProgress.totalItems > 0 && (
              <span className="text-[10px] font-black bg-blue-200/70 text-blue-900 px-1.5 py-0.2 rounded-full">
                {syncProgress.completedItems}/{syncProgress.totalItems}
              </span>
            )}
          </>
        ) : connectionState === 'UNSTABLE' ? (
          <>
            <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span className="hidden sm:inline">Sinal Instável</span>
            <span className="sm:hidden">Instável</span>
          </>
        ) : isOnline ? (
          <>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="hidden sm:inline">Online</span>
            <Wifi className="w-3.5 h-3.5 text-emerald-600 sm:hidden" />
          </>
        ) : (
          <>
            <WifiOff className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>Modo Campo</span>
          </>
        )}
      </div>

      {/* Contador de Pendências Locais */}
      {pendingCounts.total > 0 && !isSyncing && (
        <div
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black bg-blue-50 text-blue-800 border border-blue-200 shadow-xs"
          title={`${pendingCounts.mutations} registros e ${pendingCounts.files} fotos gravados localmente aguardando envio`}
        >
          <UploadCloud className="w-3.5 h-3.5 text-blue-600" />
          <span>{pendingCounts.total}</span>
          <span className="hidden md:inline">pendente{pendingCounts.total > 1 ? 's' : ''}</span>
        </div>
      )}

      {/* Botão de Sincronização Manual */}
      <button
        type="button"
        onClick={() => syncNow(true)}
        disabled={isSyncing || connectionState === 'OFFLINE'}
        className={`p-1.5 rounded-lg border transition-all cursor-pointer flex items-center justify-center ${
          isSyncing
            ? 'bg-blue-100 text-blue-800 border-blue-300'
            : isOnline && pendingCounts.total > 0
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700 shadow-sm hover:scale-105 active:scale-95'
            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200 disabled:opacity-50 disabled:cursor-not-allowed'
        }`}
        title={
          isSyncing
            ? `Sincronizando com Supabase (${syncProgress.completedItems}/${syncProgress.totalItems || pendingCounts.total})...`
            : connectionState === 'OFFLINE'
            ? 'Aguardando conexão para sincronizar'
            : pendingCounts.total > 0
            ? `Sincronizar ${pendingCounts.total} pendência(s) de campo agora`
            : 'Tudo sincronizado com o Supabase'
        }
      >
        <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin text-blue-800' : ''}`} />
      </button>
    </div>
  );
}

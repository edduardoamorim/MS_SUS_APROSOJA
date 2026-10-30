import React from 'react';
import { WifiOff, RefreshCw, UploadCloud, AlertCircle } from 'lucide-react';
import { useSync } from '../../context/SyncContext';

export default function NetworkStatusIndicator() {
  const { connectionState, isOnline, isSyncing, pendingCounts, syncProgress, syncNow } = useSync();
  const isActuallyOffline = (typeof navigator !== 'undefined' && !navigator.onLine) || !isOnline || connectionState === 'OFFLINE';

  return (
    <div className="flex items-center gap-2">
      {/* Badge de Status de Conexão - Apenas exibe quando Sincronizando, Modo Campo ou Sinal Instável */}
      {isSyncing ? (
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all shadow-xs border bg-blue-50 text-blue-900 border-blue-300"
          title={`Sincronizando: ${syncProgress.completedItems} de ${syncProgress.totalItems || pendingCounts.total}`}
        >
          <RefreshCw className="w-3.5 h-3.5 text-blue-700 animate-spin shrink-0" />
          <span className="hidden sm:inline">Sincronizando</span>
          {syncProgress.totalItems > 0 && (
            <span className="text-[10px] font-black bg-blue-200/70 text-blue-900 px-1.5 py-0.2 rounded-full">
              {syncProgress.completedItems}/{syncProgress.totalItems}
            </span>
          )}
        </div>
      ) : isActuallyOffline ? (
        <div
          className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-bold transition-all shadow-xs border bg-amber-50 text-amber-950 border-amber-300"
          title="Modo Campo Ativo - Todas as alterações e vistorias estão 100% seguras no aparelho"
        >
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500"></span>
          </span>
          <WifiOff className="w-3.5 h-3.5 text-amber-800 shrink-0" />
          <span>Modo Campo</span>
        </div>
      ) : connectionState === 'UNSTABLE' ? (
        <div
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold transition-all shadow-xs border bg-amber-50 text-amber-900 border-amber-300"
          title="Conexão instável (área rural) - Retries automáticos com backoff exponencial ativos"
        >
          <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
          <span className="hidden sm:inline">Sinal Instável</span>
          <span className="sm:hidden">Instável</span>
        </div>
      ) : null}

      {/* Contador de Pendências Locais: Apenas exibido se houver arquivos/itens aguardando envio (> 0) */}
      {pendingCounts.total > 0 && !isSyncing && (
        <button
          type="button"
          onClick={() => {
            if (!isActuallyOffline) syncNow(true);
          }}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-black shadow-xs border transition-all ${
            !isActuallyOffline
              ? 'bg-blue-50 hover:bg-blue-100 text-blue-900 border-blue-200 cursor-pointer active:scale-95'
              : 'bg-slate-100 text-slate-700 border-slate-200 cursor-default'
          }`}
          title={
            !isActuallyOffline
              ? `${pendingCounts.total} item(ns) gravados localmente. Clique para sincronizar agora!`
              : `${pendingCounts.total} item(ns) salvos no aparelho aguardando conexão.`
          }
        >
          <UploadCloud className="w-3.5 h-3.5 text-blue-600 shrink-0" />
          <span>{pendingCounts.total}</span>
          <span className="hidden md:inline">pendente{pendingCounts.total > 1 ? 's' : ''}</span>
        </button>
      )}
    </div>
  );
}

import React, { createContext, useContext, useState, useEffect } from 'react';
import { syncEngine, type SyncProgressInfo, type ConnectionState } from '../services/syncEngine';
import { purgeCorruptedQueue } from '../lib/offlineDb';
import { useAuth } from './AuthContext';

interface SyncContextType {
  connectionState: ConnectionState;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCounts: { total: number; mutations: number; files: number; deadLetter?: number };
  syncProgress: SyncProgressInfo;
  lastSyncTime: Date | null;
  error?: string | null;
  syncNow: (forceAll?: boolean) => Promise<void>;
  purgeQueue: () => Promise<{ purgedMutations: number; purgedFiles: number }>;
}

const defaultProgress: SyncProgressInfo = {
  phase: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'idle',
  totalItems: 0,
  completedItems: 0,
  progressPercent: 0,
  currentItemLabel: ''
};

const SyncContext = createContext<SyncContextType>({
  connectionState: 'ONLINE',
  isOnline: true,
  isSyncing: false,
  pendingCounts: { total: 0, mutations: 0, files: 0, deadLetter: 0 },
  syncProgress: defaultProgress,
  lastSyncTime: null,
  error: null,
  syncNow: async () => {},
  purgeQueue: async () => ({ purgedMutations: 0, purgedFiles: 0 })
});

export const useSync = () => useContext(SyncContext);

export const SyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, session } = useAuth();

  useEffect(() => {
    syncEngine.setAuthContext(user, session);
    if (user) {
      syncEngine.clearAuthError();
    }
  }, [user, session]);

  const [state, setState] = useState({
    connectionState: syncEngine.connectionState,
    isOnline: syncEngine.isOnline,
    isSyncing: syncEngine.isSyncing,
    pendingCounts: { total: 0, mutations: 0, files: 0, deadLetter: 0 },
    syncProgress: syncEngine.progress || defaultProgress,
    lastSyncTime: syncEngine.lastSyncTime,
    error: null as string | null | undefined
  });

  // Escuta ativa direta dos eventos nativos do navegador (0ms)
  useEffect(() => {
    const handleOnline = () => {
      console.log('[SyncContext] Evento online nativo recebido');
      setState(prev => ({
        ...prev,
        isOnline: true,
        connectionState: prev.connectionState === 'OFFLINE' ? 'ONLINE' : prev.connectionState,
        syncProgress: {
          ...prev.syncProgress,
          phase: prev.syncProgress.phase === 'offline' ? 'idle' : prev.syncProgress.phase
        }
      }));
      syncEngine.setOnlineImmediately();
    };

    const handleOffline = () => {
      console.log('[SyncContext] Evento offline nativo recebido (Modo Campo 0ms)');
      setState(prev => ({
        ...prev,
        isOnline: false,
        connectionState: 'OFFLINE',
        syncProgress: {
          ...prev.syncProgress,
          phase: 'offline'
        }
      }));
      syncEngine.setOfflineImmediately();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    const unsubscribe = syncEngine.subscribe(newState => {
      setState({
        connectionState: newState.connectionState,
        isOnline: newState.isOnline,
        isSyncing: newState.isSyncing,
        pendingCounts: newState.pendingCounts,
        syncProgress: newState.syncProgress,
        lastSyncTime: newState.lastSyncTime,
        error: newState.error
      });
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const handleSyncNow = async (forceAll: boolean = false) => {
    await syncEngine.syncNow(forceAll);
  };

  const handlePurgeQueue = async () => {
    const res = await purgeCorruptedQueue();
    await syncEngine.notify();
    return res;
  };

  return (
    <SyncContext.Provider
      value={{
        connectionState: state.connectionState,
        isOnline: state.isOnline,
        isSyncing: state.isSyncing,
        pendingCounts: state.pendingCounts,
        syncProgress: state.syncProgress,
        lastSyncTime: state.lastSyncTime,
        error: state.error,
        syncNow: handleSyncNow,
        purgeQueue: handlePurgeQueue
      }}
    >
      {children}
    </SyncContext.Provider>
  );
};

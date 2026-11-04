import { normalizePerguntaId } from '../constants/rtrsMapping';
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';
import {
  db,
  getPendingJournalItems,
  markJournalItemStatus,
  removeJournalItem,
  type SyncJournalItem,
  getPendingMutations,
  getPendingFiles,
  getEligibleMutations,
  getEligibleFiles,
  getPendingCounts,
  markMutationStatus,
  markFileStatus,
  markMutationRetry,
  markFileRetry,
  markMutationDeadLetter,
  markFileDeadLetter,
  removeMutation,
  removeFile,
  rescueNotnullFailedMutations,
  rehabilitateFailedQueueForRetry,
  onOutboxChange,
  cacheReadData,
  purgeCorruptedQueue,
  purgeOrphanAndSyncedItems,
  type OutboxMutation,
  type OutboxFile
} from '../lib/offlineDb';

export type ConnectionState = 'ONLINE' | 'UNSTABLE' | 'OFFLINE' | 'SYNCING';
export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'error';
export type SyncPhase = 'idle' | 'offline' | 'syncing' | 'success' | 'partial_failure' | 'error' | 'auth_required';
export type SyncItemType = 'foto' | 'checklist' | 'pendencia' | 'geral';

export interface SyncProgressInfo {
  phase: SyncPhase;
  totalItems: number;
  completedItems: number;
  currentItemType?: SyncItemType;
  currentItemLabel?: string;
  progressPercent: number;
  lastDrainedCount?: number;
  errorMessage?: string | null;
  deadLetterCount?: number;
}

type StatusListener = (status: {
  connectionState: ConnectionState;
  isOnline: boolean;
  isSyncing: boolean;
  pendingCounts: { total: number; mutations: number; files: number; deadLetter: number };
  syncProgress: SyncProgressInfo;
  lastSyncTime: Date | null;
  error?: string | null;
}) => void;

class SyncEngine {
  private _connectionState: ConnectionState = typeof navigator !== 'undefined' && !navigator.onLine ? 'OFFLINE' : 'ONLINE';
  private _isOnline: boolean = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private _isSyncing: boolean = false;
  private _syncStartTime: number = 0;
  private _lastSyncTime: Date | null = null;
  private _lastError: string | null = null;
  private _listeners: Set<StatusListener> = new Set();
  private _syncIntervalId: any = null;
  private _successTimerId: any = null;
  private _onlineDebounceTimer: any = null;
  private _offlineDebounceTimer: any = null;
  private _currentUser: any | null = null;
  private _currentSession: any | null = null;
  private _consecutiveNetworkErrors: number = 0;
  private _hasPendingResync: boolean = false;
  private _progress: SyncProgressInfo = {
    phase: typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'idle',
    totalItems: 0,
    completedItems: 0,
    progressPercent: 0,
    currentItemLabel: ''
  };

  constructor() {
    // Escuta alterações reativas na Outbox Queue (0ms)
    onOutboxChange(() => {
      this.notify();
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', (e) => {
        if (this._isSyncing) {
          e.preventDefault();
          e.returnValue = 'Existe uma sincronização de dados de campo em andamento. Deseja realmente sair?';
        }
      });

      // DETECÇÃO REATIVA IMEDIATA DE REDE (0ms)
      window.addEventListener('online', () => {
        console.log('[SyncEngine] Evento online detectado. Atualizando status imediatamente...');
        if (this._offlineDebounceTimer) {
          clearTimeout(this._offlineDebounceTimer);
          this._offlineDebounceTimer = null;
        }
        this._isOnline = true;
        this._connectionState = 'ONLINE';
        if (this._progress.phase === 'offline') {
          this._progress.phase = 'idle';
        }
        this.notify();

        if (this._onlineDebounceTimer) clearTimeout(this._onlineDebounceTimer);
        this._onlineDebounceTimer = setTimeout(async () => {
          this._onlineDebounceTimer = null;
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            this._connectionState = 'OFFLINE';
            this._isOnline = false;
            this._progress.phase = 'offline';
            this.notify();
            return;
          }

          const isAlive = await this.pingSupabase();
          if (isAlive) {
            this._connectionState = 'ONLINE';
            this._isOnline = true;
            this._consecutiveNetworkErrors = 0;
            this.notify();
            this.syncNow(true);
          } else {
            console.warn('[SyncEngine] Interface de rede presente, mas ping falhou fisicamente (UNSTABLE).');
            this._connectionState = 'UNSTABLE';
            this._isOnline = true;
            this.notify();
          }
        }, 1000);
      });

      window.addEventListener('offline', () => {
        console.log('[SyncEngine] Evento offline detectado. Ativando Modo Campo imediatamente (0ms).');
        if (this._onlineDebounceTimer) {
          clearTimeout(this._onlineDebounceTimer);
          this._onlineDebounceTimer = null;
        }
        if (this._offlineDebounceTimer) {
          clearTimeout(this._offlineDebounceTimer);
          this._offlineDebounceTimer = null;
        }

        this._connectionState = 'OFFLINE';
        this._isOnline = false;
        this._progress.phase = 'offline';
        this.notify();
      });

      // Checagem periódica a cada 45s
      this._syncIntervalId = setInterval(() => {
        if (this._isOnline && !this._isSyncing) {
          this.checkConnectivityAndSync();
        }
      }, 45000);
    }
  }

  public setOfflineImmediately(): void {
    this._isOnline = false;
    this._connectionState = 'OFFLINE';
    this._progress.phase = 'offline';
    this.notify();
  }

  public setOnlineImmediately(): void {
    this._isOnline = true;
    this._connectionState = 'ONLINE';
    if (this._progress.phase === 'offline') {
      this._progress.phase = 'idle';
    }
    this.notify();
  }

  public get connectionState(): ConnectionState {
    if (this._isSyncing) return 'SYNCING';
    return this._connectionState;
  }

  public get isOnline(): boolean {
    return this._isOnline;
  }

  public get isSyncing(): boolean {
    return this._isSyncing;
  }

  public get lastSyncTime(): Date | null {
    return this._lastSyncTime;
  }

  public get progress(): SyncProgressInfo {
    return this._progress;
  }

  public setAuthContext(user: any | null, session: any | null): void {
    this._currentUser = user;
    this._currentSession = session;
    if (user && this._progress.phase === 'auth_required') {
      this.clearAuthError();
    }
  }

  public clearAuthError(): void {
    if (this._progress.phase === 'auth_required') {
      this._progress = {
        ...this._progress,
        phase: this._connectionState === 'OFFLINE' ? 'offline' : 'idle',
        errorMessage: null
      };
      this.notify();
    }
  }

  public isUserAuthenticated(): boolean {
    if (this._currentUser) return true;
    if (this._currentSession) return true;
    if (typeof localStorage !== 'undefined') {
      const fallback = localStorage.getItem('ms_auth_fallback_session');
      if (fallback) {
        try {
          const parsed = JSON.parse(fallback);
          if (parsed?.user) return true;
        } catch { /* ignore */ }
      }
    }
    return false;
  }

  public subscribe(listener: StatusListener): () => void {
    this._listeners.add(listener);
    this.notifySingle(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  public async notify() {
    const counts = await getPendingCounts();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ms:sync-status', {
        detail: { counts }
      }));
    }
    if (this._progress.phase === 'auth_required' && this.isUserAuthenticated()) {
      this._progress.phase = this._connectionState === 'OFFLINE' ? 'offline' : 'idle';
      this._progress.errorMessage = null;
    }

    if (!this._isSyncing && this._progress.phase !== 'success' && this._progress.phase !== 'partial_failure' && this._progress.phase !== 'auth_required' && this._progress.phase !== 'error') {
      this._progress.phase = this._connectionState === 'OFFLINE' ? 'offline' : 'idle';
      this._progress.totalItems = counts.total;
    }

    this._progress.deadLetterCount = counts.deadLetter;

    const state = {
      connectionState: this.connectionState,
      isOnline: this._isOnline,
      isSyncing: this._isSyncing,
      pendingCounts: counts,
      syncProgress: { ...this._progress },
      lastSyncTime: this._lastSyncTime,
      error: this._lastError
    };
    this._listeners.forEach(fn => fn(state));
  }

  private async notifySingle(listener: StatusListener) {
    const counts = await getPendingCounts();
    listener({
      connectionState: this.connectionState,
      isOnline: this._isOnline,
      isSyncing: this._isSyncing,
      pendingCounts: counts,
      syncProgress: { ...this._progress, deadLetterCount: counts.deadLetter },
      lastSyncTime: this._lastSyncTime,
      error: this._lastError
    });
  }

  /**
   * Ping leve via AbortController de 3 segundos contra Supabase REST
   * Qualquer resposta HTTP recebida (mesmo 401, 403, 404, 500) prova que a internet física está funcionando.
   */
  public async pingSupabase(): Promise<boolean> {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return false;
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6000);

      const targetUrl = supabaseUrl || (supabase as any)?.supabaseUrl || 'http://127.0.0.1:54321';
      const targetKey = supabaseAnonKey || (supabase as any)?.supabaseKey || '';
      const pingUrl = targetUrl.replace(/\/$/, '') + '/rest/v1/';

      // HEAD request ultraleve (0 bytes body) com cache: 'no-store' para evitar falso positivo via Service Worker/Cache
      const res = await fetch(pingUrl, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
        headers: {
          apikey: targetKey
        }
      }).catch(() => null);

      clearTimeout(timeoutId);
      if (res && (res.status > 0 || res.ok)) return true;

      // Fallback via cliente Supabase
      if (supabase) {
        try {
          const { status } = await supabase
            .from('perguntas_rtrs')
            .select('id', { count: 'exact', head: true })
            .limit(1);
          if (status && status > 0) return true;
        } catch {
          return false;
        }
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Calcula o tempo do Backoff Exponencial para erros transitórios de rede:
   * 2^attempts * 2 segundos (ex: 2s, 4s, 8s, 16s, até teto de 30s)
   */
  private calculateBackoffSeconds(attempts: number): number {
    const exp = Math.max(0, attempts);
    return Math.min(30, Math.pow(2, exp) * 2);
  }

  /**
   * Converte um Blob em Base64 Data URL como contingência
   */
  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Converte uma Data URL (data:image/jpeg;base64,...) em um Blob em memória (ArrayBuffer-backed)
   * Essencial para reconstruir arquivos em dispositivos móveis (iOS Safari/WebKit)
   */
  private dataUrlToBlob(dataUrl: string): Blob | null {
    try {
      if (!dataUrl || !dataUrl.startsWith('data:')) return null;
      const parts = dataUrl.split(',');
      if (parts.length < 2) return null;
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : 'image/jpeg';
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr.buffer], { type: mime });
    } catch (e) {
      console.warn('[SyncEngine] Falha ao converter DataURL em Blob:', e);
      return null;
    }
  }

  /**
   * Extrai um Blob 100% íntegro em memória (ArrayBuffer) a partir de item.file_blob ou item.evidencia_url
   * Blindado contra invalidação de ponteiros File no iOS Safari / WebKit IndexedDB
   */
  private async getSafeUploadBlob(rawBlob?: Blob | null, fallbackDataUrl?: string | null, defaultMime = 'image/jpeg'): Promise<{ blob: Blob; mimeType: string } | null> {
    if (rawBlob) {
      try {
        const buf = await rawBlob.arrayBuffer();
        if (buf && buf.byteLength > 0) {
          const mime = rawBlob.type && rawBlob.type !== 'text/plain' ? rawBlob.type : defaultMime;
          return { blob: new Blob([buf], { type: mime }), mimeType: mime };
        }
      } catch (err) {
        console.warn('[SyncEngine] Ponteiro de Blob nativo ilegível no IndexedDB (comum no iOS Safari). Tentando reconstrução via DataURL...', err);
      }
    }

    if (fallbackDataUrl && fallbackDataUrl.startsWith('data:')) {
      const reconstructed = this.dataUrlToBlob(fallbackDataUrl);
      if (reconstructed && reconstructed.size > 0) {
        return { blob: reconstructed, mimeType: reconstructed.type || defaultMime };
      }
    }

    return null;
  }

  /**
   * Checagem periódica e disparo automático de sincronização
   */
  public async checkConnectivityAndSync() {
    try {
      const counts = await getPendingCounts();
      if (counts.total === 0) return;

      const isAlive = await this.pingSupabase();
      if (isAlive) {
        this._connectionState = 'ONLINE';
        this._isOnline = true;
        this._consecutiveNetworkErrors = 0;
        await this.syncNow(true);
      } else {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          this._connectionState = 'OFFLINE';
          this._isOnline = false;
        } else {
          this._connectionState = 'UNSTABLE';
          this._isOnline = true;
        }
        this.notify();
      }
    } catch (e) {
      console.warn('[SyncEngine] Falha ao testar conectividade:', e);
    }
  }

  /**
   * Executa o dreno da fila de saída (Outbox Queue) com isolamento por item (Dead-Letter Queue).
   * @param forceAll se true (acionado pelo usuário em 'Tentar Novamente'), processa os itens ignorando limites de backoff
   */
  public async syncNow(forceAll = false): Promise<{ success: boolean; drained: number; errors: number }> {
    // 1. INVESTIGAÇÃO DE DEADLOCK / MUTEX TRAVADO E RE-EXECUÇÃO AUTOMÁTICA:
    // Se já houver sincronização em andamento e o tempo for menor que 15s, agenda uma nova rodada assim que a atual terminar.
    if (this._isSyncing) {
      const elapsed = this._syncStartTime > 0 ? Date.now() - this._syncStartTime : 0;
      if (elapsed > 15000) {
        console.warn(`[SyncEngine] Mutex destravado por watchdog (${elapsed}ms). Forçando execução.`);
        this._isSyncing = false;
        this._syncStartTime = 0;
      } else {
        console.log('[SyncEngine] Sincronização em andamento. Agendando nova rodada imediata (_hasPendingResync = true).');
        this._hasPendingResync = true;
        return { success: true, drained: 0, errors: 0 };
      }
    }

    // Cancelar backoff ou debounce pendente em clique forçado e reabilitar itens falhos
    if (forceAll) {
      if (this._onlineDebounceTimer) {
        clearTimeout(this._onlineDebounceTimer);
        this._onlineDebounceTimer = null;
      }
      if (this._offlineDebounceTimer) {
        clearTimeout(this._offlineDebounceTimer);
        this._offlineDebounceTimer = null;
      }
      try {
        await rehabilitateFailedQueueForRetry();
      } catch (rehErr) {
        console.warn('[SyncEngine] Aviso ao reabilitar itens da fila em forceAll:', rehErr);
      }
    }

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      console.log('[SyncEngine] Dispositivo offline. Sincronização adiada.');
      this._connectionState = 'OFFLINE';
      this._isOnline = false;
      this._progress.phase = 'offline';
      this.notify();
      return { success: false, drained: 0, errors: 0 };
    }

        // CORREÇÃO 2: Resgatar mutações da DLQ com erro de constraint NOT NULL (23502)
    try {
      await rescueNotnullFailedMutations();
      // purgeOrphanAndSyncedItems removed to prevent queue deletion
    } catch (rErr) {
      console.warn('[SyncEngine] Aviso ao resgatar mutações NOT NULL da DLQ:', rErr);
    }

    // Obter itens elegíveis (Unified Journal + legado de outbox)
    const rawJournal = await getPendingJournalItems(forceAll);

    // ETAPA 3: Deduplicação em memória por auditoria_id + pergunta_id
    // Agrupa os itens em memória por auditoria_id + pergunta_id.
    // Se houver itens residuais com a mesma chave, processa apenas o que tiver o maior updated_at e descarta os demais.
    const journalMap = new Map<string, SyncJournalItem>();
    for (const item of rawJournal) {
      if (!item.auditoria_id || !item.pergunta_id) continue;
      const key = `${item.auditoria_id}_${item.pergunta_id}`;
      if (!journalMap.has(key)) {
        journalMap.set(key, item);
      } else {
        const existing = journalMap.get(key)!;
        const timeExisting = new Date(existing.updated_at || existing.created_at || 0).getTime();
        const timeCurrent = new Date(item.updated_at || item.created_at || 0).getTime();
        if (timeCurrent > timeExisting) {
          journalMap.set(key, item);
        }
      }
    }
    const eligibleJournal = Array.from(journalMap.values());

    // Deduplicação de mutações legadas de respostas_auditoria
    const rawMutations = await getEligibleMutations(forceAll);
    const mutMap = new Map<string, OutboxMutation>();
    const duplicateMutIds: number[] = [];
    const nonAuditMutations: OutboxMutation[] = [];

    for (const m of rawMutations) {
      if (m.table === 'respostas_auditoria' && m.payload?.auditoria_id && m.payload?.pergunta_id) {
        const key = `${m.payload.auditoria_id}_${m.payload.pergunta_id}`;
        if (!mutMap.has(key)) {
          mutMap.set(key, m);
        } else {
          const existing = mutMap.get(key)!;
          const timeExisting = new Date(existing.updated_at || existing.created_at || 0).getTime();
          const timeCurrent = new Date(m.updated_at || m.created_at || 0).getTime();
          if (timeCurrent > timeExisting) {
            if (existing.id) duplicateMutIds.push(existing.id);
            mutMap.set(key, m);
          } else {
            if (m.id) duplicateMutIds.push(m.id);
          }
        }
      } else {
        nonAuditMutations.push(m);
      }
    }

    if (duplicateMutIds.length > 0) {
      try {
        await db.outbox_mutations.bulkDelete(duplicateMutIds);
        console.log(`[SyncEngine] Limpeza: ${duplicateMutIds.length} mutações duplicadas antigas descartadas.`);
      } catch (e) {}
    }

    const eligibleMutations = [...Array.from(mutMap.values()), ...nonAuditMutations];
    const eligibleFiles = await getEligibleFiles(forceAll);
    const totalItems = eligibleJournal.length + eligibleFiles.length + eligibleMutations.length;

    console.log('[SYNC] Iniciando processamento linear da fila...', {
      eligibleJournal: eligibleJournal.length,
      eligibleFiles: eligibleFiles.length,
      eligibleMutations: eligibleMutations.length,
      totalItems,
      forceAll,
      isOnline: this._isOnline
    });

    if (totalItems === 0) {
      this._isSyncing = false;
      this._syncStartTime = 0;
      const counts = await getPendingCounts();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ms:sync-complete', {
          detail: { drainedCount: 0, errorCount: 0, counts }
        }));
      }
      this._progress = {
        phase: this._connectionState === 'OFFLINE' ? 'offline' : 'idle',
        totalItems: 0,
        completedItems: 0,
        progressPercent: 0,
        deadLetterCount: counts.deadLetter
      };
      this.notify();
      return { success: true, drained: 0, errors: 0 };
    }

    this._isSyncing = true;
    this._syncStartTime = Date.now();

    // PASSO A: Validação Prévia de Sessão Auth (Unificada com AuthContext e Fallback)
    try {
      const isAuth = this.isUserAuthenticated();
      let session = this._currentSession;

      if (!session) {
        try {
          const { data: sessionData } = await supabase.auth.getSession();
          session = sessionData?.session || null;
        } catch (sErr) {
          console.warn('[SyncEngine] Aviso ao consultar getSession:', sErr);
        }
      }

      // Se não há sessão do Supabase nem usuário ativo no AuthContext/LocalStorage:
      if (!session && !isAuth) {
        let refreshed = false;
        try {
          const { data: refData, error: refErr } = await supabase.auth.refreshSession();
          if (!refErr && refData?.session) {
            session = refData.session;
            refreshed = true;
          }
        } catch (rErr) {
          console.warn('[SyncEngine] Falha ao tentar refresh silencioso:', rErr);
        }

        if (!refreshed && !this.isUserAuthenticated()) {
          console.warn('[SyncEngine] Nenhum usuário autenticado detectado. Pausando envio.');
          this._isSyncing = false;
          this._syncStartTime = 0;
          this._progress = {
            phase: 'auth_required',
            totalItems,
            completedItems: 0,
            progressPercent: 0,
            errorMessage: 'Faça login novamente para transmitir os dados de campo salvos no aparelho.'
          };
          this.notify();
          return { success: false, drained: 0, errors: totalItems };
        }
      } else if (session) {
        // Se faltando menos de 5 minutos para expirar o JWT, renova
        const expiresAt = session.expires_at || 0;
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (expiresAt - nowSeconds < 300) {
          await supabase.auth.refreshSession().catch(e => console.warn('[SyncEngine] Erro ao renovar token preventivamente:', e));
        }
      }
    } catch (authErr) {
      console.warn('[SyncEngine] Aviso na validação de sessão:', authErr);
    }

    this._lastError = null;
    if (this._successTimerId) {
      clearTimeout(this._successTimerId);
      this._successTimerId = null;
    }

    // PROGRESSO AUTÊNTICO: inicia em 0% (sem o falso 5%)
    this._progress = {
      phase: 'syncing',
      totalItems,
      completedItems: 0,
      progressPercent: 0,
      currentItemType: eligibleFiles.length > 0 ? 'foto' : 'checklist',
      currentItemLabel: eligibleFiles.length > 0 ? 'Conectando para envio de evidências...' : 'Iniciando envio de dados...'
    };
    this.notify();

    let drainedCount = 0;
    let errorCount = 0;
    let hadPhysicalNetworkFailure = false;

    try {
      // =========================================================================
      // ETAPA 2: MOTOR DE SINCRONIZAÇÃO LINEAR E TWO-PHASE COMMIT (sync_journal)
      // Processa item a item do journal unificado atomicamente:
      // Passo A: Upload Storage (se houver file_blob)
      // Passo B: Upsert Postgres (respostas_auditoria) com conforme sanitizado
      // Passo C: Atualização do Cache Local (db.cached_respostas)
      // Passo D: Deleção Segura do Journal (após status 200/201 do Postgres)
      // =========================================================================
      for (let j = 0; j < eligibleJournal.length; j++) {
        const item = eligibleJournal[j];
        if (!item.auditoria_id || !item.pergunta_id) continue;

        const canonicalPerguntaId = normalizePerguntaId(item.pergunta_id);

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          console.log('[SyncEngine] Desconexão física durante o envio do journal. Parando ciclo.');
          hadPhysicalNetworkFailure = true;
          break;
        }

        const currentPercent = Math.round((drainedCount / totalItems) * 100);
        this._progress = {
          phase: 'syncing',
          totalItems,
          completedItems: drainedCount,
          progressPercent: currentPercent,
          currentItemType: item.file_blob ? 'foto' : 'checklist',
          currentItemLabel: `Transmitindo (${drainedCount + 1} de ${totalItems}): Critério ${item.numero_criterio || canonicalPerguntaId}`
        };
        this.notify();

        console.groupCollapsed(`[SYNC ENGINE] Journal Item (${item.auditoria_id} / ${canonicalPerguntaId})`);
        await markJournalItemStatus(item.auditoria_id, item.pergunta_id, 'syncing');

        try {
          let publicUrl: string | null = item.evidencia_url || null;
          const isExplicitDelete = item.is_explicit_delete === true || item.evidencia_url === null;

          // PASSO A (Upload Storage Blindado): Reconstrói o Blob em memória (iOS Safari safe) e tenta buckets 'evidencias' -> 'documentos-e-midias' -> fallback DataURL
          if (!isExplicitDelete && (item.file_blob || (item.evidencia_url && item.evidencia_url.startsWith('data:')))) {
            const safePayload = await this.getSafeUploadBlob(
              item.file_blob,
              item.evidencia_url,
              item.mime_type || 'image/jpeg'
            );

            if (!safePayload || safePayload.blob.size === 0) {
              console.warn(`[SYNC ENGINE] Blob indisponível para ${item.auditoria_id}/${canonicalPerguntaId}. Usando evidencia_url existente se válida.`);
            } else {
              const { blob: safeBlob, mimeType: safeMime } = safePayload;
              const rawExt = safeMime === 'application/pdf'
                ? 'pdf'
                : safeMime === 'image/png'
                ? 'png'
                : safeMime === 'image/webp'
                ? 'webp'
                : ((item.file_name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg');
              const cleanExt = rawExt === 'jpeg' || rawExt === 'heic' || rawExt === 'heif' ? 'jpg' : rawExt;
              const rawPath = item.storage_path || `evidencia_${item.auditoria_id}_${canonicalPerguntaId}_${item.created_at || Date.now()}.${cleanExt}`;
              const storagePath = rawPath.replace(/^evidencias\//, '');

              let uploadedSuccessfully = false;
              let lastStorageError: any = null;

              // 1. Tenta bucket principal 'evidencias'
              console.log('[SYNC ENGINE] Passo A: Upload do Blob ao Storage bucket evidencias:', storagePath, `(${safeBlob.size} bytes, ${safeMime})`);
              try {
                let uploadRes = await supabase.storage
                  .from('evidencias')
                  .upload(storagePath, safeBlob, {
                    cacheControl: '3600',
                    upsert: true,
                    contentType: safeMime
                  });

                if (uploadRes.error && (
                  (uploadRes.error as any).statusCode === '401' ||
                  uploadRes.error.message?.toLowerCase().includes('jwt') ||
                  uploadRes.error.message?.toLowerCase().includes('token')
                )) {
                  console.log('[SYNC ENGINE] Token expirado no upload do journal. Tentando refresh silencioso...');
                  const { data: refData } = await supabase.auth.refreshSession();
                  if (refData?.session) {
                    uploadRes = await supabase.storage
                      .from('evidencias')
                      .upload(storagePath, safeBlob, {
                        cacheControl: '3600',
                        upsert: true,
                        contentType: safeMime
                      });
                  }
                }

                if (!uploadRes.error) {
                  const { data: pubData } = supabase.storage.from('evidencias').getPublicUrl(storagePath);
                  if (pubData?.publicUrl) {
                    publicUrl = pubData.publicUrl;
                    uploadedSuccessfully = true;
                    console.log('[SYNC ENGINE] Passo A Concluído (bucket evidencias). URL pública gerada:', publicUrl);
                  }
                } else {
                  lastStorageError = uploadRes.error;
                  console.warn('[SYNC ENGINE] Aviso no upload para bucket evidencias:', uploadRes.error.message);
                }
              } catch (upEx: any) {
                lastStorageError = upEx;
                console.warn('[SYNC ENGINE] Exceção no upload para bucket evidencias:', upEx?.message);
              }

              // 2. Fallback para bucket secundário 'documentos-e-midias'
              if (!uploadedSuccessfully) {
                try {
                  const secRes = await supabase.storage
                    .from('documentos-e-midias')
                    .upload(storagePath, safeBlob, {
                      cacheControl: '3600',
                      upsert: true,
                      contentType: safeMime
                    });
                  if (!secRes.error) {
                    const { data: secPub } = supabase.storage.from('documentos-e-midias').getPublicUrl(storagePath);
                    if (secPub?.publicUrl) {
                      publicUrl = secPub.publicUrl;
                      uploadedSuccessfully = true;
                      console.log('[SYNC ENGINE] Passo A Concluído (bucket secundário documentos-e-midias):', publicUrl);
                    }
                  }
                } catch (secEx: any) {
                  console.warn('[SYNC ENGINE] Aviso no fallback documentos-e-midias:', secEx?.message);
                }
              }

              // 3. Se ambos os buckets falharem, verifica se foi queda física de internet ou se podemos usar fallback DataURL Base64 para garantir salvamento no banco!
              if (!uploadedSuccessfully) {
                const errStr = String(lastStorageError?.message || lastStorageError || '');
                const isPhysicalOffline = typeof navigator !== 'undefined' && !navigator.onLine;
                if (isPhysicalOffline) {
                  throw lastStorageError || new Error('Dispositivo sem conexão física para upload');
                }
                if (item.evidencia_url && item.evidencia_url.startsWith('data:')) {
                  publicUrl = item.evidencia_url;
                  console.log('[SYNC ENGINE] Usando DataURL comprimida como fallback resiliente para garantir gravação imediata no Postgres.');
                } else {
                  const b64 = await this.blobToBase64(safeBlob);
                  if (b64 && b64.startsWith('data:')) {
                    publicUrl = b64;
                    console.log('[SYNC ENGINE] Convertido Blob em DataURL Base64 como fallback resiliente para o Postgres.');
                  } else if (lastStorageError) {
                    throw lastStorageError;
                  }
                }
              }
            }
          }

          // PASSO B (Upsert Postgres): Executa o upsert sanitizado em respostas_auditoria com UUID canônico
          const nowIso = new Date().toISOString();

          // Blindagem estrita: URLs blob: efêmeras NUNCA devem ser enviadas ao Postgres remoto
          let remoteEvidenciaUrl: string | null = isExplicitDelete ? null : (publicUrl || null);
          if (!isExplicitDelete && !remoteEvidenciaUrl && item.evidencia_url) {
            const raw = item.evidencia_url.trim();
            if (!raw.startsWith('blob:')) {
              remoteEvidenciaUrl = raw;
            }
          }

          // Se for exclusão explícita, expurga arquivos do Storage e assegura remoteEvidenciaUrl = null
          if (isExplicitDelete) {
            remoteEvidenciaUrl = null;
            try {
              const prefix1 = `evidencia_${item.auditoria_id}_${canonicalPerguntaId}`;
              const prefix2 = `${item.auditoria_id}_${canonicalPerguntaId}`;
              const [res1, res2, res3] = await Promise.all([
                supabase.storage.from('evidencias').list('', { search: prefix1 }),
                supabase.storage.from('evidencias').list('', { search: prefix2 }),
                supabase.storage.from('evidencias').list('evidencias', { search: prefix2 })
              ]);
              const filesToDelete: string[] = [];
              if (res1.data) res1.data.forEach(f => filesToDelete.push(f.name));
              if (res2.data) res2.data.forEach(f => filesToDelete.push(f.name));
              if (res3.data) res3.data.forEach(f => filesToDelete.push(`evidencias/${f.name}`));
              if (item.storage_path) filesToDelete.push(item.storage_path);
              if (filesToDelete.length > 0) {
                await supabase.storage.from('evidencias').remove([...new Set(filesToDelete)]);
              }
            } catch (stDelErr) {
              console.warn('[SYNC ENGINE] Aviso ao remover arquivos do storage para item excluído:', stDelErr);
            }
          } else if (!remoteEvidenciaUrl && (item.file_blob || item.evidencia_url)) {
            // Se NÃO for exclusão e o usuário enviou uma evidência (blob/url), mas ainda não temos URL pública oficial:
            try {
              const prefix = `evidencia_${item.auditoria_id}_${canonicalPerguntaId}`;
              const { data: stFiles } = await supabase.storage.from('evidencias').list('', { limit: 5, search: prefix });
              if (stFiles && stFiles.length > 0) {
                stFiles.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
                const { data: pData } = supabase.storage.from('evidencias').getPublicUrl(stFiles[0].name);
                if (pData?.publicUrl) remoteEvidenciaUrl = pData.publicUrl;
              }
            } catch (searchErr) {
              console.warn('[SYNC ENGINE] Aviso ao verificar storage para URL pública:', searchErr);
            }
          }

          let targetAuditoriaId = item.auditoria_id;
          if (targetAuditoriaId && (targetAuditoriaId.startsWith('mock-') || targetAuditoriaId.startsWith('assigned-pend-') || targetAuditoriaId.startsWith('temp-'))) {
            try {
              const cachedAud = await db.cached_auditorias.get(targetAuditoriaId);
              const targetPropId = cachedAud?.propriedade_id;
              if (targetPropId && !targetPropId.startsWith('mock-')) {
                const { data: realAudit } = await supabase
                  .from('auditorias')
                  .select('id')
                  .eq('propriedade_id', targetPropId)
                  .order('created_at', { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (realAudit?.id) {
                  console.log(`[SYNC ENGINE] Reconciliado ID sintético no journal: '${targetAuditoriaId}' -> '${realAudit.id}'`);
                  targetAuditoriaId = realAudit.id;
                } else {
                  const { data: createdAudit } = await supabase
                    .from('auditorias')
                    .insert([{
                      propriedade_id: targetPropId,
                      status: 'Autoavaliação',
                      data_agendamento: new Date().toISOString()
                    }])
                    .select('id')
                    .maybeSingle();
                  if (createdAudit?.id) {
                    console.log(`[SYNC ENGINE] Auditoria criada para receber respostas do journal: ${createdAudit.id}`);
                    targetAuditoriaId = createdAudit.id;
                  }
                }

                if (targetAuditoriaId && targetAuditoriaId !== item.auditoria_id) {
                  await db.cached_respostas.delete([item.auditoria_id, canonicalPerguntaId]);
                  if (cachedAud) {
                    await db.cached_auditorias.put({ ...cachedAud, id: targetAuditoriaId });
                    await db.cached_auditorias.delete(item.auditoria_id);
                  }
                }
              }
            } catch (reconErr) {
              console.warn('[SYNC ENGINE] Aviso ao reconciliar auditoria sintética no journal:', reconErr);
            }
          }

          // Leitura fresca de db.cached_respostas para pegar o valor mais recente caso o usuário tenha clicado em Conforme durante upload
          let currentConforme = item.conforme ?? false;
          let currentNaoSeAplica = item.nao_se_aplica ?? false;
          let currentObservacoes = item.observacoes || '';
          try {
            const freshCached = await db.cached_respostas.get([item.auditoria_id, canonicalPerguntaId]);
            if (freshCached) {
              if (freshCached.conforme !== undefined && freshCached.conforme !== null) {
                currentConforme = freshCached.conforme;
              }
              if (freshCached.nao_se_aplica !== undefined) {
                currentNaoSeAplica = freshCached.nao_se_aplica;
              }
              if (freshCached.observacoes) {
                currentObservacoes = freshCached.observacoes;
              }
            }
          } catch {}

          const payload = {
            auditoria_id: targetAuditoriaId,
            pergunta_id: canonicalPerguntaId, // UUID canônico garantido!
            conforme: item.conforme ?? false, // Impede violação de NOT NULL (Erro 23502)
            nao_se_aplica: item.nao_se_aplica ?? false,
            observacoes: item.observacoes || '',
            evidencia_url: isExplicitDelete ? null : remoteEvidenciaUrl,
            updated_at: nowIso
          };

          console.log('[SYNC ENGINE] Passo B: Upsert Postgres em respostas_auditoria com payload sanitizado:', payload);
          let { error: pgErr } = await supabase
            .from('respostas_auditoria')
            .upsert(payload, { onConflict: 'auditoria_id,pergunta_id' });

          // Se erro 401 no Postgres, tenta refresh silencioso
          if (pgErr && (
            (pgErr as any).code === '401' ||
            pgErr.message?.toLowerCase().includes('jwt') ||
            pgErr.message?.toLowerCase().includes('token')
          )) {
            console.log('[SYNC ENGINE] Token expirado no Postgres upsert. Tentando refresh silencioso...');
            try {
              const { data: refData } = await supabase.auth.refreshSession();
              if (refData?.session) {
                const retry = await supabase
                  .from('respostas_auditoria')
                  .upsert(payload, { onConflict: 'auditoria_id,pergunta_id' });
                pgErr = retry.error;
              }
            } catch (rErr) {
              console.warn('[SYNC ENGINE] Falha ao tentar refresh no Postgres upsert:', rErr);
            }
          }

          // Se erro 23503 (Foreign Key: auditoria_id ainda não existe na tabela remota auditorias), cria ou reconcilia a auditoria pai automaticamente!
          if (pgErr && ((pgErr as any).code === '23503' || pgErr.message?.includes('auditoria_id') || pgErr.details?.includes('auditorias'))) {
            console.warn('[SYNC ENGINE] Erro 23503 detectado (auditoria pai ausente no servidor). Reconciliando/criando auditoria pai automaticamente...');
            try {
              const cachedAud = await db.cached_auditorias.get(targetAuditoriaId);
              let propId = cachedAud?.propriedade_id;
              if (!propId || propId.startsWith('mock-')) {
                const { data: anyProp } = await supabase.from('propriedades').select('id').limit(1).maybeSingle();
                propId = anyProp?.id;
              }
              if (propId) {
                const { error: createAudErr } = await supabase.from('auditorias').upsert([{
                  id: targetAuditoriaId,
                  propriedade_id: propId,
                  tecnico_responsavel_id: cachedAud?.tecnico_responsavel_id || this._currentUser?.id || null,
                  status: cachedAud?.status || 'Em Andamento',
                  data_agendamento: cachedAud?.data_agendamento || nowIso,
                  updated_at: nowIso
                }], { onConflict: 'id' });

                if (!createAudErr) {
                  const retryFk = await supabase
                    .from('respostas_auditoria')
                    .upsert(payload, { onConflict: 'auditoria_id,pergunta_id' });
                  pgErr = retryFk.error;
                }
              }
            } catch (fkRecErr) {
              console.warn('[SYNC ENGINE] Aviso ao auto-criar auditoria pai para 23503:', fkRecErr);
            }
          }

          if (pgErr) {
            console.error('[SYNC ENGINE] Erro no upsert Postgres do journal:', pgErr);
            throw pgErr;
          }

          // Atualiza updated_at da auditoria pai no Supabase para refletir imediatamente nas listagens web/mobile
          try {
            await supabase
              .from('auditorias')
              .update({ updated_at: nowIso })
              .eq('id', targetAuditoriaId);
          } catch {}

          // PASSO C (Atualização do Cache Local): Salva registro confirmado com URL definitiva em db.cached_respostas
          if (item.pergunta_id !== canonicalPerguntaId) {
            try {
              await db.cached_respostas.delete([item.auditoria_id, item.pergunta_id]);
              await removeJournalItem(item.auditoria_id, item.pergunta_id);
            } catch {}
          }

          await db.cached_respostas.put({
            auditoria_id: targetAuditoriaId,
            pergunta_id: canonicalPerguntaId,
            conforme: item.conforme ?? false,
            observacoes: item.observacoes || '',
            evidencia_url: isExplicitDelete ? null : (payload.evidencia_url || null),
            numero_criterio: item.numero_criterio,
            updated_at: nowIso,
            evidencia_uploaded_at: (!isExplicitDelete && payload.evidencia_url) ? nowIso : null,
            data_envio: (!isExplicitDelete && payload.evidencia_url) ? nowIso : null
          });
          console.log('[SYNC ENGINE] Passo C Concluído: Cache local atualizado com URL definitiva.');

          // PASSO D (Deleção Segura do Journal): Executa delete exclusivamente após confirmação do Postgres (status 200/201)
          if (item.id) {
            await db.sync_journal.delete(item.id);
          }
          await removeJournalItem(item.auditoria_id, canonicalPerguntaId);
          if (item.pergunta_id !== canonicalPerguntaId) {
            await removeJournalItem(item.auditoria_id, item.pergunta_id);
          }

          // Limpeza atômica de mutações legadas e arquivos de outbox órfãos para evitar pendências presas
          try {
            const companionMuts = await db.outbox_mutations
              .filter(m => m.table === 'respostas_auditoria' && 
                           m.payload?.auditoria_id === item.auditoria_id && 
                           normalizePerguntaId(m.payload?.pergunta_id) === canonicalPerguntaId)
              .toArray();
            for (const cm of companionMuts) {
              if (cm.id) await db.outbox_mutations.delete(cm.id);
              if (cm.file_ids && cm.file_ids.length > 0) {
                for (const fid of cm.file_ids) {
                  await removeFile(fid);
                }
              }
            }

            // Remove também arquivo correspondente em outbox_files caso ainda persista
            const relatedFiles = await db.outbox_files
              .filter(f => f.file_name?.includes(item.auditoria_id) && f.file_name?.includes(canonicalPerguntaId))
              .toArray();
            for (const rf of relatedFiles) {
              await removeFile(rf.id);
            }
          } catch {}
          console.log(`[SYNC ENGINE] Passo D Concluído: Item [${item.auditoria_id}, ${canonicalPerguntaId}] e dependências reconciliadas com sucesso.`);
          
          drainedCount++;
          console.groupEnd();
        } catch (itemErr: any) {
          errorCount++;
          const errMsg = itemErr?.message || String(itemErr);
          console.error(`[SYNC ENGINE] Falha ao processar item [${item.auditoria_id}, ${item.pergunta_id}] do journal:`, errMsg);

          const isNetwork = !navigator.onLine ||
            itemErr?.name === 'AbortError' ||
            errMsg.includes('Failed to fetch') ||
            errMsg.includes('Load failed') ||
            errMsg.includes('NetworkError') ||
            errMsg.includes('network connection lost') ||
            itemErr?.code === 'PGRST000';

          await markJournalItemStatus(item.auditoria_id, item.pergunta_id, 'failed', errMsg);

          if (isNetwork) {
            hadPhysicalNetworkFailure = true;
            this._consecutiveNetworkErrors++;
            console.warn('[SYNC ENGINE] Falha física de rede detectada no journal. Interrompendo ciclo sem deletar dados locais.');
            console.groupEnd();
            break; // Interrompe o ciclo sem perder nada no aparelho!
          } else {
            console.warn('[SYNC ENGINE] Erro de validação/schema no item do journal. Continuando próximos itens para não travar a fila:', errMsg);
            console.groupEnd();
          }
        }
      }

      // PASSO B (Legado): Processar arquivos remanescentes da outbox_files (se houver)
      const fileUrlMap = new Map<string, string>();

      // Pre-carrega arquivos que já subiram para o Storage em rodada anterior mas aguardam confirmação no banco
      try {
        const alreadyUploaded = await db.outbox_files
          .filter(f => f.status === 'uploaded_pending_db' && !!f.public_url)
          .toArray();
        alreadyUploaded.forEach(f => {
          if (f.public_url) fileUrlMap.set(f.id, f.public_url);
        });
      } catch (e) {}

      console.group('🔍 [DIAGNÓSTICO SYNC DE ARQUIVOS]');
      console.log('1. Itens na fila local antes do sync:', {
        arquivos: eligibleFiles.map(f => ({
          id: f.id,
          name: f.file_name,
          size: f.file_size,
          bucket: f.bucket,
          path: f.storage_path,
          status: f.status
        })),
        mutacoes: eligibleMutations.map(m => ({
          id: m.id,
          table: m.table,
          action: m.action,
          file_ids: m.file_ids,
          status: m.status
        }))
      });

      for (let i = 0; i < eligibleFiles.length; i++) {
        const file = eligibleFiles[i];

        // Atualiza progresso autêntico antes de iniciar a operação
        const currentPercent = Math.round((drainedCount / totalItems) * 100);
        this._progress = {
          phase: 'syncing',
          totalItems,
          completedItems: drainedCount,
          progressPercent: currentPercent,
          currentItemType: 'foto',
          currentItemLabel: `Enviando evidência (${drainedCount + 1} de ${totalItems}): ${file.file_name}`
        };
        this.notify();

        console.groupCollapsed(`[SYNC ENGINE] Arquivo #${file.id} (${file.file_name})`);
        
        // ETAPA 1 & 5: Integridade da Leitura e Inspeção do Blob
        const isBlobInstance = typeof Blob !== 'undefined' && file.file_blob instanceof Blob;
        const rawBlob = file.file_blob as any;
        console.log('2. Inspecionando Blob do arquivo:', {
          id: file.id,
          name: file.file_name,
          isBlob: isBlobInstance,
          size: rawBlob?.size ?? file.file_size,
          type: rawBlob?.type ?? file.file_type,
          constructor: rawBlob?.constructor?.name
        });

        console.log('3. Tentando upload no Storage bucket:', file.bucket, 'caminho:', file.storage_path);

        try {
          // Validação de integridade do blob
          if (!file.file_blob || (file.file_blob as any).size === 0) {
            console.error('[SYNC ENGINE] Arquivo com blob vazio ou corrompido. Isolando na DLQ.');
            await markFileDeadLetter(file.id, 'Arquivo corrompido ou nulo na fila local', 'CORRUPT_BLOB');
            errorCount++;
            console.groupEnd();
            continue; // AVANÇA PARA O PRÓXIMO ITEM!
          }

          await markFileStatus(file.id, 'uploading');
          let publicUrl = (file.status === 'uploaded_pending_db' && file.public_url) ? file.public_url : '';
          const blobSize = file.file_blob ? ((file.file_blob as any).size || 0) : (file.file_size || 0);

          // LOG DETALHADO MANDATÓRIO: tamanho do Blob, bucket e caminho de destino
          console.log(`[SYNC ENGINE] Upload Storage: Arquivo #${file.id}`, {
            nome: file.file_name,
            bucket: file.bucket,
            caminhoDestino: file.storage_path,
            tamanhoBytes: blobSize,
            tipoMime: file.file_type || 'image/jpeg'
          });

          // Upload no bucket designado com proteção de try/catch contra exceções de fetch/rede
          let upErr: any = null;
          if (publicUrl) {
            console.log('[SYNC ENGINE] Arquivo já enviado para o Storage previamente. Reutilizando URL pública:', publicUrl);
          } else {
            try {
              const uploadRes = await supabase.storage
              .from(file.bucket)
              .upload(file.storage_path, file.file_blob, {
                cacheControl: '3600',
                upsert: true,
                contentType: file.file_type || 'image/jpeg'
              });
            upErr = uploadRes.error;
            console.log('4. Resposta Storage (bucket principal):', { data: uploadRes.data, error: uploadRes.error });
          } catch (storageEx: any) {
            console.warn(`[SYNC ENGINE] Exceção direta no upload ao bucket '${file.bucket}':`, storageEx?.message);
            upErr = storageEx;
            console.log('4. Resposta Storage (exceção):', { error: storageEx });
          }
          }
          let finalUpErr = upErr;

          // Se erro 401 / JWT expirado, tenta renovação silenciosa de token
          if (finalUpErr && (
            (finalUpErr as any).statusCode === '401' ||
            finalUpErr.message?.toLowerCase().includes('jwt') ||
            finalUpErr.message?.toLowerCase().includes('token')
          )) {
            console.log('[SYNC ENGINE] Token expirado no upload. Tentando refresh silencioso...');
            try {
              const { data: refData, error: refErr } = await supabase.auth.refreshSession();
              if (!refErr && refData?.session) {
                try {
                  const { error: retryUpErr } = await supabase.storage
                    .from(file.bucket)
                    .upload(file.storage_path, file.file_blob, {
                      cacheControl: '3600',
                      upsert: true,
                      contentType: file.file_type || 'image/jpeg'
                    });
                  finalUpErr = retryUpErr;
                } catch (retryEx: any) {
                  finalUpErr = retryEx;
                }
              }
            } catch (e) {
              console.warn('[SYNC ENGINE] Falha ao tentar refresh no upload:', e);
            }
          }

          if (!finalUpErr) {
            const { data } = supabase.storage
              .from(file.bucket)
              .getPublicUrl(file.storage_path);
            publicUrl = data?.publicUrl || '';
            console.log(`[SYNC ENGINE] Upload no bucket principal '${file.bucket}' concluído com sucesso:`, publicUrl);
          } else {
            console.warn(`[SYNC ENGINE] Falha no upload do bucket principal '${file.bucket}': ${finalUpErr.message || JSON.stringify(finalUpErr)}`);

            // Tenta o bucket secundário padrão do projeto
            try {
              const { error: secErr } = await supabase.storage
                .from('documentos-e-midias')
                .upload(file.storage_path, file.file_blob, {
                  cacheControl: '3600',
                  upsert: true,
                  contentType: file.file_type || 'image/jpeg'
                });

              if (!secErr) {
                const { data: secData } = supabase.storage
                  .from('documentos-e-midias')
                  .getPublicUrl(file.storage_path);
                publicUrl = secData?.publicUrl || '';
                console.log('[SYNC ENGINE] Upload no bucket secundário concluído com sucesso:', publicUrl);
              } else {
                console.warn('[SYNC ENGINE] Bucket secundário também falhou:', secErr.message);
              }
            } catch (secEx: any) {
              console.warn('[SYNC ENGINE] Exceção ao tentar bucket secundário:', secEx?.message);
            }

            if (!publicUrl) {
              // Fallback Data URL Base64 para não perder a foto do técnico
              console.warn('[SYNC ENGINE] Storage indisponível/rejeitado. Convertendo para fallback Base64...');
              try {
                publicUrl = await this.blobToBase64(file.file_blob);
              } catch (b64Err) {
                console.error('[SYNC ENGINE] Falha ao converter para Base64:', b64Err);
              }
            }
          }

          if (publicUrl) {
            fileUrlMap.set(file.id, publicUrl);

            // Verifica se há alguma mutação pendente na fila que processe este arquivo
            const hasPendingMutation = eligibleMutations.some(m => m.file_ids && m.file_ids.includes(file.id));
            if (!hasPendingMutation) {
              console.log(`[SYNC ENGINE] Arquivo #${file.id} sem mutação pendente vinculada. Reconciliando com o banco...`);
              const pathOrName = file.storage_path || file.file_name || '';
              const match = pathOrName.match(/evidencia_([0-9a-fA-F-]+)_([0-9a-fA-F-]+)/);
              if (match) {
                const audId = match[1];
                const rawPergId = match[2];
                const canonPergId = normalizePerguntaId(rawPergId);
                const nowIso = new Date().toISOString();

                try {
                  const cached = await db.cached_respostas.get([audId, canonPergId]);
                  await supabase
                    .from('respostas_auditoria')
                    .upsert({
                      auditoria_id: audId,
                      pergunta_id: canonPergId,
                      conforme: cached?.conforme ?? false,
                      nao_se_aplica: cached?.nao_se_aplica ?? false,
                      observacoes: cached?.observacoes || '',
                      evidencia_url: publicUrl,
                      updated_at: nowIso
                    }, { onConflict: 'auditoria_id,pergunta_id' });

                  await db.cached_respostas.put({
                    auditoria_id: audId,
                    pergunta_id: canonPergId,
                    conforme: cached?.conforme ?? false,
                    nao_se_aplica: cached?.nao_se_aplica ?? false,
                    observacoes: cached?.observacoes || '',
                    numero_criterio: cached?.numero_criterio,
                    evidencia_url: publicUrl,
                    updated_at: nowIso,
                    evidencia_uploaded_at: cached?.evidencia_uploaded_at || nowIso,
                    data_envio: cached?.data_envio || nowIso
                  });
                  console.log(`[SYNC ENGINE] Reconciliação direta de evidência concluída para ${audId} / ${canonPergId}`);
                } catch (reconErr) {
                  console.warn('[SYNC ENGINE] Aviso ao atualizar respostas_auditoria diretamente:', reconErr);
                }
              }

              await removeFile(file.id);
              drainedCount++;
              this._consecutiveNetworkErrors = 0;
              console.log(`[SYNC ENGINE] [2PC - Concluído] Arquivo órfão ${file.id} reconciliado e purgado do IndexedDB.`);
              console.groupEnd();
              continue;
            }

            // CORREÇÃO 1: TWO-PHASE COMMIT (2PC - FASE 1)
            await markFileStatus(file.id, 'uploaded_pending_db', publicUrl);
            drainedCount++;
            await this.notify();
            this._consecutiveNetworkErrors = 0;
            console.log('[SYNC ENGINE] [2PC - Fase 1] Arquivo salvo no Storage. Deleção travada até confirmação da mutação Postgres:', {
              id: file.id,
              url: publicUrl.startsWith('data:') ? 'Data URL (Base64)' : publicUrl
            });
            console.groupEnd();
            continue;
          } else {
            console.warn('[SYNC ENGINE] Falha ao gerar URL. Isolando na fila e avançando para o próximo item...');
            const nextAttempts = (file.attempts || 0) + 1;
            const backoffSec = this.calculateBackoffSeconds(nextAttempts);
            const nextRetry = new Date(Date.now() + backoffSec * 1000).toISOString();
            await markFileRetry(file.id, nextAttempts, nextRetry, 'storage_error', finalUpErr?.message || 'Storage inacessível');
            errorCount++;
            console.groupEnd();
            continue; // AVANÇA PARA O PRÓXIMO ITEM! NÃO TRAVA A FILA!
          }
        } catch (fErr: any) {
          console.error('[SYNC ENGINE] Falha física ou exceção no upload do arquivo:', fErr);
          const isPhysicalNet = typeof navigator !== 'undefined' && !navigator.onLine;

          if (isPhysicalNet) {
            hadPhysicalNetworkFailure = true;
            this._consecutiveNetworkErrors++;
            const nextAttempts = (file.attempts || 0) + 1;
            const backoffSec = this.calculateBackoffSeconds(nextAttempts);
            const nextRetry = new Date(Date.now() + backoffSec * 1000).toISOString();
            await markFileRetry(file.id, nextAttempts, nextRetry, 'network_timeout', fErr.message);
            errorCount++;
            console.groupEnd();
            break;
          } else {
            // Tenta fallback Base64 antes de isolar
            try {
              const b64 = await this.blobToBase64(file.file_blob);
              if (b64) {
                fileUrlMap.set(file.id, b64);
                // CORREÇÃO 1: TWO-PHASE COMMIT - Preserva Blob físico até confirmação do Postgres
                await markFileStatus(file.id, 'uploaded_pending_db', b64);
                drainedCount++;
                await this.notify();
                console.log('[SYNC ENGINE] [2PC - Fase 1] Arquivo recuperado via Base64 após exceção (deleção retida até confirmação no Postgres)!');
                console.groupEnd();
                continue;
              }
            } catch {}

            await markFileDeadLetter(file.id, fErr.message || 'Erro no upload', 'STORAGE_EXCEPTION');
            errorCount++;
            console.groupEnd();
            continue; // AVANÇA PARA O PRÓXIMO ITEM!
          }
        }
      }

      // PASSO C: Processar Mutações no Postgres (outbox_mutations com ISOLAMENTO POR REGISTRO)
      const shouldAttemptMutations = !hadPhysicalNetworkFailure || (typeof navigator !== 'undefined' && navigator.onLine);
      if (shouldAttemptMutations) {
        for (let j = 0; j < eligibleMutations.length; j++) {
          const mutation = eligibleMutations[j];
          if (!mutation.id) continue;

          // Atualiza progresso autêntico
          const currentPercent = Math.round((drainedCount / totalItems) * 100);
          this._progress = {
            phase: 'syncing',
            totalItems,
            completedItems: drainedCount,
            progressPercent: currentPercent,
            currentItemType: 'checklist',
            currentItemLabel: `Sincronizando ${mutation.table} (${drainedCount + 1} de ${totalItems})...`
          };
          this.notify();

          console.groupCollapsed(`[SYNC ENGINE] Mutação #${mutation.id} (${mutation.table} - ${mutation.action})`);
          console.log('Payload original:', mutation.payload);

          try {
            // Validação de integridade do payload
            if (!mutation.payload || typeof mutation.payload !== 'object' || Object.keys(mutation.payload).length === 0) {
              console.error('[SYNC ENGINE] Payload vazio ou corrompido. Isolando na DLQ.');
              await markMutationDeadLetter(mutation.id, 'Payload nulo ou vazio no IndexedDB', 'EMPTY_PAYLOAD');
              errorCount++;
              console.groupEnd();
              continue; // AVANÇA PARA O PRÓXIMO!
            }

            await markMutationStatus(mutation.id, 'syncing');

                        // Injeta URLs públicas geradas das fotos no payload correspondente (SE NÃO FOR REMOÇÃO)
            const payload = { ...mutation.payload };
            if (payload.evidencia_url !== null && mutation.file_ids && mutation.file_ids.length > 0) {
              for (const fid of mutation.file_ids) {
                if (fileUrlMap.has(fid)) {
                  payload.evidencia_url = fileUrlMap.get(fid);
                } else {
                  // Fallback resiliente: recupera URL já gravada no Dexie em outbox_files
                  const savedFile = await db.outbox_files.get(fid);
                  if (savedFile?.public_url) {
                    payload.evidencia_url = savedFile.public_url;
                  }
                }
              }
              payload.updated_at = payload.updated_at || new Date().toISOString();
            }

            // CORREÇÃO 2: Sanitização da restrição NOT NULL na coluna 'conforme'
            // CORREÇÃO 4: Reconciliação de auditorias sintéticas
            if (mutation.table === 'pendencias') {
              if ('auditoria_id' in payload) {
                delete payload.auditoria_id;
              }
            }

            if (mutation.table === 'auditorias') {
              if ('propriedades' in payload) {
                delete payload.propriedades;
              }
            }

            if (mutation.table === 'respostas_auditoria') {
              if (payload.pergunta_id) {
                payload.pergunta_id = normalizePerguntaId(payload.pergunta_id);
              }
              if (payload.conforme === null || payload.conforme === undefined) {
                console.warn(`[SYNC ENGINE] Sanitizando payload de respostas_auditoria #${mutation.id}: 'conforme' é null/undefined. Aplicando fallback 'false' para cumprir NOT NULL.`);
                payload.conforme = false;
              }
              if (payload.nao_se_aplica !== undefined) {
                payload.nao_se_aplica = !!payload.nao_se_aplica;
              }

              if (payload.auditoria_id && (payload.auditoria_id.startsWith('mock-') || payload.auditoria_id.startsWith('assigned-pend-') || payload.auditoria_id.startsWith('temp-'))) {
                try {
                  const cachedAud = await db.cached_auditorias.get(payload.auditoria_id);
                  const targetPropId = cachedAud?.propriedade_id;
                  if (targetPropId && !targetPropId.startsWith('mock-')) {
                    const { data: realAudit } = await supabase
                      .from('auditorias')
                      .select('id')
                      .eq('propriedade_id', targetPropId)
                      .order('created_at', { ascending: false })
                      .limit(1)
                      .maybeSingle();
                    if (realAudit?.id) {
                      console.log(`[SYNC ENGINE] Reconciliado ID sintético '${payload.auditoria_id}' -> '${realAudit.id}' para mutação #${mutation.id}`);
                      payload.auditoria_id = realAudit.id;
                      await db.outbox_mutations.update(mutation.id, { payload });
                    }
                  }
                } catch (reconErr) {
                  console.warn('[SYNC ENGINE] Aviso ao tentar reconciliar auditoria sintética:', reconErr);
                }
              }
            }

            let responseError: any = null;

            if (mutation.action === 'upsert') {
              const opts = mutation.on_conflict ? { onConflict: mutation.on_conflict } : undefined;
              const { error } = await supabase
                .from(mutation.table)
                .upsert(payload, opts);
              responseError = error;
            } else if (mutation.action === 'insert') {
              const { error } = await supabase
                .from(mutation.table)
                .insert(payload);
              responseError = error;
            } else if (mutation.action === 'update') {
              let query = supabase.from(mutation.table).update(payload);
              if (mutation.match_key) {
                Object.entries(mutation.match_key).forEach(([k, v]) => {
                  query = query.eq(k, v);
                });
              } else if (payload.id) {
                query = query.eq('id', payload.id);
              }
              const { error } = await query;
              responseError = error;
            } else if (mutation.action === 'delete') {
              let query = supabase.from(mutation.table).delete();
              if (mutation.match_key) {
                Object.entries(mutation.match_key).forEach(([k, v]) => {
                  query = query.eq(k, v);
                });
              } else if (payload.id) {
                query = query.eq('id', payload.id);
              }
              const { error } = await query;
              responseError = error;
            }

            console.log('5. Resposta Postgres:', { dbData: payload, dbError: responseError });

            if (!responseError) {
              // SUCESSO! Remove atomicamente da fila
              await removeMutation(mutation.id);

              // CORREÇÃO 1: TWO-PHASE COMMIT (2PC - FASE 2)
              // Somente após o Postgres confirmar com sucesso (200 OK), purga os arquivos binários do Dexie!
              if (mutation.file_ids && mutation.file_ids.length > 0) {
                for (const fid of mutation.file_ids) {
                  await removeFile(fid);
                  console.log('6. [2PC - Fase 2] Ponto de deleção do Dexie atingido com segurança para ID:', fid, '(após confirmação no Postgres)');
                }
              }

              if (mutation.table === 'respostas_auditoria' && payload.auditoria_id && payload.pergunta_id) {
                try {
                  const cached = await db.cached_respostas.get([payload.auditoria_id, payload.pergunta_id]);
                  if (cached) {
                    await db.cached_respostas.put({
                      ...cached,
                      evidencia_url: payload.evidencia_url,
                      updated_at: payload.updated_at || new Date().toISOString(),
                      evidencia_uploaded_at: payload.evidencia_url ? (cached.evidencia_uploaded_at || payload.updated_at || new Date().toISOString()) : null,
                      data_envio: payload.evidencia_url ? (cached.data_envio || payload.updated_at || new Date().toISOString()) : null
                    });
                  }
                } catch (cErr) {
                  console.warn('[SYNC ENGINE] Aviso ao sincronizar cached_respostas após sucesso:', cErr);
                }
              }

              drainedCount++;
              await this.notify();
              this._consecutiveNetworkErrors = 0;
              console.log('[SYNC ENGINE] Mutação gravada com sucesso no Postgres!');
              console.groupEnd();
              continue; // AVANÇA PARA O PRÓXIMO ITEM!
            }

            console.error('[SYNC ENGINE] Erro retornado pela API do Supabase:', responseError);

            // Verificar se o erro é 401 / Token Expirado
            const isAuthError = responseError && (
              responseError.status === 401 ||
              responseError.statusCode === '401' ||
              responseError.code === 'PGRST301' ||
              responseError.message?.toLowerCase().includes('jwt') ||
              responseError.message?.toLowerCase().includes('token')
            );

            if (isAuthError) {
              console.warn('[SYNC ENGINE] Erro de autenticação retornado pela API. Tentando renovação silenciosa...');
              try {
                const { data: refData, error: refErr } = await supabase.auth.refreshSession();
                if (!refErr && refData?.session) {
                  let retryError: any = null;
                  if (mutation.action === 'upsert') {
                    const opts = mutation.on_conflict ? { onConflict: mutation.on_conflict } : undefined;
                    const res = await supabase.from(mutation.table).upsert(payload, opts);
                    retryError = res.error;
                  } else if (mutation.action === 'insert') {
                    const res = await supabase.from(mutation.table).insert(payload);
                    retryError = res.error;
                  } else if (mutation.action === 'update') {
                    let query = supabase.from(mutation.table).update(payload);
                    if (mutation.match_key) {
                      Object.entries(mutation.match_key).forEach(([k, v]) => {
                        query = query.eq(k, v);
                      });
                    } else if (payload.id) {
                      query = query.eq('id', payload.id);
                    }
                    const res = await query;
                    retryError = res.error;
                  } else if (mutation.action === 'delete') {
                    let query = supabase.from(mutation.table).delete();
                    if (mutation.match_key) {
                      Object.entries(mutation.match_key).forEach(([k, v]) => {
                        query = query.eq(k, v);
                      });
                    } else if (payload.id) {
                      query = query.eq('id', payload.id);
                    }
                    const res = await query;
                    retryError = res.error;
                  }

                  if (!retryError) {
                    await removeMutation(mutation.id);

                    // CORREÇÃO 1: TWO-PHASE COMMIT (2PC - FASE 2 após refresh)
                    if (mutation.file_ids && mutation.file_ids.length > 0) {
                      for (const fid of mutation.file_ids) {
                        await removeFile(fid);
                        console.log('6. [2PC - Fase 2] Ponto de deleção do Dexie atingido com segurança para ID (após refresh):', fid);
                      }
                    }
                    drainedCount++;
                    await this.notify();
                    this._consecutiveNetworkErrors = 0;
                    console.log('[SYNC ENGINE] Mutação gravada com sucesso após renovação de sessão!');
                    console.groupEnd();
                    continue;
                  }
                  responseError = retryError;
                }
              } catch (e) {
                console.warn('[SYNC ENGINE] Falha na tentativa de refresh durante mutação:', e);
              }

              if (!this.isUserAuthenticated()) {
                console.warn('[SYNC ENGINE] Sessão definitivamente expirada e usuário não ativo. Pausando envio.');
                this._progress = {
                  phase: 'auth_required',
                  totalItems,
                  completedItems: drainedCount,
                  progressPercent: currentPercent,
                  errorMessage: 'Faça login novamente para transmitir os dados de campo salvos no aparelho.'
                };
                this.notify();
                console.groupEnd();
                break;
              }
            }

            // Classificar se o erro é FALHA FÍSICA DE REDE
            const isPhysicalNetworkError =
              responseError.message?.includes('Failed to fetch') ||
              responseError.message?.includes('NetworkError') ||
              responseError.message?.includes('network connection lost') ||
              responseError.code === 'PGRST000';

            if (isPhysicalNetworkError) {
              hadPhysicalNetworkFailure = true;
              this._consecutiveNetworkErrors++;
              const nextAttempts = (mutation.attempts || 0) + 1;
              const backoffSec = this.calculateBackoffSeconds(nextAttempts);
              const nextRetry = new Date(Date.now() + backoffSec * 1000).toISOString();
              await markMutationRetry(
                mutation.id,
                nextAttempts,
                nextRetry,
                'network_timeout',
                responseError.message || 'Conexão física interrompida'
              );
              errorCount++;
              console.groupEnd();
              break; // Pausa para aguardar restabelecimento de rede
            } else {
              // ERRO DE NEGÓCIO, CONSTRAINT, RLS OU FOREIGN KEY (ex.: 23503, 400, 403, etc.)
              // REGRA DE OURO: Isso NÃO é falta de internet! Isola na Dead-Letter Queue e AVANÇA!
              console.warn('[SYNC ENGINE] Erro permanente de validação/schema/RLS. Movendo para Dead-Letter Queue:', responseError);
              await markMutationDeadLetter(
                mutation.id,
                responseError.message || JSON.stringify(responseError),
                responseError.code
              );
              errorCount++;
              console.groupEnd();
              continue; // FIM DO HEAD-OF-LINE BLOCKING: processa os itens seguintes!
            }
          } catch (mErr: any) {
            console.error('[SYNC ENGINE] Exceção na mutação:', mErr);
            const isPhysicalNet = mErr.name === 'AbortError' ||
              mErr.message?.includes('Failed to fetch') ||
              mErr.message?.includes('NetworkError') ||
              !navigator.onLine;

            if (isPhysicalNet) {
              hadPhysicalNetworkFailure = true;
              this._consecutiveNetworkErrors++;
              const nextAttempts = (mutation.attempts || 0) + 1;
              const backoffSec = this.calculateBackoffSeconds(nextAttempts);
              const nextRetry = new Date(Date.now() + backoffSec * 1000).toISOString();
              await markMutationRetry(
                mutation.id,
                nextAttempts,
                nextRetry,
                'network_timeout',
                mErr.message
              );
              errorCount++;
              console.groupEnd();
              break;
            } else {
              await markMutationDeadLetter(mutation.id, mErr.message || 'Erro inesperado na execução', 'EXCEPTION');
              errorCount++;
              console.groupEnd();
              continue; // AVANÇA PARA O PRÓXIMO!
            }
          }
        }
      }

      this._lastSyncTime = new Date();
    } catch (globalErr: any) {
      console.error('[SyncEngine] Erro global durante sincronização:', globalErr);
      this._lastError = globalErr.message || 'Erro desconhecido';
    } finally {
      this._isSyncing = false;
      this._syncStartTime = 0;
      const counts = await getPendingCounts();

      if (counts.total === 0) {
        // TUDO ATUALIZADO NO BANCO DE DADOS (0 PENDÊNCIAS)
        this._connectionState = 'ONLINE';
        this._isOnline = true;
        this._consecutiveNetworkErrors = 0;

        this._progress = {
          phase: drainedCount > 0 ? 'success' : 'idle',
          totalItems: drainedCount,
          completedItems: drainedCount,
          progressPercent: 100,
          lastDrainedCount: drainedCount,
          deadLetterCount: 0
        };
        this.notify();

        if (this._successTimerId) clearTimeout(this._successTimerId);
        if (drainedCount > 0) {
          this._successTimerId = setTimeout(() => {
            if (this._progress.phase === 'success') {
              this._progress = {
                phase: this._connectionState === 'OFFLINE' ? 'offline' : 'idle',
                totalItems: 0,
                completedItems: 0,
                progressPercent: 0,
                deadLetterCount: 0
              };
              this.notify();
            }
          }, 3000);
        }
      } else if (errorCount === 0 && drainedCount > 0) {
        this._connectionState = 'ONLINE';
        this._isOnline = true;
        this._consecutiveNetworkErrors = 0;

        this._progress = {
          phase: 'success',
          totalItems,
          completedItems: drainedCount,
          progressPercent: 100,
          lastDrainedCount: drainedCount,
          deadLetterCount: counts.deadLetter
        };
        this.notify();

        if (this._successTimerId) clearTimeout(this._successTimerId);
        this._successTimerId = setTimeout(() => {
          if (this._progress.phase === 'success') {
            this._progress = {
              phase: this._connectionState === 'OFFLINE' ? 'offline' : 'idle',
              totalItems: 0,
              completedItems: 0,
              progressPercent: 0,
              deadLetterCount: counts.deadLetter
            };
            this.notify();
          }
        }, 3000);
      } else if (errorCount > 0) {
        const hasDeadLetter = counts.deadLetter > 0;
        const msg = hadPhysicalNetworkFailure
          ? 'Oscilação de conexão. Itens restantes serão reenviados automaticamente.'
          : hasDeadLetter
          ? `${counts.deadLetter} item(ns) com pendência de validação/dados.`
          : `${errorCount} item(ns) aguardando nova tentativa.`;

        this._progress = {
          phase: hadPhysicalNetworkFailure ? 'partial_failure' : (hasDeadLetter ? 'error' : 'partial_failure'),
          totalItems,
          completedItems: drainedCount,
          progressPercent: totalItems > 0 ? Math.round((drainedCount / totalItems) * 100) : 0,
          errorMessage: msg,
          deadLetterCount: counts.deadLetter
        };
        this.notify();
      } else {
        this.notify();
      }

      // Dispara evento global de conclusão de ciclo para atualizar telas abertas (Documentação, Auditorias, etc.)
      if (typeof window !== 'undefined' && drainedCount > 0) {
        window.dispatchEvent(new CustomEvent('ms:sync-complete', {
          detail: { drainedCount, errorCount, counts }
        }));
        window.dispatchEvent(new CustomEvent('ms:outbox-changed'));
      }

      // Se novos itens entraram enquanto esta sincronização estava rodando, dispara novo ciclo imediatamente
      if (this._hasPendingResync && (typeof navigator === 'undefined' || navigator.onLine)) {
        this._hasPendingResync = false;
        setTimeout(() => {
          this.syncNow(true);
        }, 150);
      }
    }

    return {
      success: errorCount === 0,
      drained: drainedCount,
      errors: errorCount
    };
  }
}

export const syncEngine = new SyncEngine();

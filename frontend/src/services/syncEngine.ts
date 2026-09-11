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
  onOutboxChange,
  cacheReadData,
  purgeCorruptedQueue,
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

      // DEBOUNCE DE 3.0 SEGUNDOS PARA FILTRAR OSCILAÇÕES DE SINAL
      window.addEventListener('online', () => {
        console.log('[SyncEngine] Evento online detectado. Verificando conectividade real (debounce 3s)...');
        if (this._offlineDebounceTimer) {
          clearTimeout(this._offlineDebounceTimer);
          this._offlineDebounceTimer = null;
        }

        if (this._onlineDebounceTimer) clearTimeout(this._onlineDebounceTimer);
        this._onlineDebounceTimer = setTimeout(async () => {
          this._onlineDebounceTimer = null;
          if (typeof navigator !== 'undefined' && !navigator.onLine) {
            console.log('[SyncEngine] Oscilação rápida descartada: navigator.onLine é false.');
            return;
          }

          // Ping leve de baixo nível com AbortController
          const isAlive = await this.pingSupabase();
          if (isAlive) {
            console.log('[SyncEngine] Servidor acessível. Conexão ONLINE confirmada.');
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
        }, 3000);
      });

      window.addEventListener('offline', () => {
        console.log('[SyncEngine] Evento offline detectado. Aguardando 3s...');
        if (this._onlineDebounceTimer) {
          clearTimeout(this._onlineDebounceTimer);
          this._onlineDebounceTimer = null;
        }

        if (this._offlineDebounceTimer) clearTimeout(this._offlineDebounceTimer);
        this._offlineDebounceTimer = setTimeout(() => {
          this._offlineDebounceTimer = null;
          if (typeof navigator !== 'undefined' && navigator.onLine) {
            console.log('[SyncEngine] Oscilação descartada: sinal recuperado antes do timeout.');
            return;
          }

          console.log('[SyncEngine] Desconexão física confirmada. Modo Campo ativo (OFFLINE).');
          this._connectionState = 'OFFLINE';
          this._isOnline = false;
          this.notify();
        }, 3000);
      });

      // Checagem periódica a cada 45s
      this._syncIntervalId = setInterval(() => {
        if (this._isOnline && !this._isSyncing) {
          this.checkConnectivityAndSync();
        }
      }, 45000);
    }
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
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const targetUrl = supabaseUrl || (supabase as any)?.supabaseUrl || 'http://127.0.0.1:54321';
      const targetKey = supabaseAnonKey || (supabase as any)?.supabaseKey || '';
      const pingUrl = targetUrl.replace(/\/$/, '') + '/rest/v1/';

      const res = await fetch(pingUrl, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          apikey: targetKey
        }
      }).catch(() => null);

      clearTimeout(timeoutId);
      // Qualquer resposta HTTP recebida (200, 401, 403, 404, 500) confirma conectividade física
      return !!(res && (res.status > 0 || res.ok));
    } catch {
      return typeof navigator !== 'undefined' ? navigator.onLine : false;
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
    // 1. INVESTIGAÇÃO DE DEADLOCK / MUTEX TRAVADO:
    // Se forceAll for true ou se a sincronização anterior estiver travada há mais de 15s (watchdog), destrava o mutex
    if (this._isSyncing) {
      const elapsed = this._syncStartTime > 0 ? Date.now() - this._syncStartTime : 0;
      if (forceAll || elapsed > 15000) {
        console.warn(`[SyncEngine] Mutex destravado (forceAll: ${forceAll}, decorrido: ${elapsed}ms). Forçando execução.`);
        this._isSyncing = false;
        this._syncStartTime = 0;
      } else {
        console.log('[SyncEngine] Sincronização já em andamento. Ignorando chamada concorrente.');
        return { success: false, drained: 0, errors: 0 };
      }
    }

    // Cancelar backoff ou debounce pendente em clique forçado
    if (forceAll) {
      if (this._onlineDebounceTimer) {
        clearTimeout(this._onlineDebounceTimer);
        this._onlineDebounceTimer = null;
      }
      if (this._offlineDebounceTimer) {
        clearTimeout(this._offlineDebounceTimer);
        this._offlineDebounceTimer = null;
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
    } catch (rErr) {
      console.warn('[SyncEngine] Aviso ao resgatar mutações NOT NULL da DLQ:', rErr);
    }

    // Obter itens elegíveis (Unified Journal + legado de outbox)
    const eligibleJournal = await getPendingJournalItems(forceAll);
    const eligibleFiles = await getEligibleFiles(forceAll);
    const eligibleMutations = await getEligibleMutations(forceAll);
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
        if (!item.id) continue;

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
          currentItemLabel: `Transmitindo (${drainedCount + 1} de ${totalItems}): Critério ${item.numero_criterio || item.pergunta_id}`
        };
        this.notify();

        console.groupCollapsed(`[SYNC ENGINE] Journal Item #${item.id} (Auditoria: ${item.auditoria_id}, Pergunta: ${item.pergunta_id})`);
        await markJournalItemStatus(item.id, 'syncing');

        try {
          let publicUrl: string | null = item.evidencia_url || null;

          // PASSO A (Upload Storage): Se houver file_blob, envia ao bucket 'evidencias'
          if (item.file_blob) {
            const bucket = 'evidencias';
            const rawExt = (item.file_name?.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
            const storagePath = item.storage_path || `evidencias/${item.auditoria_id}_${item.pergunta_id}_${item.created_at || Date.now()}.${rawExt || 'jpg'}`;

            console.log('[SYNC ENGINE] Passo A: Upload do Blob ao Storage bucket evidencias:', storagePath);
            let uploadRes = await supabase.storage
              .from(bucket)
              .upload(storagePath, item.file_blob, {
                upsert: true,
                contentType: item.mime_type || 'image/jpeg'
              });

            // Se erro 401 / JWT expirado, tenta renovação silenciosa
            if (uploadRes.error && (
              (uploadRes.error as any).statusCode === '401' ||
              uploadRes.error.message?.toLowerCase().includes('jwt') ||
              uploadRes.error.message?.toLowerCase().includes('token')
            )) {
              console.log('[SYNC ENGINE] Token expirado no upload do journal. Tentando refresh silencioso...');
              try {
                const { data: refData } = await supabase.auth.refreshSession();
                if (refData?.session) {
                  uploadRes = await supabase.storage
                    .from(bucket)
                    .upload(storagePath, item.file_blob, {
                      upsert: true,
                      contentType: item.mime_type || 'image/jpeg'
                    });
                }
              } catch (rErr) {
                console.warn('[SYNC ENGINE] Falha ao tentar refresh durante upload do journal:', rErr);
              }
            }

            if (uploadRes.error) {
              console.error('[SYNC ENGINE] Erro no upload Storage do journal:', uploadRes.error);
              throw uploadRes.error; // Erro no Storage -> lança erro e NÃO remove o item da fila!
            }

            const { data: pubData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
            publicUrl = pubData?.publicUrl || null;
            console.log('[SYNC ENGINE] Passo A Concluído. URL pública gerada:', publicUrl);
          }

          // PASSO B (Upsert Postgres): Executa o upsert sanitizado em respostas_auditoria
          const nowIso = new Date().toISOString();
          const payload = {
            auditoria_id: item.auditoria_id,
            pergunta_id: item.pergunta_id,
            conforme: item.conforme ?? false, // Impede violação de NOT NULL (Erro 23502)
            observacoes: item.observacoes || '',
            evidencia_url: publicUrl || item.evidencia_url || null,
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

          if (pgErr) {
            console.error('[SYNC ENGINE] Erro no upsert Postgres do journal:', pgErr);
            throw pgErr;
          }

          // PASSO C (Atualização do Cache Local): Salva registro confirmado com URL definitiva em db.cached_respostas
          await db.cached_respostas.put({
            auditoria_id: item.auditoria_id,
            pergunta_id: item.pergunta_id,
            conforme: item.conforme ?? false,
            observacoes: item.observacoes || '',
            evidencia_url: payload.evidencia_url,
            numero_criterio: item.numero_criterio,
            updated_at: nowIso,
            evidencia_uploaded_at: payload.evidencia_url ? nowIso : null,
            data_envio: payload.evidencia_url ? nowIso : null
          });
          console.log('[SYNC ENGINE] Passo C Concluído: Cache local atualizado com URL definitiva.');

          // PASSO D (Deleção Segura do Journal): Executa delete exclusivamente após confirmação do Postgres (status 200/201)
          await db.sync_journal.delete(item.id);
          console.log(`[SYNC ENGINE] Passo D Concluído: Item #${item.id} removido do sync_journal após 2PC confirmado.`);
          
          drainedCount++;
          console.groupEnd();
        } catch (itemErr: any) {
          errorCount++;
          const errMsg = itemErr?.message || String(itemErr);
          console.error(`[SYNC ENGINE] Falha ao processar item #${item.id} do journal:`, errMsg);

          const isNetwork = !navigator.onLine ||
            itemErr?.name === 'AbortError' ||
            errMsg.includes('Failed to fetch') ||
            errMsg.includes('NetworkError') ||
            errMsg.includes('network connection lost') ||
            itemErr?.code === 'PGRST000';

          await markJournalItemStatus(item.id, 'failed', errMsg);

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
          let publicUrl = '';
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
            // CORREÇÃO 1: TWO-PHASE COMMIT (2PC - FASE 1: NÃO DELETAR O ARQUIVO DO DEXIE AQUI!)
            // Marca o arquivo como uploaded_pending_db e armazena a public_url no Dexie.
            // O Blob físico é PRESERVADO no IndexedDB até que o Postgres confirme o salvamento!
            await markFileStatus(file.id, 'uploaded_pending_db', publicUrl);
            drainedCount++;
            await this.notify();
            this._consecutiveNetworkErrors = 0;
            console.log('[SYNC ENGINE] [2PC - Fase 1] Arquivo salvo no Storage. Deleção travada até confirmação do Postgres:', {
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
            if (mutation.table === 'respostas_auditoria') {
              if (payload.conforme === null || payload.conforme === undefined) {
                console.warn(`[SYNC ENGINE] Sanitizando payload de respostas_auditoria #${mutation.id}: 'conforme' é null/undefined. Aplicando fallback 'false' para cumprir NOT NULL.`);
                payload.conforme = false;
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

      if (errorCount === 0 && drainedCount > 0) {
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
        }, 4000);
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
    }

    return {
      success: errorCount === 0,
      drained: drainedCount,
      errors: errorCount
    };
  }
}

export const syncEngine = new SyncEngine();

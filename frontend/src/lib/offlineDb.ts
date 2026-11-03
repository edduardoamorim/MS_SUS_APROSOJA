import defaultAuditoriasJson from '../data/default_auditorias.json';
import { normalizePerguntaId } from '../constants/rtrsMapping';
type OutboxListener = () => void;
const outboxListeners: Set<OutboxListener> = new Set();

export function onOutboxChange(listener: OutboxListener): () => void {
  outboxListeners.add(listener);
  return () => {
    outboxListeners.delete(listener);
  };
}

export function notifyOutboxChange(): void {
  outboxListeners.forEach(listener => {
    try {
      listener();
    } catch (err) {
      console.warn('[OfflineDB] Erro ao notificar ouvinte de outbox:', err);
    }
  });
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('ms:outbox-changed'));
  }
}

import Dexie, { type Table, liveQuery } from 'dexie';
import { useState, useEffect } from 'react';

export type MutationAction = 'upsert' | 'insert' | 'update' | 'delete';
export type MutationStatus = 'pending' | 'syncing' | 'failed' | 'synced' | 'pending_retry' | 'failed_permanently';
export type FileStatus = 'pending' | 'uploading' | 'uploaded_pending_db' | 'synced' | 'failed' | 'pending_retry' | 'failed_permanently';
export type OutboxErrorType = 'network_timeout' | 'payload_error' | 'auth_expired' | 'storage_error' | 'auth_error';

export interface OutboxMutation {
  id?: number;
  client_mutation_id: string;
  table: string;
  action: MutationAction;
  payload: any;
  on_conflict?: string;
  match_key?: Record<string, any>;
  file_ids?: string[];
  status: MutationStatus;
  retry_count: number;
  attempts: number;
  last_attempt_at?: string;
  next_retry_at?: string;
  error_type?: OutboxErrorType;
  error_message?: string;
  last_error?: string;
  error_code?: string | number;
  created_at: string;
  updated_at: string;
}

export interface OutboxFile {
  id: string; // UUID
  client_mutation_id?: string;
  file_blob: Blob | File;
  file_name: string;
  file_type: string;
  file_size: number;
  bucket: string;
  storage_path: string;
  status: FileStatus;
  attempts: number;
  last_attempt_at?: string;
  next_retry_at?: string;
  error_type?: OutboxErrorType;
  error_message?: string;
  last_error?: string;
  error_code?: string | number;
  public_url?: string;
  created_at: string;
}

export interface ReadCacheItem {
  key: string;
  data: any;
  updated_at: string;
}

// Tipos estruturados para as novas tabelas dedicadas de leitura
export interface CachedPergunta {
  id: string;
  secao: string;
  numero_criterio: string;
  criterio: string;
  enunciado: string;
  ponderacao: string;
  orientacao: string;
  interpretacao_nacional?: string;
  ativo?: boolean;
  ordem: number;
}

export interface CachedAuditoria {
  id: string;
  propriedade_id: string;
  tecnico_responsavel_id?: string | null;
  data_agendamento?: string | null;
  status: string;
  etapa?: string;
  ultima_alteracao_at?: string;
  prazo_pendencia?: string | null;
  propriedades?: {
    id: string;
    nome_fazenda: string;
    nome_produtor?: string;
    codigo_car?: string;
    municipio?: string;
    geom?: any;
    created_at?: string;
    updated_at?: string;
  };
  created_at: string;
  updated_at: string;
}

export interface SyncJournalItem {
  id?: number;
  auditoria_id: string;
  pergunta_id: string;
  conforme: boolean; // NUNCA null. Se ainda não preenchido, registrar false como rascunho de vistoria.
  nao_se_aplica?: boolean;
  observacoes: string;
  file_blob?: Blob;
  file_name?: string;
  mime_type?: string;
  storage_path?: string;
  evidencia_url?: string | null;
  is_explicit_delete?: boolean;
  numero_criterio?: string;
  status: 'pending' | 'syncing' | 'failed';
  created_at: number;
  updated_at: string;
  attempts: number;
  last_error?: string;
}

export interface CachedResposta {
  id?: string;
  auditoria_id: string;
  pergunta_id: string;
  conforme: boolean | null;
  nao_se_aplica?: boolean;
  observacoes: string;
  evidencia_url: string | null;
  numero_criterio?: string;
  created_at?: string;
  updated_at?: string;
  evidencia_uploaded_at?: string | null;
  data_envio?: string | null;
}

export interface CachedPendencia {
  id: string;
  propriedade_id: string;
  auditoria_id?: string | null;
  titulo: string;
  descricao: string;
  status: string;
  prazo?: string | null;
  gravidade?: string;
  evidencia_url?: string | null;
  resolucao_descricao?: string | null;
  motivo_rejeicao?: string | null;
  criado_por?: string | null;
  tecnico_responsavel_id?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface AppMetadataItem {
  key: string;
  value: any;
  updated_at: string;
}

export class MSSustentavelLocalDB extends Dexie {
  outbox_mutations!: Table<OutboxMutation, number>;
  outbox_files!: Table<OutboxFile, string>;
  read_cache!: Table<ReadCacheItem, string>;
  cached_perguntas!: Table<CachedPergunta, string>;
  cached_auditorias!: Table<CachedAuditoria, string>;
  cached_respostas!: Table<CachedResposta, [string, string]>;
  cached_pendencias!: Table<CachedPendencia, string>;
  app_metadata!: Table<AppMetadataItem, string>;
  sync_journal!: Table<SyncJournalItem, number>;

  constructor() {
    super('MSSustentavelLocalDB');
    this.version(1).stores({
      outbox_mutations: '++id, client_mutation_id, table, status, created_at, [table+status]',
      outbox_files: 'id, client_mutation_id, bucket, status, created_at',
      read_cache: 'key, updated_at'
    });

    // Versão 2 com tabelas estruturadas de leitura
    this.version(2).stores({
      outbox_mutations: '++id, client_mutation_id, table, status, created_at, [table+status]',
      outbox_files: 'id, client_mutation_id, bucket, status, created_at',
      read_cache: 'key, updated_at',
      cached_perguntas: 'id, secao, numero_criterio, ordem',
      cached_auditorias: 'id, propriedade_id, tecnico_responsavel_id, status, updated_at',
      cached_respostas: '[auditoria_id+pergunta_id], auditoria_id, pergunta_id',
      cached_pendencias: 'id, propriedade_id, auditoria_id, status',
      app_metadata: 'key'
    });

    // Versão 3 com resiliência de retries (next_retry_at) e ordenação determinística
    this.version(3).stores({
      outbox_mutations: '++id, client_mutation_id, table, status, created_at, next_retry_at, [table+status]',
      outbox_files: 'id, client_mutation_id, bucket, status, created_at, next_retry_at',
      read_cache: 'key, updated_at',
      cached_perguntas: 'id, secao, numero_criterio, ordem',
      cached_auditorias: 'id, propriedade_id, tecnico_responsavel_id, status, data_agendamento, updated_at',
      cached_respostas: '[auditoria_id+pergunta_id], auditoria_id, pergunta_id',
      cached_pendencias: 'id, propriedade_id, auditoria_id, status',
      app_metadata: 'key'
    });

    // Versão 4: Unified WAL / Journal Atômico
    this.version(4).stores({
      outbox_mutations: '++id, client_mutation_id, table, status, created_at, next_retry_at, [table+status]',
      outbox_files: 'id, client_mutation_id, bucket, status, created_at, next_retry_at',
      read_cache: 'key, updated_at',
      cached_perguntas: 'id, secao, numero_criterio, ordem',
      cached_auditorias: 'id, propriedade_id, tecnico_responsavel_id, status, data_agendamento, updated_at',
      cached_respostas: '[auditoria_id+pergunta_id], auditoria_id, pergunta_id',
      cached_pendencias: 'id, propriedade_id, auditoria_id, status',
      app_metadata: 'key',
      sync_journal: '++id, auditoria_id, pergunta_id, status, created_at, attempts'
    });

    // Versão 5: Reestruturação resiliente com chave autoincremento e índice composto
    this.version(5).stores({
      outbox_mutations: '++id, client_mutation_id, table, status, created_at, next_retry_at, [table+status]',
      outbox_files: 'id, client_mutation_id, bucket, status, created_at, next_retry_at',
      read_cache: 'key, updated_at',
      cached_perguntas: 'id, secao, numero_criterio, ordem',
      cached_auditorias: 'id, propriedade_id, tecnico_responsavel_id, status, data_agendamento, updated_at',
      cached_respostas: '[auditoria_id+pergunta_id], auditoria_id, pergunta_id',
      cached_pendencias: 'id, propriedade_id, auditoria_id, status',
      app_metadata: 'key',
      sync_journal: '++id, auditoria_id, pergunta_id, status, created_at, [auditoria_id+pergunta_id]'
    });

    // Versão 6: Índices de auditorias e respostas otimizados
    this.version(6).stores({
      outbox_mutations: '++id, client_mutation_id, table, status, created_at, next_retry_at, [table+status]',
      outbox_files: 'id, client_mutation_id, bucket, status, created_at, next_retry_at',
      read_cache: 'key, updated_at',
      cached_perguntas: 'id, secao, numero_criterio, ordem',
      cached_auditorias: 'id, etapa, status, updated_at, propriedade_id, tecnico_responsavel_id',
      cached_respostas: '[auditoria_id+pergunta_id], auditoria_id, pergunta_id, updated_at',
      cached_pendencias: 'id, propriedade_id, auditoria_id, status',
      app_metadata: 'key',
      sync_journal: '++id, auditoria_id, pergunta_id, status, created_at, [auditoria_id+pergunta_id]'
    });
  }
}

export const db = new MSSustentavelLocalDB();

// Verificação explícita de abertura e recuperação automática contra SchemaError
db.open().catch(async (err) => {
  console.error('[OFFLINE DB] Falha crítica ao inicializar IndexedDB:', err);
  if (
    err.name === 'SchemaError' ||
    err.name === 'IncompatibleKeypathError' ||
    err.name === 'DatabaseClosedError' ||
    err.message?.includes('KeyPath') ||
    err.message?.includes('schema') ||
    err.message?.includes('closed')
  ) {
    console.warn('[OFFLINE DB] Incompatibilidade de esquema detectada. Deletando banco corrompido e recriando...');
    try {
      await Dexie.delete('MSSustentavelLocalDB');
      await db.open();
      console.log('[OFFLINE DB] Banco MSSustentavelLocalDB recriado e aberto com sucesso.');
      try {
        const defaultAudits = (defaultAuditoriasJson as any[]).map(a => {
          const propFound = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
          const propId = a.propriedade_id || propFound?.id;
          return {
            id: a.id,
            propriedade_id: propId,
            tecnico_responsavel_id: a.tecnico_responsavel_id,
            data_agendamento: a.data_agendamento,
            status: a.status || 'EM ANDAMENTO',
            etapa: a.etapa || 'Prospecção',
            ultima_alteracao_at: a.ultima_alteracao_at || a.updated_at || a.created_at,
            propriedades: propFound || { nome_fazenda: 'Fazenda', nome_produtor: 'Produtor' },
            created_at: a.created_at,
            updated_at: a.updated_at
          };
        });
        await db.cached_auditorias.bulkPut(defaultAudits);
        console.log(`[OFFLINE DB] ${defaultAudits.length} fazendas de contingência semeadas após auto-recuperação.`);
      } catch (seedErr) {
        console.warn('[OFFLINE DB] Erro ao semear auditorias após recriação:', seedErr);
      }
    } catch (delErr) {
      console.error('[OFFLINE DB] Erro fatal na auto-recuperação do Dexie:', delErr);
    }
  }
});

// Executa purga e consolidação de registros corrompidos/duplicados automaticamente na inicialização
db.on('ready', async () => {
  // 1. Garante que cached_auditorias tenha dados mestres em 0ms caso esteja vazia (Cold Start Offline)
  try {
    const audCount = await db.cached_auditorias.count();
    if (audCount === 0) {
      console.log('[OfflineDB] Inicializando tabela cached_auditorias com catálogo mestre local...');
      const defaultAudits = (defaultAuditoriasJson as any[]).map(a => {
        const propFound = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
        const propId = a.propriedade_id || propFound?.id;
        return {
          id: a.id,
          propriedade_id: propId,
          tecnico_responsavel_id: a.tecnico_responsavel_id,
          data_agendamento: a.data_agendamento,
          status: a.status || 'EM ANDAMENTO',
          etapa: a.etapa || 'Prospecção',
          ultima_alteracao_at: a.ultima_alteracao_at || a.updated_at || a.created_at,
          propriedades: propFound || { nome_fazenda: 'Fazenda', nome_produtor: 'Produtor' },
          created_at: a.created_at,
          updated_at: a.updated_at
        };
      });
      await db.cached_auditorias.bulkPut(defaultAudits);
      console.log(`[OfflineDB] ${defaultAudits.length} auditorias inseridas no Dexie em 0ms.`);
    }
  } catch (err) {
    console.warn('[OfflineDB] Erro ao semear cached_auditorias no startup:', err);
  }

  // 2. Limpeza isolada da fila legada (não afeta o seed de auditorias se falhar)
  try {
    await cleanupAndMigrateLegacyQueue();
  } catch (err) {
    console.warn('[OfflineDB] Erro na limpeza automática de startup:', err);
  }
});

// Helper: Gera UUID v4
export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Enfileira uma mutação com Coalescência Inteligente.
 */
export async function enqueueMutation(params: {
  table: string;
  action: MutationAction;
  payload: any;
  on_conflict?: string;
  match_key?: Record<string, any>;
  file_ids?: string[];
}): Promise<OutboxMutation> {
  const now = new Date().toISOString();

  // Coalescência inteligente para respostas_auditoria
  if (params.table === 'respostas_auditoria' && params.payload?.auditoria_id && params.payload?.pergunta_id) {
    const existing = await db.outbox_mutations
      .where('table')
      .equals('respostas_auditoria')
      .and(m => (m.status === 'pending' || m.status === 'pending_retry' || m.status === 'failed') &&
                 m.payload?.auditoria_id === params.payload.auditoria_id &&
                 m.payload?.pergunta_id === params.payload.pergunta_id)
      .first();

    const isRemovingEvidence = params.payload.evidencia_url === null;

    if (existing && existing.id) {
      const mergedPayload = { ...existing.payload, ...params.payload };

      let mergedFileIds: string[] = [];
      if (isRemovingEvidence) {
        // Exclusão local-first: expurga arquivos pendentes da outbox_files
        const filesToDelete = Array.from(new Set([...(existing.file_ids || []), ...(params.file_ids || [])]));
        if (filesToDelete.length > 0) {
          await db.outbox_files.bulkDelete(filesToDelete);
        }
        mergedFileIds = [];
        mergedPayload.evidencia_url = null;
      } else {
        mergedFileIds = params.file_ids && params.file_ids.length > 0
          ? params.file_ids
          : (existing.file_ids || []);
      }
      
      await db.outbox_mutations.update(existing.id, {
        payload: mergedPayload,
        file_ids: mergedFileIds,
        status: 'pending',
        attempts: 0,
        next_retry_at: undefined,
        last_error: undefined,
        updated_at: now
      });
      notifyOutboxChange();

      // Atualiza também o cached_respostas local imediatamente
      await db.cached_respostas.put({
        auditoria_id: params.payload.auditoria_id,
        pergunta_id: params.payload.pergunta_id,
        conforme: mergedPayload.conforme ?? null,
        observacoes: mergedPayload.observacoes || '',
        evidencia_url: mergedPayload.evidencia_url ?? null,
        updated_at: now
      });

      return {
        ...existing,
        payload: mergedPayload,
        file_ids: mergedFileIds,
        status: 'pending',
        updated_at: now
      };
    }

    if (isRemovingEvidence && params.file_ids && params.file_ids.length > 0) {
      await db.outbox_files.bulkDelete(params.file_ids);
      params.file_ids = [];
    }

    // Grava também no cached_respostas local imediatamente
    await db.cached_respostas.put({
      auditoria_id: params.payload.auditoria_id,
      pergunta_id: params.payload.pergunta_id,
      conforme: params.payload.conforme ?? null,
      observacoes: params.payload.observacoes || '',
      evidencia_url: params.payload.evidencia_url ?? null,
      updated_at: now
    });
  }

  // Coalescência para auditorias
  if (params.table === 'auditorias' && params.payload?.id && params.action === 'update') {
    const existing = await db.outbox_mutations
      .where('table')
      .equals('auditorias')
      .and(m => (m.status === 'pending' || m.status === 'failed') &&
                 m.action === 'update' &&
                 m.payload?.id === params.payload.id)
      .first();

    if (existing && existing.id) {
      const mergedPayload = { ...existing.payload, ...params.payload };
      await db.outbox_mutations.update(existing.id, {
        payload: mergedPayload,
        status: 'pending',
        updated_at: now
      });

      return {
        ...existing,
        payload: mergedPayload,
        status: 'pending',
        updated_at: now
      };
    }
  }

  const newMutation: OutboxMutation = {
    client_mutation_id: generateUUID(),
    table: params.table,
    action: params.action,
    payload: params.payload,
    on_conflict: params.on_conflict,
    match_key: params.match_key,
    file_ids: params.file_ids || [],
    status: 'pending',
    retry_count: 0,
    attempts: 0,
    created_at: now,
    updated_at: now
  };

  const id = await db.outbox_mutations.add(newMutation);
  newMutation.id = id;
  notifyOutboxChange();
  return newMutation;
}

/**
 * Enfileira um arquivo bruto (Blob/File) na fila outbox_files
 */
export async function enqueueFile(params: {
  blob: Blob | File;
  fileName: string;
  fileType: string;
  bucket: string;
  storagePath: string;
  clientMutationId?: string;
}): Promise<OutboxFile> {
  const newFile: OutboxFile = {
    id: generateUUID(),
    client_mutation_id: params.clientMutationId,
    file_blob: params.blob,
    file_name: params.fileName,
    file_type: params.fileType,
    file_size: params.blob.size,
    bucket: params.bucket,
    storage_path: params.storagePath,
    status: 'pending',
    attempts: 0,
    created_at: new Date().toISOString()
  };

  await db.outbox_files.add(newFile);
  notifyOutboxChange();
  return newFile;
}

/**
 * Exclusão Local-First Atômica de Evidência:
 * 1. Atualiza cached_respostas com evidencia_url = null
 * 2. Remove arquivos pendentes da outbox_files (por ID e por storage_path)
 * 3. Atualiza mutações pendentes para evidencia_url = null e file_ids = []
 * 4. Notifica ouvintes da outbox para atualizar a contagem na UI
 */
export async function removeEvidenceLocally(auditoriaId: string, perguntaId: string): Promise<void> {
  const now = new Date().toISOString();

  // 1. Atualizar cached_respostas imediatamente
  const existingCached = await db.cached_respostas.get([auditoriaId, perguntaId]);
  if (existingCached) {
    await db.cached_respostas.put({
      ...existingCached,
      evidencia_url: null,
      evidencia_uploaded_at: null,
      data_envio: null,
      updated_at: now
    });
  } else {
    await db.cached_respostas.put({
      auditoria_id: auditoriaId,
      pergunta_id: perguntaId,
      conforme: null,
      observacoes: '',
      evidencia_url: null,
      evidencia_uploaded_at: null,
      data_envio: null,
      updated_at: now
    });
  }

  // 2. Buscar mutações pendentes desta resposta e remover arquivos da outbox_files
  const pendingMutations = await db.outbox_mutations
    .where('table')
    .equals('respostas_auditoria')
    .and(m => m.payload?.auditoria_id === auditoriaId && m.payload?.pergunta_id === perguntaId)
    .toArray();

  for (const mut of pendingMutations) {
    if (mut.file_ids && mut.file_ids.length > 0) {
      await db.outbox_files.bulkDelete(mut.file_ids);
    }
    if (mut.id) {
      await db.outbox_mutations.update(mut.id, {
        payload: {
          ...mut.payload,
          evidencia_url: null
        },
        file_ids: [],
        status: 'pending',
        attempts: 0,
        next_retry_at: undefined,
        updated_at: now
      });
    }
  }

  // 3. Buscar arquivos em outbox_files pelo storage_path correspondente
  const matchingFiles = await db.outbox_files
    .filter(f => 
      f.storage_path.includes(auditoriaId + '/' + perguntaId + '_') || 
      f.storage_path.includes('temp/' + perguntaId + '_') ||
      f.storage_path.includes('/' + perguntaId + '_')
    )
    .toArray();

  if (matchingFiles.length > 0) {
    await db.outbox_files.bulkDelete(matchingFiles.map(f => f.id));
  }

  // 4. Limpar ou atualizar entradas pendentes no sync_journal via busca no índice composto
  try {
    const jItem = await db.sync_journal
      .where('[auditoria_id+pergunta_id]')
      .equals([auditoriaId, perguntaId])
      .first();
    if (jItem && jItem.id) {
      await db.sync_journal.update(jItem.id, {
        file_blob: undefined,
        file_name: undefined,
        mime_type: undefined,
        storage_path: undefined,
        evidencia_url: null,
        is_explicit_delete: true,
        updated_at: now
      });
    }
  } catch (jErr) {
    console.warn('[OfflineDB] Aviso ao limpar evidência do sync_journal:', jErr);
  }

  notifyOutboxChange();
}

/**
 * Zera flags de erro de autenticação e reabilita itens para envio imediato após novo login
 */
export async function resetAuthFailedQueueItems(): Promise<void> {
  try {
    const mutations = await db.outbox_mutations.toArray();
    for (const m of mutations) {
      if (
        m.id &&
        (m.error_type === 'auth_error' ||
         (m.status === 'failed_permanently' && m.error_message?.toLowerCase().includes('auth')) ||
         m.error_message?.toLowerCase().includes('sessão') ||
         m.error_message?.toLowerCase().includes('jwt'))
      ) {
        await db.outbox_mutations.update(m.id, {
          status: 'pending',
          attempts: 0,
          retry_count: 0,
          next_retry_at: undefined,
          error_type: undefined,
          error_message: undefined,
          updated_at: new Date().toISOString()
        });
      }
    }

    const files = await db.outbox_files.toArray();
    for (const f of files) {
      if (
        f.id &&
        (f.error_type === 'auth_error' ||
         (f.status === 'failed_permanently' && f.error_message?.toLowerCase().includes('auth')) ||
         f.error_message?.toLowerCase().includes('sessão') ||
         f.error_message?.toLowerCase().includes('jwt'))
      ) {
        await db.outbox_files.update(f.id, {
          status: 'pending',
          attempts: 0,
          next_retry_at: undefined,
          error_type: undefined,
          error_message: undefined
        });
      }
    }

    notifyOutboxChange();
  } catch (err) {
    console.warn('[OfflineDB] Erro ao resetar itens com falha de auth:', err);
  }
}

export async function getPendingMutations(): Promise<OutboxMutation[]> {
  // Itens ativos aguardando envio (itens failed_permanently são isolados na Dead-Letter Queue)
  const mutations = await db.outbox_mutations
    .filter(m => m.status === 'pending' || m.status === 'pending_retry')
    .toArray();

  const tablePriority: Record<string, number> = {
    perfis: 1,
    propriedades: 2,
    auditorias: 3,
    respostas_auditoria: 4,
    pendencias: 5
  };

  return mutations.sort((a, b) => {
    const prioA = tablePriority[a.table] || 99;
    const prioB = tablePriority[b.table] || 99;
    if (prioA !== prioB) return prioA - prioB;
    return (a.id || 0) - (b.id || 0);
  });
}

export async function getPendingFiles(): Promise<OutboxFile[]> {
  // Arquivos ativos aguardando envio (inclui uploaded_pending_db que aguarda confirmação com o Postgres)
  return await db.outbox_files
    .filter(f => f.status === 'pending' || f.status === 'uploaded_pending_db' || f.status === 'pending_retry')
    .toArray();
}

export async function getPendingCounts(): Promise<{ total: number; mutations: number; files: number; journal: number; deadLetter: number }> {
  try {
    const [rawJournalPending, rawJournalFailed, rawMutations, rawFiles, dlMutations, dlFiles] = await Promise.all([
      db.sync_journal.where('status').anyOf(['pending', 'syncing']).toArray(),
      db.sync_journal.where('status').equals('failed').toArray(),
      db.outbox_mutations.filter(m => m.status === 'pending' || m.status === 'pending_retry' || m.status === 'failed' || m.status === 'failed_permanently').toArray(),
      db.outbox_files.filter(f => f.status === 'pending' || f.status === 'uploading' || f.status === 'pending_retry' || f.status === 'failed' || f.status === 'failed_permanently').toArray(),
      db.outbox_mutations.filter(m => m.status === 'failed_permanently').count(),
      db.outbox_files.filter(f => f.status === 'failed_permanently').count()
    ]);

    // Cada item no sync_journal representa uma ação atômica de sincronização (pergunta + foto)
    const journalKeySet = new Set<string>();
    rawJournalPending.forEach(j => {
      const k = `${j.auditoria_id}_${normalizePerguntaId(j.pergunta_id)}`;
      journalKeySet.add(k);
    });
    rawJournalFailed.forEach(j => {
      const k = `${j.auditoria_id}_${normalizePerguntaId(j.pergunta_id)}`;
      journalKeySet.add(k);
    });
    const journalCount = journalKeySet.size;

    // Mutações independentes: mutações que NÃO sejam de respostas_auditoria já contabilizadas no sync_journal
    const independentMutations = rawMutations.filter(m => {
      if (m.table === 'respostas_auditoria' && m.payload?.auditoria_id && m.payload?.pergunta_id) {
        const k = `${m.payload.auditoria_id}_${normalizePerguntaId(m.payload.pergunta_id)}`;
        if (journalKeySet.has(k)) return false; // Já contabilizado no journal!
      }
      return true;
    });

    // Arquivos independentes: arquivos que NÃO estão vinculados a nenhuma mutação pendente ou journal
    const pendingFileIdsInMutations = new Set<string>();
    independentMutations.forEach(m => {
      if (m.file_ids && Array.isArray(m.file_ids)) {
        m.file_ids.forEach(fid => pendingFileIdsInMutations.add(String(fid)));
      }
    });

    const independentFiles = rawFiles.filter(f => {
      if (pendingFileIdsInMutations.has(String(f.id))) return false;
      const match = (f.storage_path || f.file_name || '').match(/evidencia_([0-9a-fA-F-]+)_([0-9a-fA-F-]+)/);
      if (match) {
        const k = `${match[1]}_${normalizePerguntaId(match[2])}`;
        if (journalKeySet.has(k)) return false;
      }
      return true;
    });

    const total = journalCount + independentMutations.length + independentFiles.length;
    const deadLetter = dlMutations + dlFiles + rawJournalFailed.length;

    return {
      total,
      mutations: independentMutations.length,
      files: independentFiles.length,
      journal: journalCount,
      deadLetter
    };
  } catch (err) {
    console.warn('[OfflineDB] Erro ao contar pendências:', err);
    return { total: 0, mutations: 0, files: 0, journal: 0, deadLetter: 0 };
  }
}

/**
 * Retorna o conjunto de chaves `${auditoria_id}_${canonicalPerguntaId}` de evidências
 * que estão GENUINAMENTE pendentes de envio (esperando na fila local de sync: sync_journal ou outbox).
 */
export async function getPendingEvidenceKeys(): Promise<Set<string>> {
  try {
    const [rawJournalPending, rawJournalFailed, rawMutations, rawFiles] = await Promise.all([
      db.sync_journal.where('status').anyOf(['pending', 'syncing']).toArray(),
      db.sync_journal.where('status').equals('failed').toArray(),
      db.outbox_mutations.filter(m => m.status === 'pending' || m.status === 'pending_retry' || m.status === 'syncing').toArray(),
      db.outbox_files.filter(f => f.status === 'pending' || f.status === 'uploading' || f.status === 'pending_retry').toArray()
    ]);

    const pendingKeys = new Set<string>();

    // 1. sync_journal (ações atômicas de auditoria com foto/alteração pendente)
    [...rawJournalPending, ...rawJournalFailed].forEach(j => {
      if (j.is_explicit_delete || j.evidencia_url === null) return;
      if (!j.file_blob && !j.evidencia_url) return;
      if (j.auditoria_id && j.pergunta_id) {
        pendingKeys.add(`${j.auditoria_id}_${normalizePerguntaId(j.pergunta_id)}`);
      }
    });

    // 2. outbox_mutations (mutações diretas em respostas_auditoria)
    const fileIdToMutationMap = new Map<string, any>();
    rawMutations.forEach(m => {
      if (m.payload?.is_explicit_delete || m.payload?.evidencia_url === null) return;
      if (m.table === 'respostas_auditoria' && m.payload?.auditoria_id && m.payload?.pergunta_id) {
        if (m.payload.evidencia_url || (m.file_ids && m.file_ids.length > 0)) {
          pendingKeys.add(`${m.payload.auditoria_id}_${normalizePerguntaId(m.payload.pergunta_id)}`);
        }
      }
      if (m.file_ids && Array.isArray(m.file_ids)) {
        m.file_ids.forEach((fid: any) => fileIdToMutationMap.set(String(fid), m));
      }
    });

    // 3. outbox_files (arquivos pendentes de upload)
    rawFiles.forEach(f => {
      const mut = fileIdToMutationMap.get(String(f.id));
      let auditId = mut?.payload?.auditoria_id;
      let perguntaId = mut?.payload?.pergunta_id;
      if (!auditId || !perguntaId) {
        const match = (f.storage_path || f.file_name || '').match(/evidencia_([0-9a-fA-F-]+)_([0-9a-fA-F-]+)/);
        if (match) {
          auditId = auditId || match[1];
          perguntaId = perguntaId || match[2];
        }
      }
      if (auditId && perguntaId) {
        pendingKeys.add(`${auditId}_${normalizePerguntaId(perguntaId)}`);
      }
    });

    return pendingKeys;
  } catch (err) {
    console.warn('[OfflineDB] Erro ao obter chaves de evidências pendentes:', err);
    return new Set<string>();
  }
}

/**
 * Auto-limpeza de itens que já foram sincronizados ou que ficaram órfãos na outbox
 */
export async function purgeOrphanAndSyncedItems(): Promise<void> {
  try {
    const cachedWithRemote = await db.cached_respostas.filter(r => !!r.evidencia_url && String(r.evidencia_url).startsWith('http')).toArray();
    for (const c of cachedWithRemote) {
      const canonId = normalizePerguntaId(c.pergunta_id);
      const staleMuts = await db.outbox_mutations.filter(m =>
        m.table === 'respostas_auditoria' &&
        m.payload?.auditoria_id === c.auditoria_id &&
        normalizePerguntaId(m.payload?.pergunta_id) === canonId
      ).toArray();
      for (const sm of staleMuts) {
        if (sm.id) await db.outbox_mutations.delete(sm.id);
        if (sm.file_ids && Array.isArray(sm.file_ids)) {
          for (const fid of sm.file_ids) {
            await db.outbox_files.delete(fid);
          }
        }
      }
      // REGRA DE SEGURANÇA: db.sync_journal NUNCA é expurgado antes da confirmação do Postgres
      // Apenas itens órfãos legados da outbox_mutations/files são limpos.
    }
  } catch (err) {
    console.warn('[OfflineDB] Aviso ao auto-limpar itens órfãos/sincronizados:', err);
  }
}

export async function getEligibleMutations(forceAll = false): Promise<OutboxMutation[]> {
  if (forceAll) {
    const allMuts = await db.outbox_mutations
      .filter(m => m.status === 'pending' || m.status === 'pending_retry' || m.status === 'failed' || m.status === 'failed_permanently' || m.status === 'syncing')
      .toArray();
    const tablePriority: Record<string, number> = {
      perfis: 1,
      propriedades: 2,
      auditorias: 3,
      respostas_auditoria: 4,
      pendencias: 5
    };
    return allMuts.sort((a, b) => {
      const prioA = tablePriority[a.table] || 99;
      const prioB = tablePriority[b.table] || 99;
      if (prioA !== prioB) return prioA - prioB;
      return (a.id || 0) - (b.id || 0);
    });
  }
  const now = Date.now();
  const pending = await getPendingMutations();
  // Filtra estritamente itens que já atingiram o tempo do backoff
  return pending.filter(m => m.status === 'pending' || (m.next_retry_at && new Date(m.next_retry_at).getTime() <= now));
}

export async function getEligibleFiles(forceAll = false): Promise<OutboxFile[]> {
  if (forceAll) {
    return await db.outbox_files
      .filter(f => f.status === 'pending' || f.status === 'uploaded_pending_db' || f.status === 'pending_retry' || f.status === 'failed' || f.status === 'failed_permanently' || f.status === 'uploading')
      .toArray();
  }
  const now = Date.now();
  const pending = await getPendingFiles();
  return pending.filter(f => f.status === 'pending' || (f.next_retry_at && new Date(f.next_retry_at).getTime() <= now));
}

export async function rehabilitateFailedQueueForRetry(): Promise<number> {
  let rehabilitated = 0;
  const nowIso = new Date().toISOString();

  try {
    const jItems = await db.sync_journal.toArray();
    for (const item of jItems) {
      if (!item.auditoria_id || !item.pergunta_id || item.auditoria_id === 'undefined' || item.pergunta_id === 'undefined') {
        if (item.id) await db.sync_journal.delete(item.id);
        continue;
      }
      if ((item.status === 'failed' || item.status === 'syncing') && item.id) {
        await db.sync_journal.update(item.id, {
          status: 'pending',
          last_error: undefined,
          updated_at: nowIso
        });
        rehabilitated++;
      }
    }
  } catch (e) {
    console.warn('[OfflineDB] Aviso ao reabilitar sync_journal:', e);
  }

  try {
    const muts = await db.outbox_mutations.toArray();
    for (const m of muts) {
      if (!m.id) continue;
      const isCorrupt = !m.payload || typeof m.payload !== 'object' || Object.keys(m.payload).length === 0;
      const isOrphan = m.table === 'respostas_auditoria' && (!m.payload?.auditoria_id || !m.payload?.pergunta_id || m.payload?.pergunta_id === 'undefined');
      if (isCorrupt || isOrphan) {
        await db.outbox_mutations.delete(m.id);
        continue;
      }
      if (m.status === 'failed' || m.status === 'failed_permanently' || m.status === 'pending_retry' || m.status === 'syncing') {
        const fixedPayload = { ...m.payload };
        if (m.table === 'respostas_auditoria') {
          if (fixedPayload.conforme === null || fixedPayload.conforme === undefined) {
            fixedPayload.conforme = false;
          }
          if (fixedPayload.pergunta_id) {
            fixedPayload.pergunta_id = normalizePerguntaId(fixedPayload.pergunta_id);
          }
        }
        await db.outbox_mutations.update(m.id, {
          payload: fixedPayload,
          status: 'pending',
          attempts: 0,
          retry_count: 0,
          next_retry_at: undefined,
          last_error: undefined,
          error_message: undefined,
          error_code: undefined,
          error_type: undefined,
          updated_at: nowIso
        });
        rehabilitated++;
      }
    }
  } catch (e) {
    console.warn('[OfflineDB] Aviso ao reabilitar outbox_mutations:', e);
  }

  try {
    const files = await db.outbox_files.toArray();
    for (const f of files) {
      if (!f.file_blob || (f.file_blob as any).size === 0) {
        await db.outbox_files.delete(f.id);
        continue;
      }
      if (f.status === 'failed' || f.status === 'failed_permanently' || f.status === 'pending_retry' || f.status === 'uploading') {
        await db.outbox_files.update(f.id, {
          status: f.public_url ? 'uploaded_pending_db' : 'pending',
          attempts: 0,
          next_retry_at: undefined,
          last_error: undefined,
          error_message: undefined,
          error_code: undefined,
          error_type: undefined
        });
        rehabilitated++;
      }
    }
  } catch (e) {
    console.warn('[OfflineDB] Aviso ao reabilitar outbox_files:', e);
  }

  if (rehabilitated > 0) {
    notifyOutboxChange();
  }
  return rehabilitated;
}

export async function markMutationRetry(
  id: number,
  attempts: number,
  nextRetryAt: string,
  errorType: OutboxErrorType = 'network_timeout',
  errorMessage?: string
) {
  await db.outbox_mutations.update(id, {
    status: 'pending_retry',
    attempts,
    retry_count: attempts,
    last_attempt_at: new Date().toISOString(),
    next_retry_at: nextRetryAt,
    error_type: errorType,
    ...(errorMessage ? { error_message: errorMessage } : {}),
    updated_at: new Date().toISOString()
  });
  notifyOutboxChange();
}

export async function markFileRetry(
  id: string,
  attempts: number,
  nextRetryAt: string,
  errorType: OutboxErrorType = 'network_timeout',
  errorMessage?: string
) {
  await db.outbox_files.update(id, {
    status: 'pending_retry',
    attempts,
    last_attempt_at: new Date().toISOString(),
    next_retry_at: nextRetryAt,
    error_type: errorType,
    ...(errorMessage ? { error_message: errorMessage } : {})
  });
  notifyOutboxChange();
}

export async function markMutationStatus(id: number, status: MutationStatus, errorMessage?: string) {
  await db.outbox_mutations.update(id, {
    status,
    ...(errorMessage ? { error_message: errorMessage } : {}),
    updated_at: new Date().toISOString()
  });
}

export async function markFileStatus(id: string, status: FileStatus, publicUrl?: string, errorMessage?: string) {
  await db.outbox_files.update(id, {
    status,
    ...(publicUrl ? { public_url: publicUrl } : {}),
    ...(errorMessage ? { error_message: errorMessage } : {})
  });
}

export async function removeMutation(id: number) {
  await db.outbox_mutations.delete(id);
  notifyOutboxChange();
}

export async function removeFile(id: string) {
  await db.outbox_files.delete(id);
  notifyOutboxChange();
}

// -------------------------------------------------------------
// MÉTODOS DE CACHE DE LEITURA (READ-THROUGH CACHE / BULK METHODS)
// -------------------------------------------------------------

export async function bulkSavePerguntas(perguntas: CachedPergunta[]) {
  if (!perguntas || perguntas.length === 0) return;
  await db.cached_perguntas.bulkPut(perguntas);
}

export async function getAllCachedPerguntas(): Promise<CachedPergunta[]> {
  return await db.cached_perguntas.orderBy('ordem').toArray();
}

export async function bulkSaveAuditorias(auditorias: CachedAuditoria[]) {
  if (!auditorias || auditorias.length === 0) return;
  await db.cached_auditorias.bulkPut(auditorias);
}

export async function getCachedAuditorias(tecnicoId?: string): Promise<CachedAuditoria[]> {
  if (tecnicoId) {
    const list = await db.cached_auditorias
      .where('tecnico_responsavel_id')
      .equals(tecnicoId)
      .toArray();
    if (list && list.length > 0) {
      return list;
    }
  }
  return await db.cached_auditorias.toArray();
}

export async function bulkSaveRespostas(respostas: CachedResposta[]) {
  if (!respostas || respostas.length === 0) return;
  await db.cached_respostas.bulkPut(respostas);
}

export async function getCachedRespostasByAuditoria(auditoriaId: string): Promise<CachedResposta[]> {
  return await db.cached_respostas
    .where('auditoria_id')
    .equals(auditoriaId)
    .toArray();
}

export async function bulkSavePendencias(pendencias: CachedPendencia[]) {
  if (!pendencias || pendencias.length === 0) return;
  await db.cached_pendencias.bulkPut(pendencias);
}

export async function getCachedPendenciasByPropriedade(propriedadeId: string): Promise<CachedPendencia[]> {
  return await db.cached_pendencias
    .where('propriedade_id')
    .equals(propriedadeId)
    .toArray();
}

export async function saveAppMetadata(key: string, value: any) {
  await db.app_metadata.put({
    key,
    value,
    updated_at: new Date().toISOString()
  });
}

export async function getAppMetadata<T = any>(key: string): Promise<T | null> {
  const item = await db.app_metadata.get(key);
  return item ? (item.value as T) : null;
}

// Retrocompatibilidade com read_cache genérico
export async function cacheReadData(key: string, data: any) {
  try {
    await db.read_cache.put({
      key,
      data,
      updated_at: new Date().toISOString()
    });
  } catch (e) {
    console.warn('[Cache] Erro ao gravar cache local para ' + key, e);
  }
}

export async function getCachedReadData<T = any>(key: string): Promise<T | null> {
  try {
    const item = await db.read_cache.get(key);
    return item ? (item.data as T) : null;
  } catch (e) {
    console.warn('[Cache] Erro ao obter cache local para ' + key, e);
    return null;
  }
}

// -------------------------------------------------------------
// ORDENAÇÃO DETERMINÍSTICA E REATIVIDADE (SINGLE SOURCE OF TRUTH)
// -------------------------------------------------------------

/**
 * Regra de ordenação determinística estrita para auditorias:
 * 1. Data de agendamento ou última alteração decrescente (mais recente PRIMEIRO)
 * 2. Desempate absoluto e imutável pelo ID alfanumérico
 */
export function compareAuditoriasDeterministically(a: any, b: any): number {
  const getTimestamp = (item: any): number => {
    // Prioridade máxima estrita: carimbo da última alteração real
    const raw = item?.ultima_alteracao_at || item?.updated_at || item?.created_at || item?.data_agendamento || 0;
    const time = new Date(raw).getTime();
    return isNaN(time) ? 0 : time;
  };

  const timeA = getTimestamp(a);
  const timeB = getTimestamp(b);

  if (timeB !== timeA) {
    return timeB - timeA; // Mais recente (maior timestamp numérico) sempre no topo!
  }

  return (a?.id || '').localeCompare(b?.id || '');
}

/**
 * Hook reativo universal baseado no liveQuery nativo do Dexie 4.
 * Garante reatividade 0ms no React 19 sempre que a tabela for alterada.
 */
export function useLiveDexieQuery<T>(querier: () => Promise<T> | T, deps: any[] = [], initialValue: T): T {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    let isMounted = true;
    const observable = liveQuery(querier);
    const subscription = observable.subscribe({
      next: (val) => {
        if (isMounted) setValue(val);
      },
      error: (err) => {
        console.error('[Dexie liveQuery Error]', err);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, deps);

  return value;
}

/**
 * Hook reativo que entrega as auditorias EXCLUSIVAMENTE a partir do banco local Dexie.
 * Mantém a ordenação determinística constante, impedindo qualquer disputa concorrente de estado.
 */
export function getDefaultAuditoriasSeed(): CachedAuditoria[] {
  return (defaultAuditoriasJson as any[]).map(a => {
    const propFound = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
    const propId = a.propriedade_id || propFound?.id;
    return {
      id: a.id,
      propriedade_id: propId,
      tecnico_responsavel_id: a.tecnico_responsavel_id,
      data_agendamento: a.data_agendamento,
      status: a.status || 'EM ANDAMENTO',
      etapa: a.etapa || 'Prospecção',
      ultima_alteracao_at: a.ultima_alteracao_at || a.updated_at || a.created_at || new Date().toISOString(),
      propriedades: propFound || { nome_fazenda: 'Fazenda', nome_produtor: 'Produtor' },
      created_at: a.created_at || new Date().toISOString(),
      updated_at: a.updated_at || new Date().toISOString()
    };
  });
}

export function useLiveAuditorias(filterFn?: (a: CachedAuditoria) => boolean): CachedAuditoria[] {
  const defaultList = getDefaultAuditoriasSeed();
  return useLiveDexieQuery(async () => {
    const list = await db.cached_auditorias.toArray();
    const effectiveList = list && list.length > 0 ? list : defaultList;
    const sorted = [...effectiveList].sort(compareAuditoriasDeterministically);
    if (filterFn) {
      return sorted.filter(filterFn);
    }
    return sorted;
  }, [filterFn], defaultList);
}

/**
 * Atualiza um registro pontual no cache local Dexie (propagando reatividade instantânea)
 */
export async function updateCachedAuditoria(id: string, changes: Partial<CachedAuditoria>) {
  await db.cached_auditorias.update(id, {
    ...changes,
    updated_at: new Date().toISOString()
  });
}

// -------------------------------------------------------------
// DEAD-LETTER QUEUE (DLQ) E HIGIENIZAÇÃO DE FILA CORROMPIDA
// -------------------------------------------------------------

/**
 * Isola uma mutação com erro permanente de validação, RLS ou Foreign Key na Dead-Letter Queue.
 * Elimina o Head-of-Line Blocking e impede loops infinitos de retentativa.
 */
export async function markMutationDeadLetter(
  id: number,
  errorMessage: string,
  errorCode?: string | number
) {
  await db.outbox_mutations.update(id, {
    status: 'failed_permanently',
    last_error: errorMessage,
    error_message: errorMessage,
    error_code: errorCode,
    error_type: 'payload_error',
    updated_at: new Date().toISOString()
  });
  notifyOutboxChange();
}

/**
 * Isola um arquivo com erro permanente de storage ou RLS na Dead-Letter Queue.
 */
export async function markFileDeadLetter(
  id: string,
  errorMessage: string,
  errorCode?: string | number
) {
  await db.outbox_files.update(id, {
    status: 'failed_permanently',
    last_error: errorMessage,
    error_message: errorMessage,
    error_code: errorCode,
    error_type: 'payload_error'
  });
  notifyOutboxChange();
}

/**
 * Retorna todos os itens isolados na Dead-Letter Queue para auditoria na UI
 */
export async function getDeadLetterItems(): Promise<{
  mutations: OutboxMutation[];
  files: OutboxFile[];
  total: number;
}> {
  const [mutations, files] = await Promise.all([
    db.outbox_mutations.filter(m => m.status === 'failed_permanently' || m.status === 'failed').toArray(),
    db.outbox_files.filter(f => f.status === 'failed_permanently' || f.status === 'failed').toArray()
  ]);
  return {
    mutations,
    files,
    total: mutations.length + files.length
  };
}

/**
 * Higieniza e remove registros corrompidos ou descartados do IndexedDB:
 * 1. Mutações sem payload ou com payload vazio/inválido
 * 2. Arquivos sem blob ou com tamanho zero
 * 3. Itens marcados permanentemente com falha (DLQ)
 */
export async function purgeCorruptedQueue(): Promise<{
  purgedJournal: number;
  purgedMutations: number;
  purgedFiles: number;
}> {
  let purgedJournal = 0;
  let purgedMutations = 0;
  let purgedFiles = 0;

  try {
    // 1. Limpa registros com erro do sync_journal e itens órfãos
    const allJournal = await db.sync_journal.toArray();
    for (const item of allJournal) {
      const isFailed = item.status === 'failed';
      const isOrphan = !item.auditoria_id || !item.pergunta_id || item.pergunta_id === 'undefined';
      if ((isFailed || isOrphan) && item.id) {
        try {
          await db.sync_journal.delete(item.id);
          purgedJournal++;
        } catch {}
      }
    }
  } catch (jErr) {
    console.warn('[OfflineDB] Erro ao purgar sync_journal:', jErr);
  }

  try {
    // 2. Limpa mutações com erro ou órfãs
    const allMutations = await db.outbox_mutations.toArray();
    for (const m of allMutations) {
      const isCorrupt = !m.payload || typeof m.payload !== 'object' || Object.keys(m.payload).length === 0;
      const isDeadLetter = m.status === 'failed_permanently' || m.status === 'failed';
      const isOrphan = m.table === 'respostas_auditoria' && (!m.payload?.pergunta_id || !m.payload?.auditoria_id || m.payload?.pergunta_id === 'undefined');
      if ((isCorrupt || isDeadLetter || isOrphan) && m.id) {
        await db.outbox_mutations.delete(m.id);
        purgedMutations++;
      }
    }
  } catch (mErr) {
    console.warn('[OfflineDB] Erro ao purgar outbox_mutations:', mErr);
  }

  try {
    // 3. Limpa arquivos inválidos ou com erro
    const allFiles = await db.outbox_files.toArray();
    for (const f of allFiles) {
      const isCorrupt = !f.file_blob || f.file_size === 0;
      const isDeadLetter = f.status === 'failed_permanently' || f.status === 'failed';
      if (isCorrupt || isDeadLetter) {
        await db.outbox_files.delete(f.id);
        purgedFiles++;
      }
    }
  } catch (fErr) {
    console.warn('[OfflineDB] Erro ao purgar outbox_files:', fErr);
  }

  notifyOutboxChange();
  console.log(`[OfflineDB] Purge concluído: ${purgedJournal} do journal, ${purgedMutations} mutações e ${purgedFiles} arquivos removidos.`);
  return { purgedJournal, purgedMutations, purgedFiles };
}

/**
 * Rotina de inicialização: limpa lixo acumulado e deduplica registros legados
 */
export async function cleanupAndMigrateLegacyQueue(): Promise<{
  cleanedMutations: number;
  deduplicatedJournal: number;
}> {
  let cleanedMutations = 0;
  let deduplicatedJournal = 0;

  try {
    // 1. Limpar e deduplicar mutações legadas da outbox_mutations
    const mutations = await db.outbox_mutations.toArray();
    const seenMutKeys = new Map<string, number>();
    const mutsToDelete: number[] = [];

    // Mais recente primeiro
    mutations.sort((a, b) => new Date(b.updated_at || b.created_at || 0).getTime() - new Date(a.updated_at || a.created_at || 0).getTime());

    for (const m of mutations) {
      if (!m.id) continue;
      if (m.status === 'failed_permanently' || m.status === 'failed' || !m.payload) {
        mutsToDelete.push(m.id);
        cleanedMutations++;
        continue;
      }
      if (m.table === 'respostas_auditoria') {
        let pId = m.payload?.pergunta_id;
        const aId = m.payload?.auditoria_id;
        if (!pId || !aId || pId === 'undefined' || aId === 'undefined') {
          mutsToDelete.push(m.id);
          cleanedMutations++;
          continue;
        }
        // Migra pergunta_id legado para UUID real
        const canonId = normalizePerguntaId(pId);
        if (canonId && canonId !== pId) {
          m.payload.pergunta_id = canonId;
          pId = canonId;
          await db.outbox_mutations.update(m.id, { payload: m.payload });
        }
        const key = `${aId}_${pId}`;
        if (seenMutKeys.has(key)) {
          mutsToDelete.push(m.id);
          cleanedMutations++;
        } else {
          seenMutKeys.set(key, m.id);
        }
      }
    }

    if (mutsToDelete.length > 0) {
      await db.outbox_mutations.bulkDelete(mutsToDelete);
    }

    // 2. Limpar itens órfãos e migrar chaves sintéticas do sync_journal
    const journalItems = await db.sync_journal.toArray();
    for (const item of journalItems) {
      if (!item.auditoria_id || !item.pergunta_id || item.pergunta_id === 'undefined' || item.auditoria_id === 'undefined') {
        if (item.id) {
          try {
            await db.sync_journal.delete(item.id);
            deduplicatedJournal++;
          } catch {}
        }
        continue;
      }

      // Migração de chaves sintéticas no sync_journal para UUIDs de produção
      const canonId = normalizePerguntaId(item.pergunta_id);
      if (canonId && canonId !== item.pergunta_id && item.id) {
        try {
          await db.sync_journal.update(item.id, {
            pergunta_id: canonId,
            updated_at: new Date().toISOString()
          });
          deduplicatedJournal++;
        } catch {}
      }

      // Descarte de file_blob corrompido ou vazio (0 bytes)
      if (item.file_blob && (item.file_blob as any).size === 0) {
        item.file_blob = undefined;
        await db.sync_journal.put(item);
      }
    }

    // 3. Limpar arquivos órfãos de outbox_files que já subiram ao Storage e não possuem mutação pendente
    const outboxFiles = await db.outbox_files.toArray();
    let cleanedFiles = 0;
    for (const f of outboxFiles) {
      if (f.status === 'uploaded_pending_db') {
        const hasActiveMutation = mutations.some(m => m.file_ids && m.file_ids.includes(f.id));
        if (!hasActiveMutation) {
          await db.outbox_files.delete(f.id);
          cleanedFiles++;
        }
      }
    }

    if (cleanedMutations > 0 || deduplicatedJournal > 0 || cleanedFiles > 0) {
      notifyOutboxChange();
      console.log(`[OfflineDB] Startup: ${cleanedMutations} mutações, ${deduplicatedJournal} itens do journal e ${cleanedFiles} arquivos órfãos consolidados.`);
    }
  } catch (err) {
    console.warn('[OfflineDB] Erro na rotina de startup:', err);
  }

  return { cleanedMutations, deduplicatedJournal };
}

/**
 * Recoloca um item da Dead-Letter Queue de volta na fila ativa para nova tentativa
 */
export async function reprocessDeadLetterItem(type: 'mutation' | 'file', id: number | string) {
  if (type === 'mutation' && typeof id === 'number') {
    await db.outbox_mutations.update(id, {
      status: 'pending',
      attempts: 0,
      next_retry_at: undefined,
      last_error: undefined,
      error_message: undefined,
      updated_at: new Date().toISOString()
    });
  } else if (type === 'file' && typeof id === 'string') {
    await db.outbox_files.update(id, {
      status: 'pending',
      attempts: 0,
      next_retry_at: undefined,
      last_error: undefined,
      error_message: undefined
    });
  }
  notifyOutboxChange();
}

/**
 * Resgata mutações presas na DLQ com erro 23502 (conforme NOT NULL) ou similares,
 * sanitizando o campo conforme para false e reabilitando-as para 'pending'.
 */
export async function rescueNotnullFailedMutations(): Promise<number> {
  let rescued = 0;
  try {
    const mutations = await db.outbox_mutations.toArray();
    for (const m of mutations) {
      const errStr = `${m.error_code || ''} ${m.last_error || ''} ${m.error_message || ''}`.toLowerCase();
      const is23502 = errStr.includes('23502') || errStr.includes('not-null') || errStr.includes('conforme');

      if (m.id && is23502) {
        const fixedPayload = { ...(m.payload || {}) };
        if (fixedPayload.conforme === null || fixedPayload.conforme === undefined) {
          fixedPayload.conforme = false;
        }
        await db.outbox_mutations.update(m.id, {
          payload: fixedPayload,
          status: 'pending',
          attempts: 0,
          retry_count: 0,
          next_retry_at: undefined,
          error_code: undefined,
          error_type: undefined,
          error_message: undefined,
          last_error: undefined,
          updated_at: new Date().toISOString()
        });
        rescued++;
      }
    }
    if (rescued > 0) {
      notifyOutboxChange();
      console.log(`[OfflineDB] Resgate DLQ: ${rescued} mutação(ões) com erro 23502 foram sanitizadas e reabilitadas.`);
    }
  } catch (err) {
    console.warn('[OfflineDB] Erro ao resgatar mutações 23502:', err);
  }
  return rescued;
}


/**
 * Função Única de Gravação Atômica (Unified WAL / Journal Atômico):
 * Ao anexar foto ou alterar critério, grava atomicamente tanto em db.cached_respostas
 * (para renderização imediata na UI) quanto em db.sync_journal (para sincronização).
 * REGRA DE OURO: O file_blob NUNCA é removido do dispositivo antes da confirmação total de sucesso do banco remoto.
 */
export async function recordAuditChange(item: SyncJournalItem): Promise<void> {
  const canonicalPerguntaId = normalizePerguntaId(item.pergunta_id);
  const safeConforme = item.conforme ?? false;
  const nowIso = item.updated_at || new Date().toISOString();
  const created = item.created_at || Date.now();

  // Blindagem contra blobs vazios (0 bytes)
  let safeBlob = item.file_blob;
  if (safeBlob && (safeBlob as any).size === 0) {
    console.warn(`[OfflineDB] Descartando blob vazio (0 bytes) para ${item.auditoria_id}/${canonicalPerguntaId}`);
    safeBlob = undefined;
  }

  await db.transaction('rw', [db.cached_respostas, db.sync_journal], async () => {
    // Se a chave antiga no item era sintética, limpa os registros antigos da chave anterior
    if (item.pergunta_id !== canonicalPerguntaId) {
      try {
        await db.cached_respostas.delete([item.auditoria_id, item.pergunta_id]);
        const oldJ = await db.sync_journal
          .where('[auditoria_id+pergunta_id]')
          .equals([item.auditoria_id, item.pergunta_id])
          .first();
        if (oldJ && oldJ.id) {
          await db.sync_journal.delete(oldJ.id);
        }
      } catch {}
    }

    // 1. Obter resposta existente no cache local para preservar campos se não informados
    const existingCached = await db.cached_respostas.get([item.auditoria_id, canonicalPerguntaId]);

    let finalEvidenciaUrl: string | null = null;
    let finalUploadedAt: string | null = null;

    const isExplicitDel = !!(item.is_explicit_delete || (item.evidencia_url === null && (item.is_explicit_delete || !existingCached?.evidencia_url)));

    if (safeBlob) {
      try {
        finalEvidenciaUrl = item.evidencia_url || URL.createObjectURL(safeBlob);
      } catch {
        finalEvidenciaUrl = item.evidencia_url || null;
      }
      finalUploadedAt = nowIso;
    } else if (item.evidencia_url === null && (item.is_explicit_delete || !existingCached?.evidencia_url)) {
      // Exclusão de evidência solicitada explicitamente
      finalEvidenciaUrl = null;
      finalUploadedAt = null;
    } else if (item.evidencia_url) {
      finalEvidenciaUrl = item.evidencia_url;
      finalUploadedAt = existingCached?.evidencia_uploaded_at || nowIso;
    } else {
      // Preserva a evidência existente se o item não tiver nova foto nem intenção expressa de deleção
      finalEvidenciaUrl = existingCached?.evidencia_url || null;
      finalUploadedAt = existingCached?.evidencia_uploaded_at || (finalEvidenciaUrl ? nowIso : null);
    }

    const safeNaoSeAplica = item.nao_se_aplica !== undefined ? item.nao_se_aplica : (existingCached?.nao_se_aplica || false);

    // 2. Gravação imediata em db.cached_respostas (Single Source of Truth para a UI)
    await db.cached_respostas.put({
      auditoria_id: item.auditoria_id,
      pergunta_id: canonicalPerguntaId,
      conforme: safeConforme,
      nao_se_aplica: safeNaoSeAplica,
      observacoes: item.observacoes !== undefined ? item.observacoes : (existingCached?.observacoes || ''),
      evidencia_url: finalEvidenciaUrl,
      numero_criterio: item.numero_criterio || existingCached?.numero_criterio,
      updated_at: nowIso,
      evidencia_uploaded_at: finalUploadedAt,
      data_envio: finalEvidenciaUrl ? (finalUploadedAt || nowIso) : null
    });

    // 3. Upsert Estrito e Idempotente em db.sync_journal via busca no índice composto
    const existingJournal = await db.sync_journal
      .where('[auditoria_id+pergunta_id]')
      .equals([item.auditoria_id, canonicalPerguntaId])
      .first();

    const journalEntry: SyncJournalItem = {
      id: existingJournal?.id, // Preserva ID numérico se já existir
      auditoria_id: item.auditoria_id,
      pergunta_id: canonicalPerguntaId,
      conforme: safeConforme,
      nao_se_aplica: safeNaoSeAplica,
      observacoes: item.observacoes !== undefined ? item.observacoes : (existingJournal?.observacoes || ''),
      file_blob: safeBlob || (item.evidencia_url === null ? undefined : existingJournal?.file_blob),
      file_name: item.file_name || (item.evidencia_url === null ? undefined : existingJournal?.file_name),
      mime_type: item.mime_type || (item.evidencia_url === null ? undefined : existingJournal?.mime_type),
      storage_path: item.storage_path || (item.evidencia_url === null ? undefined : existingJournal?.storage_path),
      evidencia_url: finalEvidenciaUrl,
      is_explicit_delete: isExplicitDel,
      numero_criterio: item.numero_criterio || existingCached?.numero_criterio,
      status: 'pending',
      created_at: existingJournal?.created_at || created,
      updated_at: nowIso,
      attempts: 0
    };

    await db.sync_journal.put(journalEntry);
  });

  notifyOutboxChange();
}

export async function getPendingJournalItems(forceAll = false): Promise<SyncJournalItem[]> {
  try {
    let items: SyncJournalItem[];
    if (forceAll) {
      items = await db.sync_journal
        .where('status')
        .anyOf(['pending', 'failed', 'syncing'])
        .toArray();
    } else {
      items = await db.sync_journal
        .where('status')
        .anyOf(['pending', 'failed'])
        .toArray();
    }
    return items.sort((a, b) => (a.created_at || 0) - (b.created_at || 0));
  } catch (err) {
    console.warn('[OfflineDB] Erro ao buscar itens pendentes do journal:', err);
    return [];
  }
}

export async function markJournalItemStatus(
  auditoriaId: string,
  perguntaId: string,
  status: 'pending' | 'syncing' | 'failed',
  lastError?: string
): Promise<void> {
  try {
    const item = await db.sync_journal
      .where('[auditoria_id+pergunta_id]')
      .equals([auditoriaId, perguntaId])
      .first();
    if (!item || !item.id) return;

    const updates: Partial<SyncJournalItem> = {
      status,
      updated_at: new Date().toISOString()
    };
    if (status === 'syncing') {
      updates.attempts = (item.attempts || 0) + 1;
    }
    if (lastError) {
      updates.last_error = lastError;
    }
    await db.sync_journal.update(item.id, updates);
    notifyOutboxChange();
  } catch (err) {
    console.warn('[OfflineDB] Erro ao atualizar status do item do journal:', err);
  }
}

export async function removeJournalItem(auditoriaId: string, perguntaId: string): Promise<void> {
  try {
    const item = await db.sync_journal
      .where('[auditoria_id+pergunta_id]')
      .equals([auditoriaId, perguntaId])
      .first();
    if (item && item.id) {
      await db.sync_journal.delete(item.id);
      notifyOutboxChange();
    }
  } catch (err) {
    console.warn('[OfflineDB] Erro ao remover item do journal:', err);
  }
}

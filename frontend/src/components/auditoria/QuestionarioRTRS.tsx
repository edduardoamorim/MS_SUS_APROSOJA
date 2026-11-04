import { normalizePerguntaId } from '../../constants/rtrsMapping';
import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle2, Camera, AlertCircle, MinusCircle, X, Loader2, Image as ImageIcon, FileText, Save, ChevronLeft, ChevronRight, CloudCheck, Download, ExternalLink, WifiOff, UploadCloud, Award, Sparkles, ArrowRight, RotateCcw } from 'lucide-react';
import PanoramaScoreRTRS, { type PanoramaCriterioItem } from './PanoramaScoreRTRS';
import { supabase } from '../../lib/supabase';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';
import { useSync } from '../../context/SyncContext';
import { syncEngine } from '../../services/syncEngine';
import { recordAuditChange, removeJournalItem, generateUUID, notifyOutboxChange, enqueueMutation, enqueueFile, removeEvidenceLocally, db, updateCachedAuditoria, getCachedReadData, cacheReadData, getAllCachedPerguntas, bulkSavePerguntas, getCachedRespostasByAuditoria, bulkSaveRespostas, type CachedPergunta } from '../../lib/offlineDb';
import { seedDefaultRTRSQuestions } from '../../services/precacheService';
import { cleanEvidenceUrl, resolveEvidenceUrlAsync, isPdfEvidence } from '../../lib/evidenceService';

interface QuestionarioRTRSProps {
  modo: 'autoavaliacao' | 'auditoria';
  propriedadeNome: string;
  onClose: () => void;
  onComplete: () => void;
  auditoriaId?: string;
  propriedadeId?: string;
}

interface Pergunta {
  id: string;
  secao: string;
  numero_criterio: string;
  enunciado: string;
  criterio: string;
  ponderacao: string;
  orientacao: string;
  interpretacao_nacional?: string;
  ativo?: boolean;
}

interface RespostaItem {
  conforme: boolean | null;
  nao_se_aplica?: boolean;
  observacao: string;
  evidenciaUrl: string | null;
  evidencia_uploaded_at?: string | null;
  numero_criterio?: string;
  data_envio?: string | null;
  updated_at?: string;
}

export default function QuestionarioRTRS({ modo, propriedadeNome, onClose, onComplete, auditoriaId, propriedadeId }: QuestionarioRTRSProps) {
  const { user } = useAuth();
  const { success, error, warning, info } = useToast();
  const { isOnline, isSyncing, pendingCounts } = useSync();
  const isDeviceOnline = isOnline && (typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [perguntas, setPerguntas] = useState<Pergunta[]>([]);
  const [loadingPerguntas, setLoadingPerguntas] = useState(true);
  const [respostas, setRespostas] = useState<Record<string, RespostaItem>>({});
  const [syncingDb, setSyncingDb] = useState(true);
  const [showSyncBadge, setShowSyncBadge] = useState(true);
  const [loading, setLoading] = useState(false);
  const [savingPartial, setSavingPartial] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [cameraLoadingId, setCameraLoadingId] = useState<string | null>(null);
  const [currentAuditoriaId, setCurrentAuditoriaId] = useState<string | null>(auditoriaId || null);
  const [secaoAtiva, setSecaoAtiva] = useState<string>('');
  const [expandedOrientacoes, setExpandedOrientacoes] = useState<Record<string, boolean>>({});
  const [fotoAmpliada, setFotoAmpliada] = useState<string | null>(null);
  const [pdfAmpliado, setPdfAmpliado] = useState<string | null>(null);
  const [activeModalPerguntaId, setActiveModalPerguntaId] = useState<string | null>(null);
  const [imageLoadError, setImageLoadError] = useState<boolean>(false);
  const [isRecoveringEvidence, setIsRecoveringEvidence] = useState<boolean>(false);

  // Auto-hide do badge "Dados carregados" após 2.5s
  useEffect(() => {
    if (syncingDb) {
      setShowSyncBadge(true);
    } else {
      const timer = setTimeout(() => {
        setShowSyncBadge(false);
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [syncingDb]);

  // Sincroniza auditoriaId prop com currentAuditoriaId
  useEffect(() => {
    if (auditoriaId && auditoriaId !== currentAuditoriaId) {
      setCurrentAuditoriaId(auditoriaId);
    }
  }, [auditoriaId]);

  // Disparo automático e unificado de drenagem quando a conexão estiver ativa ("Nuvem Conectada")
  useEffect(() => {
    if (isOnline && pendingCounts.total > 0 && !isSyncing) {
      console.log('[QuestionarioRTRS] Nuvem Conectada com pendências na fila. Disparando dreno automático...', pendingCounts);
      syncEngine.syncNow(true);
    }
  }, [isOnline, pendingCounts.total, isSyncing]);

  // Efeito para buscar perguntas
  useEffect(() => {
    async function fetchPerguntas() {
      // 1. Busca imediata no IndexedDB (Read-Through Cache)
      let local = await getAllCachedPerguntas();
      
      // Se estiver vazio no IndexedDB, semeia imediatamente os 115 critérios RTRS locais!
      if (!local || local.length === 0) {
        local = await seedDefaultRTRSQuestions();
      }

      if (local && local.length > 0) {
        setPerguntas(local as any);
        const secoes = Array.from(new Set(local.map(p => p.secao)));
        if (secoes.length > 0) setSecaoAtiva(secoes[0]);
        setLoadingPerguntas(false);
      }

      // 2. Revalidação em background com o Supabase se online
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          const { data, error } = await supabase
            .from('perguntas_rtrs')
            .select('*')
            .eq('ativo', true);

          if (!error && data && data.length > 0) {
            const parseNum = (str: string) => {
              return str.split('.').map(x => {
                const match = x.match(/^(\d*)([a-zA-Z]*)$/);
                if (match) {
                  const num = match[1] ? parseInt(match[1], 10) : 0;
                  const char = match[2] || '';
                  return [num, char];
                }
                return [0, x];
              });
            };

            const sorted = [...data].sort((a, b) => {
              const partsA = parseNum(a.numero_criterio || '');
              const partsB = parseNum(b.numero_criterio || '');
              for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
                if (partsA[i] === undefined) return -1;
                if (partsB[i] === undefined) return 1;
                const itemA = partsA[i];
                const itemB = partsB[i];

                const numA = typeof itemA[0] === 'number' ? itemA[0] : 0;
                const numB = typeof itemB[0] === 'number' ? itemB[0] : 0;
                const charA = typeof itemA[1] === 'string' ? itemA[1] : '';
                const charB = typeof itemB[1] === 'string' ? itemB[1] : '';

                if (numA !== numB) return numA - numB;
                if (charA !== charB) return charA.localeCompare(charB);
              }
              return 0;
            });

            setPerguntas(sorted as any);
            await bulkSavePerguntas(sorted as any);
          }
        } catch (err) {
          console.warn('[Offline] Usando catálogo RTRS local:', err);
        } finally {
          setLoadingPerguntas(false);
        }
      } else {
        setLoadingPerguntas(false);
      }
    }

    fetchPerguntas();
  }, []);

  useEffect(() => {
    async function initAutoavaliacao() {
      if (modo === 'autoavaliacao' && propriedadeId && !currentAuditoriaId) {
        try {
          const { data, error } = await supabase
            .from('auditorias')
            .select('id')
            .eq('propriedade_id', propriedadeId)
            .eq('status', 'Autoavaliação')
            .limit(1);

          if (error) throw error;

          if (data && data.length > 0) {
            setCurrentAuditoriaId(data[0].id);
          } else {
            const { data: newAudit, error: createError } = await supabase
              .from('auditorias')
              .insert([{
                propriedade_id: propriedadeId,
                status: 'Autoavaliação',
                data_agendamento: new Date().toISOString()
              }])
              .select('id')
              .single();

            if (createError) throw createError;
            if (newAudit) {
              setCurrentAuditoriaId(newAudit.id);
            }
          }
        } catch (err) {
          console.error('Erro ao inicializar autoavaliação:', err);
        }
      }
    }
    initAutoavaliacao();
  }, [modo, propriedadeId, currentAuditoriaId]);

  const getCacheKey = () => {
    const cleanName = (propriedadeNome || '').split('-')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
    return `rtrs_draft_${cleanName}`;
  };

  useEffect(() => {
    try {
      const localDraft = localStorage.getItem(getCacheKey());
      if (localDraft) {
        const parsed = JSON.parse(localDraft);
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          // Sanitiza qualquer URL fantasma, quebrada ou blob expirado de sessões anteriores
          Object.keys(parsed).forEach(k => {
            if (parsed[k]?.evidenciaUrl) {
              const urlStr = String(parsed[k].evidenciaUrl);
              if (urlStr.includes('supabase.local') || urlStr.includes('1787833477963') || urlStr.startsWith('blob:')) {
                // URLs blob: de sessões anteriores são revogadas ao dar reload (F5);
                // limpamos para que a nova URL criada a partir do IndexedDB (sync_journal) prevaleça
                parsed[k].evidenciaUrl = null;
              }
            }
          });
          setRespostas(parsed);
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar rascunho local:', e);
    }

    async function fetchExistingRespostas() {
      setSyncingDb(true);
      try {
        let targetAuditId = currentAuditoriaId;
        if (!targetAuditId || targetAuditId.startsWith('mock-') || targetAuditId.startsWith('assigned-pend-')) {
          targetAuditId = await getOrCreateRealAuditoriaId();
        }
        const cleanName = (propriedadeNome || '').split('-')[0].trim();

        // 1. Tentar ler do IndexedDB (cached_respostas + sync_journal) imediatamente (Local-First)
        if (targetAuditId && !targetAuditId.startsWith('mock-')) {
          const [cachedResps, journalItems, localFiles] = await Promise.all([
            getCachedRespostasByAuditoria(targetAuditId).catch(() => []),
            db.sync_journal.where('auditoria_id').equals(targetAuditId).toArray().catch(() => []),
            db.outbox_files.toArray().catch(() => [])
          ]);

          const loadedFromCache: Record<string, any> = {};

          if (cachedResps && cachedResps.length > 0) {
            cachedResps.forEach(r => {
              loadedFromCache[r.pergunta_id] = {
                conforme: r.conforme,
                nao_se_aplica: !!r.nao_se_aplica,
                observacao: r.observacoes || '',
                evidenciaUrl: r.evidencia_url || null,
                numero_criterio: r.numero_criterio
              };
            });
          }

          // Mescla com pendências do sync_journal (recria URL a partir do file_blob se necessário)
          if (journalItems && journalItems.length > 0) {
            journalItems.forEach(j => {
              let evUrl = cleanEvidenceUrl(j.evidencia_url);
              if (j.file_blob && (!evUrl || evUrl.startsWith('blob:'))) {
                try {
                  evUrl = URL.createObjectURL(j.file_blob);
                } catch {}
              }
              const canonId = normalizePerguntaId(j.pergunta_id);
              const entry = {
                conforme: j.conforme,
                nao_se_aplica: !!j.nao_se_aplica,
                observacao: j.observacoes || '',
                evidenciaUrl: evUrl || null,
                numero_criterio: j.numero_criterio
              };
              loadedFromCache[canonId] = entry;
              if (j.pergunta_id !== canonId) {
                loadedFromCache[j.pergunta_id] = entry;
              }
            });
          }

          // Mescla com arquivos em trânsito de outbox_files
          if (localFiles && localFiles.length > 0) {
            localFiles.forEach(f => {
              const pathOrName = f.storage_path || f.file_name || '';
              const match = pathOrName.match(/evidencia_([0-9a-fA-F-]+)_([0-9a-fA-F-]+)/);
              if (match) {
                const audId = match[1];
                const rawPergId = match[2];
                const canonPergId = normalizePerguntaId(rawPergId);
                if (audId === targetAuditId) {
                  let evUrl = f.public_url;
                  if (!evUrl && f.file_blob) {
                    try {
                      evUrl = URL.createObjectURL(f.file_blob);
                    } catch {}
                  }
                  if (evUrl) {
                    loadedFromCache[canonPergId] = {
                      ...(loadedFromCache[canonPergId] || {}),
                      evidenciaUrl: evUrl
                    };
                    if (rawPergId !== canonPergId) {
                      loadedFromCache[rawPergId] = loadedFromCache[canonPergId];
                    }
                  }
                }
              }
            });
          }

          if (Object.keys(loadedFromCache).length > 0) {
            // Mapeia perguntas com alterações pendentes não enviadas neste aparelho
            const pendingCacheQuestionsSet = new Set<string>();
            if (journalItems && journalItems.length > 0) {
              journalItems.forEach(j => {
                pendingCacheQuestionsSet.add(j.pergunta_id);
                pendingCacheQuestionsSet.add(normalizePerguntaId(j.pergunta_id));
              });
            }

            setRespostas(prev => {
              const merged: Record<string, RespostaItem> = { ...loadedFromCache };
              const allKeys = new Set([...Object.keys(loadedFromCache), ...Object.keys(prev)]);

              allKeys.forEach(pid => {
                const incoming = loadedFromCache[pid];
                const localDraft = prev[pid];
                const hasPendingChange = pendingCacheQuestionsSet.has(pid) || pendingCacheQuestionsSet.has(normalizePerguntaId(pid));

                if (incoming && localDraft) {
                  const incomingUrl = incoming.evidenciaUrl;
                  const prevUrl = localDraft.evidenciaUrl;
                  const safePrevUrl = prevUrl && !String(prevUrl).startsWith('blob:') ? prevUrl : null;

                  if (hasPendingChange) {
                    // Mantém rascunho local caso haja alteração pendente de envio deste aparelho
                    merged[pid] = {
                      ...incoming,
                      ...localDraft,
                      evidenciaUrl: incomingUrl || safePrevUrl || null
                    };
                  } else {
                    // Verdade do banco/cache prevalece sobre rascunho antigo do PC
                    merged[pid] = {
                      ...localDraft,
                      ...incoming,
                      conforme: incoming.conforme !== undefined && incoming.conforme !== null ? incoming.conforme : localDraft.conforme,
                      nao_se_aplica: incoming.nao_se_aplica !== undefined ? incoming.nao_se_aplica : localDraft.nao_se_aplica,
                      observacao: incoming.observacao !== undefined && incoming.observacao !== '' ? incoming.observacao : localDraft.observacao,
                      evidenciaUrl: incomingUrl || safePrevUrl || null
                    };
                  }
                } else if (incoming) {
                  merged[pid] = incoming;
                } else if (localDraft) {
                  merged[pid] = localDraft;
                }
              });

              // Salva o resultado sincronizado atualizado no localStorage para curar o rascunho antigo
              try {
                localStorage.setItem(getCacheKey(), JSON.stringify(merged));
              } catch (e) {}

              return merged;
            });
            setSyncingDb(false);
          }
        }

        // 2. Se online, consultar Supabase e atualizar cache
        if (typeof navigator !== 'undefined' && navigator.onLine) {
          let targetPropId = (propriedadeId && !propriedadeId.startsWith('mock-')) ? propriedadeId : null;
          if (!targetPropId && targetAuditId && !targetAuditId.startsWith('mock-') && !targetAuditId.startsWith('assigned-pend-')) {
            try {
              const { data: audRow } = await supabase
                .from('auditorias')
                .select('propriedade_id')
                .eq('id', targetAuditId)
                .maybeSingle();
              if (audRow?.propriedade_id) targetPropId = audRow.propriedade_id;
            } catch (e) {}
          }
          if (!targetPropId && cleanName) {
            try {
              const { data: foundProp } = await supabase
                .from('propriedades')
                .select('id')
                .ilike('nome_fazenda', `%${cleanName}%`)
                .limit(1)
                .maybeSingle();
              if (foundProp?.id) targetPropId = foundProp.id;
            } catch (e) {}
          }

          let sisterAuditIds: string[] = [];
          if (targetPropId && !targetPropId.startsWith('mock-')) {
            try {
              const { data: allAuditsForProp } = await supabase
                .from('auditorias')
                .select('id, created_at, updated_at')
                .eq('propriedade_id', targetPropId)
                .order('updated_at', { ascending: false });

              if (allAuditsForProp && allAuditsForProp.length > 0) {
                if (!targetAuditId || targetAuditId.startsWith('mock-') || targetAuditId.startsWith('assigned-pend-')) {
                  const previousId = currentAuditoriaId;
                  targetAuditId = allAuditsForProp[0].id;
                  setCurrentAuditoriaId(allAuditsForProp[0].id);

                  // Se tínhamos um ID sintético antes, atualiza mutações locais pendentes para o ID real
                  if (previousId && previousId !== allAuditsForProp[0].id && (previousId.startsWith('mock-') || previousId.startsWith('assigned-pend-'))) {
                    try {
                      await db.outbox_mutations
                        .where('table')
                        .equals('respostas_auditoria')
                        .and(m => m.payload?.auditoria_id === previousId)
                        .modify(m => {
                          m.payload.auditoria_id = allAuditsForProp[0].id;
                        });
                    } catch (e) {
                      console.warn('[QuestionarioRTRS] Aviso ao reconciliar mutações com novo ID:', e);
                    }
                  }
                }
                sisterAuditIds = allAuditsForProp.map((a: any) => a.id).filter((id: string) => id !== targetAuditId);
              }
            } catch (e) {
              console.warn('[QuestionarioRTRS] Erro ao buscar auditorias da fazenda:', e);
            }
          }

          if (targetAuditId && !targetAuditId.startsWith('mock-') && !targetAuditId.startsWith('assigned-pend-')) {
            // Consulta alterações locais pendentes neste aparelho para proteger apenas os itens não enviados
            const [pendingJournalItems, pendingOutboxMutations] = await Promise.all([
              db.sync_journal.where('auditoria_id').equals(targetAuditId).toArray().catch(() => []),
              db.outbox_mutations.where('table').equals('respostas_auditoria').and(m => m.payload?.auditoria_id === targetAuditId).toArray().catch(() => [])
            ]);

            const pendingQuestionsSet = new Set<string>();
            pendingJournalItems.forEach(j => {
              pendingQuestionsSet.add(j.pergunta_id);
              pendingQuestionsSet.add(normalizePerguntaId(j.pergunta_id));
            });
            pendingOutboxMutations.forEach(m => {
              if (m.payload?.pergunta_id) {
                pendingQuestionsSet.add(m.payload.pergunta_id);
                pendingQuestionsSet.add(normalizePerguntaId(m.payload.pergunta_id));
              }
            });

            const { data, error } = await supabase
              .from('respostas_auditoria')
              .select(`
                pergunta_id,
                conforme,
                nao_se_aplica,
                observacoes,
                evidencia_url,
                perguntas_rtrs (
                  id,
                  numero_criterio
                )
              `)
              .eq('auditoria_id', targetAuditId);

            let finalServerRespostas = data || [];

            // TAREFA 4: Consolidação de auditorias da mesma fazenda
            if (sisterAuditIds.length > 0) {
              try {
                const { data: sisterResps } = await supabase
                  .from('respostas_auditoria')
                  .select(`
                    pergunta_id,
                    conforme,
                    nao_se_aplica,
                    observacoes,
                    evidencia_url,
                    auditoria_id,
                    perguntas_rtrs (
                      id,
                      numero_criterio
                    )
                  `)
                  .in('auditoria_id', sisterAuditIds);

                if (sisterResps && sisterResps.length > 0) {
                  const countsByAudit: Record<string, number> = {};
                  sisterResps.forEach((sr: any) => {
                    countsByAudit[sr.auditoria_id] = (countsByAudit[sr.auditoria_id] || 0) + 1;
                  });

                  let bestSisterId: string | null = null;
                  let maxSisterCount = 0;
                  Object.entries(countsByAudit).forEach(([sId, count]) => {
                    if (count > maxSisterCount) {
                      maxSisterCount = count;
                      bestSisterId = sId;
                    }
                  });

                  const currentCount = finalServerRespostas.length;
                  if (bestSisterId && maxSisterCount > currentCount) {
                    console.log(`[QuestionarioRTRS] Auditoria irmã ${bestSisterId} tem mais respostas (${maxSisterCount}) que a atual (${currentCount}). Adotando auditoria principal e consolidando.`);
                    targetAuditId = bestSisterId;
                    setCurrentAuditoriaId(bestSisterId);
                  }

                  // Mesclar respostas preservando todas as perguntas respondidas
                  const combinedMap = new Map<string, any>();
                  // 1. Respostas das irmãs
                  sisterResps.forEach((sr: any) => {
                    combinedMap.set(sr.pergunta_id, sr);
                  });
                  // 2. Sobrepõe com a atual
                  finalServerRespostas.forEach((cr: any) => {
                    const existing = combinedMap.get(cr.pergunta_id);
                    if (!existing) {
                      combinedMap.set(cr.pergunta_id, cr);
                    } else {
                      const hasVal = cr.conforme !== null || cr.nao_se_aplica || cr.observacoes || cr.evidencia_url;
                      if (hasVal) {
                        combinedMap.set(cr.pergunta_id, cr);
                      }
                    }
                  });
                  finalServerRespostas = Array.from(combinedMap.values());

                  // Migra proativamente respostas de auditorias irmãs para a auditoria alvo no Supabase
                  if (targetAuditId && !targetAuditId.startsWith('mock-')) {
                    const existingPergsInTarget = new Set((data || []).map((d: any) => normalizePerguntaId(d.pergunta_id)));
                    const toMigrate = sisterResps.filter((sr: any) => !existingPergsInTarget.has(normalizePerguntaId(sr.pergunta_id)));
                    if (toMigrate.length > 0) {
                      const migratePayloads = toMigrate.map((sr: any) => ({
                        auditoria_id: targetAuditId,
                        pergunta_id: normalizePerguntaId(sr.pergunta_id),
                        conforme: sr.conforme ?? false,
                        nao_se_aplica: !!sr.nao_se_aplica,
                        observacoes: sr.observacoes || '',
                        evidencia_url: sr.evidencia_url || null,
                        updated_at: new Date().toISOString()
                      }));
                      supabase.from('respostas_auditoria').upsert(migratePayloads, { onConflict: 'auditoria_id,pergunta_id' }).then(() => {});
                    }
                  }
                }
              } catch (sisterErr) {
                console.warn('[QuestionarioRTRS] Erro ao consolidar respostas irmãs:', sisterErr);
              }
            }

            if (!error && finalServerRespostas && finalServerRespostas.length > 0) {
              // 1. Mapeia exclusões locais pendentes e evidências na outbox para blindar contra ressurreição e clobbering
              const locallyDeletedEvidencias = new Set<string>();
              const localPendingWithEvidence = new Map<string, any>();
              pendingOutboxMutations.forEach(m => {
                if (m.payload?.pergunta_id && m.payload?.evidencia_url === null) {
                  locallyDeletedEvidencias.add(m.payload.pergunta_id);
                } else if (m.payload?.pergunta_id && m.payload?.evidencia_url) {
                  localPendingWithEvidence.set(m.payload.pergunta_id, m.payload);
                }
              });
              pendingJournalItems.forEach(j => {
                if (j.is_explicit_delete || j.evidencia_url === null) {
                  locallyDeletedEvidencias.add(j.pergunta_id);
                } else if (j.evidencia_url) {
                  localPendingWithEvidence.set(j.pergunta_id, j);
                }
              });

              // 2. Buscar dados atuais do Dexie (cached_respostas) para esta auditoria
              const currentLocalResps = await getCachedRespostasByAuditoria(targetAuditId);
              const localCachedMap = new Map<string, any>();
              currentLocalResps.forEach(r => localCachedMap.set(r.pergunta_id, r));

              const loadedRespostas: Record<string, any> = {};
              const cacheBatch: any[] = [];

              finalServerRespostas.forEach(r => {
                const rawObs = (r as any).observacoes || '';
                const numCrit = (r as any).perguntas_rtrs?.numero_criterio || '';
                let evUrl = cleanEvidenceUrl(r.evidencia_url);
                if (evUrl && (evUrl.includes('supabase.local') || evUrl.includes('1787833477963'))) {
                  evUrl = null;
                }

                // Se foi excluído localmente e ainda não sincronizou com o Supabase, preserva null!
                if (locallyDeletedEvidencias.has(r.pergunta_id)) {
                  evUrl = null;
                } else {
                  // Se o Supabase não tem a evidência válida ou possui blob: efêmero,
                  // preserva a evidência local confirmada ou pendente!
                  const localExisting = localCachedMap.get(r.pergunta_id);
                  const localPending = localPendingWithEvidence.get(r.pergunta_id);

                  if (!evUrl || evUrl.startsWith('blob:')) {
                    if (localPending?.evidencia_url) {
                      evUrl = localPending.evidencia_url;
                    } else if (localExisting?.evidencia_url) {
                      evUrl = localExisting.evidencia_url;
                    }
                  }
                }

                const localExisting = localCachedMap.get(r.pergunta_id);
                const localEvUploadedAt = (r as any).evidencia_uploaded_at || localExisting?.evidencia_uploaded_at || null;
                const localDataEnvio = (r as any).data_envio || localExisting?.data_envio || localEvUploadedAt || null;

                loadedRespostas[r.pergunta_id] = {
                  conforme: r.conforme,
                  nao_se_aplica: !!(r as any).nao_se_aplica,
                  observacao: rawObs,
                  evidenciaUrl: evUrl,
                  numero_criterio: numCrit,
                  evidencia_uploaded_at: localEvUploadedAt,
                  data_envio: localDataEnvio
                };

                cacheBatch.push({
                  auditoria_id: targetAuditId,
                  pergunta_id: r.pergunta_id,
                  conforme: r.conforme,
                  nao_se_aplica: !!(r as any).nao_se_aplica,
                  observacoes: rawObs,
                  evidencia_url: evUrl,
                  numero_criterio: numCrit,
                  updated_at: new Date().toISOString(),
                  evidencia_uploaded_at: localEvUploadedAt,
                  data_envio: localDataEnvio
                });
              });

              // Preserva também respostas locais que ainda não foram inseridas no Supabase
              currentLocalResps.forEach(lr => {
                if (!loadedRespostas[lr.pergunta_id] && !locallyDeletedEvidencias.has(lr.pergunta_id)) {
                  loadedRespostas[lr.pergunta_id] = {
                    conforme: lr.conforme,
                    nao_se_aplica: !!lr.nao_se_aplica,
                    observacao: lr.observacoes || '',
                    evidenciaUrl: lr.evidencia_url,
                    numero_criterio: lr.numero_criterio,
                    evidencia_uploaded_at: lr.evidencia_uploaded_at,
                    data_envio: lr.data_envio
                  };
                  cacheBatch.push(lr);
                }
              });

              const healBatch: { pergunta_id: string; evidencia_url: string }[] = [];

              setRespostas(prev => {
                const merged: Record<string, RespostaItem> = { ...loadedRespostas };
                const allKeys = new Set([...Object.keys(loadedRespostas), ...Object.keys(prev)]);

                allKeys.forEach(pid => {
                  const incoming = loadedRespostas[pid];
                  const localDraft = prev[pid];
                  const isExplicitlyDeleted = locallyDeletedEvidencias.has(pid);
                  const hasPendingLocalChange = pendingQuestionsSet.has(pid) || pendingQuestionsSet.has(normalizePerguntaId(pid));

                  if (incoming && localDraft) {
                    if (hasPendingLocalChange) {
                      merged[pid] = {
                        ...incoming,
                        ...localDraft,
                        evidenciaUrl: isExplicitlyDeleted ? null : (incoming.evidenciaUrl || localDraft.evidenciaUrl || null)
                      };
                    } else {
                      // Servidor/Cache PREVALECE sobre rascunho antigo do PC
                      merged[pid] = {
                        ...localDraft,
                        ...incoming,
                        conforme: incoming.conforme !== undefined && incoming.conforme !== null ? incoming.conforme : localDraft.conforme,
                        nao_se_aplica: incoming.nao_se_aplica !== undefined ? incoming.nao_se_aplica : localDraft.nao_se_aplica,
                        observacao: incoming.observacao !== undefined && incoming.observacao !== '' ? incoming.observacao : localDraft.observacao,
                        evidenciaUrl: isExplicitlyDeleted ? null : (incoming.evidenciaUrl || localDraft.evidenciaUrl || null)
                      };
                    }
                  } else if (incoming) {
                    merged[pid] = {
                      ...incoming,
                      evidenciaUrl: isExplicitlyDeleted ? null : incoming.evidenciaUrl
                    };
                  } else if (localDraft) {
                    merged[pid] = {
                      ...localDraft,
                      evidenciaUrl: isExplicitlyDeleted ? null : localDraft.evidenciaUrl
                    };
                  }

                  // SELF-HEALING: se o item possui URL válida mas no banco Supabase estava ausente ou null
                  if (!isExplicitlyDeleted && merged[pid]?.evidenciaUrl && (String(merged[pid].evidenciaUrl).startsWith('http') || String(merged[pid].evidenciaUrl).startsWith('data:'))) {
                    const canonPid = normalizePerguntaId(pid);
                    const serverItem = finalServerRespostas.find((sr: any) => normalizePerguntaId(sr.pergunta_id) === canonPid);
                    const serverHasValidUrl = serverItem?.evidencia_url && !String(serverItem.evidencia_url).startsWith('blob:');
                    if (!serverHasValidUrl) {
                      healBatch.push({
                        pergunta_id: canonPid,
                        evidencia_url: merged[pid].evidenciaUrl!
                      });
                    }
                  }
                });

                // Salva o resultado sincronizado atualizado no localStorage para curar o rascunho antigo do PC!
                try {
                  localStorage.setItem(getCacheKey(), JSON.stringify(merged));
                } catch (e) {}

                return merged;
              });

              // Executa o Self-Healing proativo no Supabase e no Dexie
              if (healBatch.length > 0 && targetAuditId && !targetAuditId.startsWith('mock-')) {
                const uniqueHeal = new Map<string, string>();
                healBatch.forEach(h => uniqueHeal.set(h.pergunta_id, h.evidencia_url));
                const nowIsoHeal = new Date().toISOString();
                Promise.all(Array.from(uniqueHeal.entries()).map(async ([pId, evUrl]) => {
                  try {
                    await supabase
                      .from('respostas_auditoria')
                      .update({ evidencia_url: evUrl, updated_at: nowIsoHeal })
                      .eq('auditoria_id', targetAuditId)
                      .eq('pergunta_id', pId);
                    await db.cached_respostas
                      .where('auditoria_id')
                      .equals(targetAuditId)
                      .and(r => normalizePerguntaId(r.pergunta_id) === pId)
                      .modify({ evidencia_url: evUrl, evidencia_uploaded_at: nowIsoHeal, data_envio: nowIsoHeal });
                  } catch (hErr) {
                    console.warn('[QuestionarioRTRS] Erro no auto-heal Supabase:', pId, hErr);
                  }
                })).then(() => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('ms:evidence-uploaded', { detail: { auditoriaId: targetAuditId } }));
                  }
                });
              }

              await bulkSaveRespostas(cacheBatch);
            }
          }
        }
      } catch (err) {
        console.warn('[Offline] Respostas lidas do rascunho local:', err);
      } finally {
        setSyncingDb(false);
      }
    }
    fetchExistingRespostas();
  }, [currentAuditoriaId, propriedadeId, propriedadeNome]);

  // Reconciliação e limpeza automática de rascunhos com as perguntas ativas
  useEffect(() => {
    if (perguntas.length > 0 && Object.keys(respostas).length > 0) {
      const validMap = new Map(perguntas.map(p => [p.id, p]));
      const numMap = new Map(perguntas.map(p => [p.numero_criterio, p.id]));
      
      let needsCleanup = false;
      const sanitized: Record<string, { conforme: boolean | null; nao_se_aplica?: boolean; observacao: string; evidenciaUrl: string | null; numero_criterio?: string }> = {};

      Object.entries(respostas).forEach(([key, val]) => {
        if (validMap.has(key)) {
          sanitized[key] = {
            ...val,
            numero_criterio: validMap.get(key)!.numero_criterio
          };
        } else if (val && (val as any).numero_criterio && numMap.has((val as any).numero_criterio)) {
          const newId = numMap.get((val as any).numero_criterio)!;
          sanitized[newId] = {
            ...val,
            numero_criterio: (val as any).numero_criterio
          };
          needsCleanup = true;
        } else {
          // Chave órfã de IDs legados - ignora e limpa do estado
          needsCleanup = true;
        }
      });

      if (needsCleanup) {
        setRespostas(sanitized);
        try {
          localStorage.setItem(getCacheKey(), JSON.stringify(sanitized));
        } catch (e) {}
      }
    }
  }, [perguntas]);

  // Auto-sync de respostas para LocalStorage a cada alteração
  useEffect(() => {
    if (Object.keys(respostas).length > 0) {
      try {
        localStorage.setItem(getCacheKey(), JSON.stringify(respostas));
      } catch (e) {
        console.warn('Erro ao salvar rascunho local:', e);
      }
    }
  }, [respostas, propriedadeNome]);

  const touchAuditoriaTimestamp = async (activeAuditId?: string | null, customTime?: string) => {
    const aid = activeAuditId || currentAuditoriaId;
    const nowIso = customTime || new Date().toISOString();

        // 1. Armazenamento instantâneo em LocalStorage e no Dexie local (0ms)
    try {
      const cleanName = (propriedadeNome || '').split('-')[0].trim().toLowerCase().replace(/[^a-z0-9]/g, '_');
      if (cleanName) {
        localStorage.setItem(`rtrs_last_modified_${cleanName}`, nowIso);
      }
      if (aid && !aid.startsWith('mock-') && !aid.startsWith('assigned-pend-')) {
        localStorage.setItem(`rtrs_last_modified_id_${aid}`, nowIso);
      }
      if (aid) {
        updateCachedAuditoria(aid, {
          updated_at: nowIso,
          ultima_alteracao_at: nowIso
        }).catch(() => {});
      }
    } catch (e) {}

    // 2. Persistir updated_at em tempo real no Supabase
    if (aid && !aid.startsWith('mock-') && !aid.startsWith('assigned-pend-')) {
      supabase
        .from('auditorias')
        .update({ 
          updated_at: nowIso,
          status: modo === 'autoavaliacao' ? 'Autoavaliação' : 'Em Andamento',
          ...(user?.id ? { tecnico_responsavel_id: user.id } : {})
        })
        .eq('id', aid)
        .then(({ error: aErr }) => {
          if (aErr) console.warn('Aviso ao atualizar timestamp da auditoria:', aErr);
        });

      if (propriedadeId && !propriedadeId.startsWith('mock-')) {
        supabase
          .from('propriedades')
          .update({ updated_at: nowIso })
          .eq('id', propriedadeId)
          .then(({ error: pErr }) => {
            if (pErr) console.warn('Aviso ao atualizar timestamp da propriedade:', pErr);
          });
      } else {
        supabase
          .from('auditorias')
          .select('propriedade_id')
          .eq('id', aid)
          .maybeSingle()
          .then(({ data: auditRow }) => {
            if (auditRow?.propriedade_id) {
              supabase.from('propriedades').update({ updated_at: nowIso }).eq('id', auditRow.propriedade_id).then(() => {});
            }
          });
      }
    }
  };

    /**
   * Pipeline Transacional Local-First Unificado (Critérios RTRS):
   * 1. Grava no React state e LocalStorage imediatamente (UI instantânea)
   * 2. Grava no Dexie (cached_respostas) imediatamente (0ms)
   * 3. Se remoção de evidência: purga outbox_files e limpa cached_respostas
   * 4. Enfileira na outbox_mutations (com coalescência)
   * 5. Se online e remoção: executa update direto no Supabase
   * 6. Se online: drena a fila via syncEngine.syncNow(true)
   */
  const persistRespostaTransactional = async (
    perguntaId: string,
    updates: {
      conforme?: boolean | null;
      nao_se_aplica?: boolean;
      observacao?: string;
      evidenciaUrl?: string | null;
      fileId?: string;
      evidenciaUploadedAt?: string;
    }
  ) => {
    const canonicalId = normalizePerguntaId(perguntaId);
    const nowIso = updates.evidenciaUploadedAt || new Date().toISOString();
    const pergunta = perguntas.find(p => p.id === canonicalId || p.id === perguntaId);
    const numCrit = pergunta?.numero_criterio || '';

    const currentAns = respostas[canonicalId] || respostas[perguntaId] || {};
    const isRemovingEvidence = updates.evidenciaUrl === null;
    let nextEvidenciaUrl = currentAns.evidenciaUrl || null;
    if (updates.evidenciaUrl !== undefined) {
      nextEvidenciaUrl = updates.evidenciaUrl;
    }

    let nextStateForId: RespostaItem = {
      conforme: updates.conforme !== undefined ? updates.conforme : (currentAns.conforme ?? null),
      nao_se_aplica: updates.nao_se_aplica !== undefined ? updates.nao_se_aplica : (currentAns.nao_se_aplica ?? false),
      observacao: updates.observacao !== undefined ? updates.observacao : (currentAns.observacao || ''),
      evidenciaUrl: nextEvidenciaUrl,
      numero_criterio: numCrit,
      evidencia_uploaded_at: isRemovingEvidence
        ? null
        : (updates.evidenciaUploadedAt || currentAns.evidencia_uploaded_at || (nextEvidenciaUrl ? nowIso : null)),
      updated_at: nowIso
    };

    // 1. Atualização instantânea da UI e LocalStorage
    setRespostas(prev => {
      const current = prev[canonicalId] || prev[perguntaId] || {};
      const nextForId: RespostaItem = {
        ...current,
        conforme: updates.conforme !== undefined ? updates.conforme : (current.conforme ?? null),
        nao_se_aplica: updates.nao_se_aplica !== undefined ? updates.nao_se_aplica : (current.nao_se_aplica ?? false),
        observacao: updates.observacao !== undefined ? updates.observacao : (current.observacao || ''),
        evidenciaUrl: nextEvidenciaUrl,
        numero_criterio: numCrit,
        evidencia_uploaded_at: isRemovingEvidence
          ? null
          : (updates.evidenciaUploadedAt || current.evidencia_uploaded_at || (nextEvidenciaUrl ? nowIso : null)),
        updated_at: nowIso
      };
      nextStateForId = nextForId;
      const next = { ...prev, [canonicalId]: nextForId };
      if (canonicalId !== perguntaId) {
        next[perguntaId] = nextForId;
      }
      try { localStorage.setItem(getCacheKey(), JSON.stringify(next)); } catch (e) {}
      return next;
    });

    // 2. Resolução do ID de auditoria
    const activeId = await getOrCreateRealAuditoriaId();
    const auditIdToUse = activeId || currentAuditoriaId || auditoriaId;

    if (auditIdToUse) {
      // 3. Gravação Atômica Unificada via recordAuditChange (Unified WAL)
      // Grava simultaneamente em db.cached_respostas e db.sync_journal
      const safeConformeForDb = nextStateForId.conforme !== null && nextStateForId.conforme !== undefined
        ? nextStateForId.conforme
        : false;

      await recordAuditChange({
        auditoria_id: auditIdToUse,
        pergunta_id: canonicalId,
        conforme: safeConformeForDb,
        nao_se_aplica: nextStateForId.nao_se_aplica ?? false,
        observacoes: nextStateForId.observacao,
        evidencia_url: nextStateForId.evidenciaUrl,
        is_explicit_delete: isRemovingEvidence,
        numero_criterio: numCrit,
        status: 'pending',
        created_at: Date.now(),
        updated_at: nowIso,
        attempts: 0
      });

      // 4. Se for remoção de evidência, limpa vestígios locais
      if (updates.evidenciaUrl === null) {
        await removeEvidenceLocally(auditIdToUse, canonicalId);
        if (canonicalId !== perguntaId) {
          await removeEvidenceLocally(auditIdToUse, perguntaId);
        }
      }

      touchAuditoriaTimestamp(auditIdToUse, nowIso);

        // 5. Fast-path online: se conectado e auditoria não for sintética, grava imediatamente no Supabase
        if (isDeviceOnline && !auditIdToUse.startsWith('mock-') && !auditIdToUse.startsWith('assigned-pend-')) {
          let directSuccess = false;
          try {
            // Verifica se existe evidência prévia no cache local que deve ser preservada
            let finalOnlineEvidenciaUrl = nextStateForId.evidenciaUrl || null;
            if (!isRemovingEvidence && !finalOnlineEvidenciaUrl) {
              try {
                const existingCached = await db.cached_respostas.get([auditIdToUse, canonicalId]);
                if (existingCached?.evidencia_url && !existingCached.evidencia_url.startsWith('blob:')) {
                  finalOnlineEvidenciaUrl = existingCached.evidencia_url;
                }
              } catch {}
            }

            const payload: any = {
              auditoria_id: auditIdToUse,
              pergunta_id: canonicalId,
              conforme: safeConformeForDb,
              nao_se_aplica: nextStateForId.nao_se_aplica ?? false,
              observacoes: nextStateForId.observacao || '',
              updated_at: nowIso
            };

            // BLINDAGEM DE OURO: Só inclui evidencia_url se for exclusão explícita OU se tiver uma URL válida.
            // Se for apenas atualização de conformidade/observação e não houver URL nova, NUNCA envia evidencia_url: null!
            if (isRemovingEvidence) {
              payload.evidencia_url = null;
            } else if (finalOnlineEvidenciaUrl) {
              payload.evidencia_url = finalOnlineEvidenciaUrl;
            }

            let { error: dbErr } = await supabase
              .from('respostas_auditoria')
              .upsert(payload, { onConflict: 'auditoria_id,pergunta_id' });

            // Auto-criar auditoria pai caso ainda não exista no servidor (FK 23503)
            if (dbErr && ((dbErr as any).code === '23503' || dbErr.message?.includes('auditoria_id'))) {
              const cachedAud = await db.cached_auditorias.get(auditIdToUse);
              const targetPropId = propriedadeId || cachedAud?.propriedade_id;
              if (targetPropId && !targetPropId.startsWith('mock-')) {
                await supabase.from('auditorias').upsert([{
                  id: auditIdToUse,
                  propriedade_id: targetPropId,
                  tecnico_responsavel_id: user?.id || cachedAud?.tecnico_responsavel_id || null,
                  status: modo === 'autoavaliacao' ? 'Autoavaliação' : 'Em Andamento',
                  data_agendamento: cachedAud?.data_agendamento || nowIso,
                  updated_at: nowIso
                }], { onConflict: 'id' });
                const retryUpsert = await supabase
                  .from('respostas_auditoria')
                  .upsert(payload, { onConflict: 'auditoria_id,pergunta_id' });
                dbErr = retryUpsert.error;
              }
            }

            if (!dbErr) {
              directSuccess = true;
              // Atualizar auditorias updated_at
              supabase.from('auditorias').update({ updated_at: nowIso }).eq('id', auditIdToUse).then(() => {});

              // Se for remoção de evidência, expurga arquivos correspondentes do Storage no bucket evidencias
              if (updates.evidenciaUrl === null) {
                const prefix1 = `evidencia_${auditIdToUse}_${canonicalId}`;
                const prefix2 = `${auditIdToUse}_${canonicalId}`;
                const [res1, res2, res3] = await Promise.all([
                  supabase.storage.from('evidencias').list('', { search: prefix1 }),
                  supabase.storage.from('evidencias').list('', { search: prefix2 }),
                  supabase.storage.from('evidencias').list('evidencias', { search: prefix2 })
                ]);
                const filesToDelete: string[] = [];
                if (res1.data) res1.data.forEach(f => filesToDelete.push(f.name));
                if (res2.data) res2.data.forEach(f => filesToDelete.push(f.name));
                if (res3.data) res3.data.forEach(f => filesToDelete.push(`evidencias/${f.name}`));
                if (currentAns.evidenciaUrl && typeof currentAns.evidenciaUrl === 'string' && currentAns.evidenciaUrl.includes('/evidencias/')) {
                  const splitted = currentAns.evidenciaUrl.split('/evidencias/');
                  if (splitted[1]) filesToDelete.push(decodeURIComponent(splitted[1].split('?')[0]));
                }
                if (filesToDelete.length > 0) {
                  await supabase.storage.from('evidencias').remove([...new Set(filesToDelete)]);
                }
              }

              // Remover o item do db.sync_journal
              await removeJournalItem(auditIdToUse, canonicalId);
              if (canonicalId !== perguntaId) {
                await removeJournalItem(auditIdToUse, perguntaId);
              }
              // Disparar notifyOutboxChange()
              notifyOutboxChange();

              // Disparar evento customizado
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('ms:audit-updated', { detail: { auditoriaId: auditIdToUse } }));
              }
            } else {
              console.warn('[QuestionarioRTRS] Falha no upsert direto de resposta, SyncEngine assumirá em background:', dbErr);
            }
          } catch (fastErr) {
            console.warn('[QuestionarioRTRS] Erro no fast-path online de resposta:', fastErr);
          }

          // Se falhou por oscilação de rede ou se há outros itens pendentes, o syncNow assume em background
          syncEngine.syncNow(true);
        }
    }
  };

  const handleResposta = (id: string, valor: boolean | 'nao_se_aplica') => {
    if (valor === 'nao_se_aplica') {
      persistRespostaTransactional(id, { conforme: false, nao_se_aplica: true });
    } else {
      persistRespostaTransactional(id, { conforme: valor, nao_se_aplica: false });
    }
  };

  const handleObservacao = (id: string, observacao: string) => {
    persistRespostaTransactional(id, { observacao });
  };

  const handleOpenEvidencia = (url?: string | null, perguntaId?: string) => {
    if (!url || !url.trim()) return;
    setImageLoadError(false);
    setActiveModalPerguntaId(perguntaId || null);

    const clean = cleanEvidenceUrl(url);
    if (!clean) return;

    if (isPdfEvidence(clean)) {
      setPdfAmpliado(clean);
      return;
    }

    // Abre imediatamente para feedback instantâneo da UI
    setFotoAmpliada(clean);

    // Dispara resolução inteligente assíncrona em background para garantir integridade
    const targetAuditId = currentAuditoriaId || auditoriaId;
    if (targetAuditId && perguntaId) {
      resolveEvidenceUrlAsync({
        url: clean,
        auditoriaId: targetAuditId,
        perguntaId
      }).then(resolved => {
        if (resolved && resolved !== clean) {
          setFotoAmpliada(resolved);
        }
      }).catch(err => {
        console.warn('[QuestionarioRTRS] Aviso na auto-resolução de evidência:', err);
      });
    }
  };

  // Compactador leve de imagem para fallback base64 (garante < 300KB para não estourar o limite de payload do PostgREST)
  const compressImageForFallback = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const MAX_WIDTH = 1280;
          const MAX_HEIGHT = 1280;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.82));
          } else {
            resolve((e.target?.result as string) || '');
          }
        };
        img.onerror = () => resolve((e.target?.result as string) || '');
        img.src = (e.target?.result as string) || '';
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const dataUrlToMemoryBlob = (dataUrl: string, defaultMime = 'image/jpeg'): Blob | null => {
    try {
      if (!dataUrl || !dataUrl.startsWith('data:')) return null;
      const parts = dataUrl.split(',');
      if (parts.length < 2) return null;
      const mimeMatch = parts[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : defaultMime;
      const bstr = atob(parts[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new Blob([u8arr.buffer], { type: mime });
    } catch (e) {
      return null;
    }
  };

  const handleUploadEvidencia = async (id: string, file: File) => {
    setCameraLoadingId(id);
    try {
      // Blindagem estrita contra Blobs vazios (0 bytes)
      if (!file || file.size === 0) {
        console.warn('[QuestionarioRTRS] Tentativa de anexo com arquivo vazio (0 bytes). Abortando.');
        error('A foto capturada está vazia ou corrompida (0 bytes). Por favor, capture a foto novamente.');
        setCameraLoadingId(null);
        return;
      }

      // 0. BLINDAGEM iOS SAFARI / WEBKIT:
      // Copia os bytes para um ArrayBuffer em memória IMEDIATAMENTE, antes de qualquer await externo ou limpeza de input,
      // impedindo que o WebKit invalide o ponteiro temporário do arquivo da câmera/galeria.
      let rawMemoryBlob: Blob | null = null;
      try {
        const buf = await file.arrayBuffer();
        if (buf && buf.byteLength > 0) {
          rawMemoryBlob = new Blob([buf], { type: file.type || 'image/jpeg' });
        }
      } catch (bufErr) {
        console.warn('[QuestionarioRTRS] Aviso ao clonar ArrayBuffer imediato do arquivo:', bufErr);
      }

      const canonicalId = normalizePerguntaId(id);
      const nowIso = new Date().toISOString();
      const rawExt = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
      const isImageFile = file.type.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(rawExt);

      // 1. Gera preview comprimido (DataURL) em memória para fotos ou DataURL para PDF
      let previewUrl = '';
      if (isImageFile || file.type === 'application/pdf' || rawExt === 'pdf') {
        previewUrl = await compressImageForFallback(file);
      }
      if (!previewUrl) {
        previewUrl = URL.createObjectURL(rawMemoryBlob || file);
      }

      // Para imagens (especialmente fotos pesadas de celular ou HEIC/HEIF do iPhone),
      // converte o previewUrl (JPEG otimizado 1280px) em um Blob em memória leve e 100% compatível!
      let safeUploadBlob: Blob = rawMemoryBlob || file;
      let finalExt = rawExt === 'jpeg' || rawExt === 'heic' || rawExt === 'heif' ? 'jpg' : (rawExt || 'jpg');
      let finalMime = file.type && file.type !== 'text/plain'
        ? file.type
        : (finalExt === 'png' ? 'image/png' : finalExt === 'pdf' ? 'application/pdf' : finalExt === 'webp' ? 'image/webp' : 'image/jpeg');

      if (isImageFile && previewUrl.startsWith('data:image/jpeg')) {
        const compressedBlob = dataUrlToMemoryBlob(previewUrl, 'image/jpeg');
        if (compressedBlob && compressedBlob.size > 0) {
          safeUploadBlob = compressedBlob;
          finalExt = 'jpg';
          finalMime = 'image/jpeg';
        }
      } else if (previewUrl.startsWith('data:') && !rawMemoryBlob) {
        const fallbackBlob = dataUrlToMemoryBlob(previewUrl, finalMime);
        if (fallbackBlob && fallbackBlob.size > 0) {
          safeUploadBlob = fallbackBlob;
        }
      }

      const activeId = await getOrCreateRealAuditoriaId();
      const auditIdToUse = activeId || currentAuditoriaId || auditoriaId;
      const fileName = `evidencia_${auditIdToUse || 'temp'}_${canonicalId}_${Date.now()}.${finalExt}`;
      const filePath = `${fileName}`;

      const currentAns = respostas[canonicalId] || respostas[id] || {};
      const safeConforme = currentAns.conforme ?? false;
      const safeNaoSeAplica = currentAns.nao_se_aplica ?? false;
      const safeObservacoes = currentAns.observacao || '';
      const numCrit = perguntas.find(p => p.id === canonicalId || p.id === id)?.numero_criterio || '';

      // 2. Atualização instantânea da UI e LocalStorage
      setRespostas(prev => {
        const next = {
          ...prev,
          [canonicalId]: {
            ...currentAns,
            conforme: safeConforme,
            nao_se_aplica: safeNaoSeAplica,
            evidenciaUrl: previewUrl,
            numero_criterio: numCrit,
            evidencia_uploaded_at: nowIso,
            updated_at: nowIso
          }
        };
        if (canonicalId !== id) {
          next[id] = next[canonicalId];
        }
        try { localStorage.setItem(getCacheKey(), JSON.stringify(next)); } catch (e) {}
        return next;
      });

      // 3. Gravação Atômica no Unified WAL (recordAuditChange) com Blob 100% em memória + DataURL de segurança
      if (auditIdToUse) {
        await recordAuditChange({
          auditoria_id: auditIdToUse,
          pergunta_id: canonicalId,
          conforme: safeConforme,
          nao_se_aplica: safeNaoSeAplica,
          observacoes: safeObservacoes,
          file_blob: safeUploadBlob,
          file_name: fileName,
          mime_type: finalMime,
          storage_path: filePath,
          evidencia_url: previewUrl,
          numero_criterio: numCrit,
          status: 'pending',
          created_at: Date.now(),
          updated_at: nowIso,
          attempts: 0
        });
        touchAuditoriaTimestamp(auditIdToUse, nowIso);
      }

      // 4. Dispara evento de evidência anexada para atualização instantânea da aba Histórico de Documentação
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ms:evidence-uploaded', {
          detail: { perguntaId: canonicalId, auditoriaId: auditIdToUse, timestamp: nowIso }
        }));
        window.dispatchEvent(new CustomEvent('ms:outbox-changed'));
      }

      const deviceOnlineNow = typeof navigator !== 'undefined' ? navigator.onLine : isOnline;
      if (deviceOnlineNow && auditIdToUse && !auditIdToUse.startsWith('mock-') && !auditIdToUse.startsWith('assigned-pend-')) {
        // 5. FAST-PATH ONLINE DIRETO E BLINDADO:
        // Envia imediatamente ao Storage + faz upsert em respostas_auditoria no mesmo fluxo.
        // Se houver oscilação de rede no meio do caminho, o item já está salvo no sync_journal e o SyncEngine assume!
        let directSuccess = false;
        try {
          let finalRemoteUrl = '';
          const upRes = await supabase.storage
            .from('evidencias')
            .upload(filePath, safeUploadBlob, {
              cacheControl: '3600',
              upsert: true,
              contentType: finalMime
            });

          if (!upRes.error) {
            const { data: pubData } = supabase.storage.from('evidencias').getPublicUrl(filePath);
            finalRemoteUrl = pubData?.publicUrl || '';
          } else {
            const secRes = await supabase.storage
              .from('documentos-e-midias')
              .upload(filePath, safeUploadBlob, {
                cacheControl: '3600',
                upsert: true,
                contentType: finalMime
              });
            if (!secRes.error) {
              const { data: secPub } = supabase.storage.from('documentos-e-midias').getPublicUrl(filePath);
              finalRemoteUrl = secPub?.publicUrl || '';
            }
          }

          if (!finalRemoteUrl && previewUrl.startsWith('data:')) {
            finalRemoteUrl = previewUrl;
          }

          if (finalRemoteUrl) {
            // Consulta o estado fresco atualizado no momento exato do upsert para eliminar condição de corrida
            const freshCached = await db.cached_respostas.get([auditIdToUse, canonicalId]);
            const freshState = respostas[canonicalId] || respostas[id] || {};

            const freshConforme = freshCached?.conforme !== undefined && freshCached?.conforme !== null
              ? freshCached.conforme
              : (freshState.conforme !== undefined && freshState.conforme !== null ? freshState.conforme : safeConforme);

            const freshNaoSeAplica = freshCached?.nao_se_aplica !== undefined
              ? freshCached.nao_se_aplica
              : (freshState.nao_se_aplica !== undefined ? freshState.nao_se_aplica : safeNaoSeAplica);

            const freshObservacoes = freshCached?.observacoes !== undefined && freshCached?.observacoes !== ''
              ? freshCached.observacoes
              : (freshState.observacao || safeObservacoes);

            const payload = {
              auditoria_id: auditIdToUse,
              pergunta_id: canonicalId,
              conforme: freshConforme,
              nao_se_aplica: freshNaoSeAplica,
              observacoes: freshObservacoes,
              evidencia_url: finalRemoteUrl,
              updated_at: nowIso
            };

            let { error: dbErr } = await supabase
              .from('respostas_auditoria')
              .upsert(payload, { onConflict: 'auditoria_id,pergunta_id' });

            // Se a auditoria pai ainda não existia no banco remoto (FK 23503), cria e repete o upsert!
            if (dbErr && ((dbErr as any).code === '23503' || dbErr.message?.includes('auditoria_id'))) {
              const cachedAud = await db.cached_auditorias.get(auditIdToUse);
              const targetPropId = propriedadeId || cachedAud?.propriedade_id;
              if (targetPropId && !targetPropId.startsWith('mock-')) {
                await supabase.from('auditorias').upsert([{
                  id: auditIdToUse,
                  propriedade_id: targetPropId,
                  tecnico_responsavel_id: user?.id || cachedAud?.tecnico_responsavel_id || null,
                  status: modo === 'autoavaliacao' ? 'Autoavaliação' : 'Em Andamento',
                  data_agendamento: cachedAud?.data_agendamento || nowIso,
                  updated_at: nowIso
                }], { onConflict: 'id' });
                const retryUpsert = await supabase
                  .from('respostas_auditoria')
                  .upsert(payload, { onConflict: 'auditoria_id,pergunta_id' });
                dbErr = retryUpsert.error;
              }
            }

            if (!dbErr) {
              directSuccess = true;
              // Atualiza updated_at da auditoria remota
              supabase.from('auditorias').update({ updated_at: nowIso }).eq('id', auditIdToUse).then(() => {});

              // Atualiza cache local com a URL pública definitiva e remove do sync_journal para zerar a fila imediatamente!
              await db.cached_respostas.put({
                auditoria_id: auditIdToUse,
                pergunta_id: canonicalId,
                conforme: freshConforme,
                nao_se_aplica: freshNaoSeAplica,
                observacoes: freshObservacoes,
                evidencia_url: finalRemoteUrl,
                numero_criterio: numCrit,
                updated_at: nowIso,
                evidencia_uploaded_at: nowIso,
                data_envio: nowIso
              });
              await removeJournalItem(auditIdToUse, canonicalId);
              if (canonicalId !== id) {
                await removeJournalItem(auditIdToUse, id);
              }
              notifyOutboxChange();

              setRespostas(prev => {
                const curr = prev[canonicalId] || prev[id] || currentAns;
                const updated = {
                  ...prev,
                  [canonicalId]: {
                    ...curr,
                    conforme: freshConforme,
                    nao_se_aplica: freshNaoSeAplica,
                    observacao: freshObservacoes,
                    evidenciaUrl: finalRemoteUrl,
                    evidencia_uploaded_at: nowIso,
                    updated_at: nowIso
                  }
                };
                if (canonicalId !== id) updated[id] = updated[canonicalId];
                try { localStorage.setItem(getCacheKey(), JSON.stringify(updated)); } catch (e) {}
                return updated;
              });

              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('ms:evidence-uploaded', {
                  detail: { perguntaId: canonicalId, auditoriaId: auditIdToUse, timestamp: nowIso, url: finalRemoteUrl }
                }));
                window.dispatchEvent(new CustomEvent('ms:audit-updated', {
                  detail: { auditoriaId: auditIdToUse }
                }));
                window.dispatchEvent(new CustomEvent('ms:sync-complete', {
                  detail: { drainedCount: 1, errorCount: 0 }
                }));
              }
            }
          }
        } catch (directErr) {
          console.warn('[QuestionarioRTRS] Oscilação no upload direto; SyncEngine assumirá em background:', directErr);
        }

        // Dispara também syncNow(true) para drenar quaisquer outros itens pendentes na fila
        syncEngine.syncNow(true);
        if (directSuccess) {
          success('Evidência sincronizada com sucesso na nuvem!');
        } else {
          success('Evidência anexada e sincronizando em segundo plano...');
        }
      } else {
        success('Evidência salva no aparelho. O envio ocorrerá automaticamente assim que a conexão for restabelecida.');
      }
    } catch (err: any) {
      console.error('Erro ao processar evidência:', err);
      error('Falha ao anexar imagem de evidência.');
    } finally {
      setCameraLoadingId(null);
    }
  };

  const handleRemoveEvidencia = async (id: string) => {
    const inputEl = document.getElementById(`file-input-${id}`) as HTMLInputElement | null;
    if (inputEl) inputEl.value = '';

    // Exclusão Local-First Atômica (Dexie + Outbox + Supabase)
    await persistRespostaTransactional(id, { evidenciaUrl: null });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('ms:evidence-uploaded', { detail: { perguntaId: id } }));
      window.dispatchEvent(new CustomEvent('ms:outbox-changed'));
    }

    const isDeviceOnline = isOnline && (typeof navigator !== 'undefined' ? navigator.onLine : true);
    if (isDeviceOnline) {
      info('Evidência removida com sucesso.');
    } else {
      info('Evidência removida do aparelho.');
    }
  };

  const getOrCreateRealAuditoriaId = async (): Promise<string | null> => {
    let activeId = currentAuditoriaId;
    const isSynthetic = !activeId || activeId.startsWith('mock-') || activeId.startsWith('assigned-pend-');

    if (!isSynthetic && activeId) {
      return activeId;
    }

    const cleanName = (propriedadeNome || '').split('-')[0].trim();
    const cleanNameLower = cleanName.toLowerCase();

    // 1. Tentar resolver LOCALMENTE em db.cached_auditorias (0ms, 100% offline-first)
    try {
      const cachedAudits = await db.cached_auditorias.toArray();
      const match = cachedAudits.find(a => {
        const farmName = (a.propriedades?.nome_fazenda || '').toLowerCase();
        const matchesName = cleanNameLower && (farmName.includes(cleanNameLower) || cleanNameLower.includes(farmName));
        const matchesProp = propriedadeId && !propriedadeId.startsWith('mock-') && a.propriedade_id === propriedadeId;
        return matchesName || matchesProp;
      });

      if (match?.id && !match.id.startsWith('mock-') && !match.id.startsWith('assigned-pend-')) {
        console.log(`[QuestionarioRTRS] Auditoria resolvida localmente via Dexie: ${match.id} (${match.propriedades?.nome_fazenda})`);
        setCurrentAuditoriaId(match.id);
        return match.id;
      }
    } catch (localErr) {
      console.warn('[QuestionarioRTRS] Falha ao consultar cached_auditorias localmente:', localErr);
    }

    // 2. Se online, consultar Supabase
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      let targetPropId = propriedadeId;

      if (!targetPropId || targetPropId.startsWith('mock-')) {
        try {
          const { data: foundProp } = await supabase
            .from('propriedades')
            .select('id')
            .ilike('nome_fazenda', `%${cleanName}%`)
            .limit(1)
            .maybeSingle();

          if (foundProp?.id) {
            targetPropId = foundProp.id;
          } else {
            const { data: firstProp } = await supabase
              .from('propriedades')
              .select('id')
              .limit(1)
              .maybeSingle();
            if (firstProp?.id) targetPropId = firstProp.id;
          }
        } catch (e) {}
      }

      if (targetPropId && !targetPropId.startsWith('mock-')) {
        try {
          const { data: existingAudit } = await supabase
            .from('auditorias')
            .select('id')
            .eq('propriedade_id', targetPropId)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (existingAudit?.id) {
            activeId = existingAudit.id;
            setCurrentAuditoriaId(existingAudit.id);
          } else {
            const { data: newAudit, error: createError } = await supabase
              .from('auditorias')
              .insert([{
                propriedade_id: targetPropId,
                tecnico_responsavel_id: user?.id || null,
                status: modo === 'autoavaliacao' ? 'Autoavaliação' : 'Em Andamento',
                data_agendamento: new Date().toISOString()
              }])
              .select('id')
              .single();

            if (!createError && newAudit?.id) {
              activeId = newAudit.id;
              setCurrentAuditoriaId(newAudit.id);
            }
          }
        } catch (err) {
          console.warn('Erro ao resolver/criar auditoria remota:', err);
        }
      }
    }

    // 3. Contingência Offline Estrita: se ainda sintético ou sem ID, cria entrada em cached_auditorias
    if (isSynthetic || !activeId) {
      const stableOfflineId = generateUUID();
      try {
        await db.cached_auditorias.put({
          id: stableOfflineId,
          propriedade_id: propriedadeId || generateUUID(),
          status: modo === 'autoavaliacao' ? 'Autoavaliação' : 'Em Andamento',
          propriedades: {
            id: propriedadeId || generateUUID(),
            nome_fazenda: cleanName || 'Fazenda',
            nome_produtor: 'Produtor'
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        setCurrentAuditoriaId(stableOfflineId);
        return stableOfflineId;
      } catch (saveErr) {
        console.warn('[QuestionarioRTRS] Erro ao salvar auditoria offline de contingência:', saveErr);
        return stableOfflineId;
      }
    }

    return activeId;
  };

  const isPerguntaRespondida = (p: { id: string }) => {
    const r = respostas[p.id] || respostas[normalizePerguntaId(p.id)];
    return r && (r.nao_se_aplica === true || (r.conforme !== null && r.conforme !== undefined));
  };

  const handleGoToNextPending = () => {
    const next = perguntas.find(p => !isPerguntaRespondida(p));
    if (next) {
      if (showPanoramaView) {
        setShowPanoramaView(false);
      }
      if (next.secao && next.secao !== secaoAtiva) {
        setSecaoAtiva(next.secao);
      }
      setTimeout(() => {
        const el = document.getElementById(`pergunta-${next.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          el.classList.add('ring-2', 'ring-emerald-400');
          setTimeout(() => el.classList.remove('ring-2', 'ring-emerald-400'), 1500);
        }
      }, 150);
    }
  };

  const handleSavePartial = async () => {
    const answeredIds = Object.keys(respostas).filter(id => {
      const r = respostas[id];
      return r && (r.nao_se_aplica === true || (r.conforme !== null && r.conforme !== undefined));
    });
    if (answeredIds.length === 0) {
      warning('Responda ao menos um indicador para salvar o rascunho.');
      return;
    }

    try {
      localStorage.setItem(getCacheKey(), JSON.stringify(respostas));
    } catch (e) {}

    setSavingPartial(true);
    try {
      const activeId = await getOrCreateRealAuditoriaId();

      if (!activeId || activeId.startsWith('mock-') || activeId.startsWith('assigned-pend-')) {
        throw new Error('Não foi possível registrar ou vincular um ID de auditoria válido.');
      }

      for (const id of answeredIds) {
        const ans = respostas[id];
        const numCrit = perguntas.find(p => p.id === id)?.numero_criterio || '';
        await recordAuditChange({
          auditoria_id: activeId,
          pergunta_id: id,
          conforme: ans.conforme ?? false,
          nao_se_aplica: ans.nao_se_aplica ?? false,
          observacoes: ans.observacao || '',
          evidencia_url: ans.evidenciaUrl || null,
          numero_criterio: numCrit,
          status: 'pending',
          created_at: Date.now(),
          updated_at: new Date().toISOString(),
          attempts: 0
        });
      }

      if (modo === 'auditoria') {
        await enqueueMutation({
          table: 'auditorias',
          action: 'update',
          match_key: { id: activeId },
          payload: {
            id: activeId,
            status: 'Em Andamento',
            updated_at: new Date().toISOString(),
            ...(user?.id ? { tecnico_responsavel_id: user.id } : {})
          }
        });
      }

      touchAuditoriaTimestamp(activeId);

      const timeStr = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      setLastSavedTime(timeStr);

      const isDeviceOnline = isOnline && (typeof navigator !== 'undefined' ? navigator.onLine : true);

      if (isDeviceOnline) {
        syncEngine.syncNow(true);
        success(`Rascunho salvo e sincronizado às ${timeStr}!`);
      } else {
        success(`Rascunho salvo no aparelho às ${timeStr}. O envio ocorrerá automaticamente assim que a conexão for restabelecida.`);
      }
    } catch (err: any) {
      console.error('Erro ao salvar rascunho:', err);
      error('Falha ao salvar rascunho: ' + (err.message || 'Erro local'));
    } finally {
      setSavingPartial(false);
    }
  };

  const handleSubmit = async () => {
    const todasRespondidas = perguntas.every(isPerguntaRespondida);
    if (!todasRespondidas) {
      warning("Responda todas as perguntas antes de finalizar a auditoria.");
      return;
    }

    setLoading(true);

    try {
      const activeId = await getOrCreateRealAuditoriaId();
      if (!activeId || activeId.startsWith('mock-') || activeId.startsWith('assigned-pend-')) {
        throw new Error('Não foi possível registrar um ID de auditoria válido.');
      }

      // Gravar todas as respostas no Unified WAL via recordAuditChange (Idempotente)
      for (const p of perguntas) {
        const ans = respostas[p.id];
        await recordAuditChange({
          auditoria_id: activeId,
          pergunta_id: p.id,
          conforme: ans?.conforme ?? false,
          nao_se_aplica: ans?.nao_se_aplica ?? false,
          observacoes: ans?.observacao || '',
          evidencia_url: ans?.evidenciaUrl || null,
          numero_criterio: p.numero_criterio,
          status: 'pending',
          created_at: Date.now(),
          updated_at: new Date().toISOString(),
          attempts: 0
        });
      }

      // Enfileirar pendências automáticas APENAS para não-conformidades reais (exclui Não se Aplica)
      const naoConformes = perguntas.filter(p => {
        const ans = respostas[p.id];
        return ans && ans.conforme === false && !ans.nao_se_aplica;
      });
      if (naoConformes.length > 0) {
        let finalPropId = propriedadeId;
        if (!finalPropId || finalPropId.startsWith('mock-')) {
          const { data: auditData } = await supabase
            .from('auditorias')
            .select('propriedade_id')
            .eq('id', activeId)
            .single();
          finalPropId = auditData?.propriedade_id;
        }

        if (finalPropId) {
          for (const p of naoConformes) {
            await enqueueMutation({
              table: 'pendencias',
              action: 'upsert',
              on_conflict: 'propriedade_id,titulo',
              payload: {
                propriedade_id: finalPropId,
                titulo: `Não conformidade - Critério ${p.numero_criterio}`,
                descricao: `Ação necessária para atender ao critério ${p.numero_criterio}: "${p.enunciado}". Observação registrada: ${respostas[p.id]?.observacao || 'Nenhuma'}`,
                status: 'Pendente',
                prazo: p.ponderacao === 'Imediata' ? new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0] : new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0]
              }
            });
          }
        }
      }

      const nextStatus = modo === 'autoavaliacao' ? 'Concluída' : 'Aguardando Aprovação';
      await enqueueMutation({
        table: 'auditorias',
        action: 'update',
        match_key: { id: activeId },
        payload: {
          id: activeId,
          status: nextStatus,
          updated_at: new Date().toISOString()
        }
      });

      touchAuditoriaTimestamp(activeId);

      const isDeviceOnline = isOnline && (typeof navigator !== 'undefined' ? navigator.onLine : true);

      if (isDeviceOnline) {
        syncEngine.syncNow(true);
        success(modo === 'autoavaliacao' ? 'Autoavaliação concluída e sincronizada com sucesso!' : 'Relatório de Auditoria submetido com sucesso!');
      } else {
        success(
          modo === 'autoavaliacao'
            ? 'Autoavaliação salva no aparelho. O envio ocorrerá automaticamente assim que a conexão for restabelecida.'
            : 'Relatório de Auditoria gravado no aparelho. O envio ocorrerá automaticamente assim que a conexão for restabelecida.'
        );
      }

      onComplete();
    } catch (err: any) {
      console.error('Erro ao salvar auditoria:', err);
      error('Erro ao salvar auditoria: ' + (err.message || 'Erro local'));
    } finally {
      setLoading(false);
    }
  };

  const secoesUnicas = Array.from(new Set(perguntas.map(p => p.secao)));
  const perguntasFiltradas = perguntas.filter(p => p.secao === secaoAtiva);

  const totalPerguntas = perguntas.length;
  const totalRespondidas = perguntas.filter(isPerguntaRespondida).length;
  const percentualConcluido = totalPerguntas > 0 ? Math.round((totalRespondidas / totalPerguntas) * 100) : 0;

  const [showPanoramaView, setShowPanoramaView] = useState(false);
  const [hasAutoOpenedPanorama, setHasAutoOpenedPanorama] = useState(false);

  // Mapeia todas as perguntas e respostas ativas para a visão do Panorama RTRS
  const panoramaCriterios: PanoramaCriterioItem[] = useMemo(() => {
    return perguntas.map(p => {
      const canonId = normalizePerguntaId(p.id);
      const resp = respostas[canonId] || respostas[p.id];
      return {
        id: p.id,
        secao: p.secao,
        criterio: p.numero_criterio,
        enunciado: p.enunciado || p.criterio,
        conforme: resp?.conforme,
        nao_se_aplica: resp?.nao_se_aplica,
        observacao: resp?.observacao,
        evidencia: resp?.evidenciaUrl,
        ponderacao: p.ponderacao
      };
    });
  }, [perguntas, respostas]);

  // Transição automática para o Panorama assim que o técnico responde a última pergunta pendente
  useEffect(() => {
    if (totalPerguntas > 0 && totalRespondidas === totalPerguntas && !hasAutoOpenedPanorama) {
      setHasAutoOpenedPanorama(true);
      setShowPanoramaView(true);
      success('Todas as perguntas foram respondidas! Confira o Panorama & Score de Conformidade da fazenda.');
    }
  }, [totalRespondidas, totalPerguntas, hasAutoOpenedPanorama]);

  return createPortal(
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex justify-center items-center p-0 sm:p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-slate-50 w-full max-w-4xl h-full sm:h-auto sm:max-h-[92vh] rounded-none sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border-0 sm:border sm:border-emerald-100">
        
        {/* Cabeçalho do Modal com Alternador de Panorama & Pontuação */}
        <div className="bg-emerald-800 text-white px-3 py-2 sm:px-6 sm:py-3.5 flex items-center justify-between shrink-0 shadow-sm">
          <div className="min-w-0 flex-1 pr-2">
            <span className="text-[9px] sm:text-[10px] font-extrabold tracking-wider text-emerald-200 uppercase bg-emerald-900/60 px-2 py-0.5 rounded border border-emerald-700/50">
              {modo === 'autoavaliacao' ? 'Autoavaliação do Produtor' : 'Auditoria In Loco'}
            </span>
            <h2 className="text-sm sm:text-xl font-black text-white mt-0.5 leading-tight truncate">{propriedadeNome}</h2>
          </div>
          
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowPanoramaView(prev => !prev)}
              className={`px-2.5 py-1.5 rounded-xl font-extrabold text-[11px] sm:text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                showPanoramaView
                  ? 'bg-white text-emerald-950 ring-2 ring-emerald-300'
                  : 'bg-emerald-900/80 hover:bg-emerald-700/80 text-emerald-100 border border-emerald-600/50'
              }`}
              title="Alternar entre Perguntas e Panorama de Pontuação"
            >
              <Award className="w-3.5 h-3.5 text-[#C59B27]" />
              <span className="hidden sm:inline">{showPanoramaView ? 'Voltar aos Critérios' : 'Panorama & Score'}</span>
              <span className="sm:hidden">{showPanoramaView ? 'Critérios' : 'Score'}</span>
            </button>
            <button id="btn-fechar-x" onClick={onClose} aria-label="Fechar Questionario" title="Fechar Questionario" className="p-1.5 sm:p-2 hover:bg-emerald-700/60 rounded-xl transition-colors text-emerald-100 hover:text-white cursor-pointer shrink-0">
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>

{showPanoramaView ? (
          <div className="flex-1 overflow-y-auto p-3 sm:p-6">
            <PanoramaScoreRTRS
              propriedadeNome={propriedadeNome}
              criterios={panoramaCriterios}
              embedded={true}
              onBackToQuestions={() => setShowPanoramaView(false)}
              onSubmitAuditoria={handleSubmit}
              isSubmitting={loading}
              etapa={modo === 'autoavaliacao' ? 'Autoavaliação do Produtor' : 'Auditoria In Loco'}
            />
          </div>
        ) : (
          <>
                    {/* Banner em Destaque do Princípio Ativo (Compacto no Mobile) */}
        {secaoAtiva && (
          <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 text-white p-2.5 sm:p-5 shrink-0 border-b border-emerald-700 shadow-md">
            <div className="flex flex-row items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[9px] sm:text-[10px] font-black uppercase tracking-wider bg-emerald-700/80 text-emerald-100 px-2 py-0.5 rounded border border-emerald-600/50 shadow-xs">
                    P{secoesUnicas.indexOf(secaoAtiva) + 1} de {secoesUnicas.length}
                  </span>
                  <span className="text-[9px] sm:text-[11px] font-extrabold text-emerald-200 bg-black/20 px-2 py-0.5 rounded border border-white/10">
                    {perguntas.filter(p => p.secao === secaoAtiva && isPerguntaRespondida(p)).length}/{perguntas.filter(p => p.secao === secaoAtiva).length} respondidos
                  </span>
                </div>
                <h3 className="text-xs sm:text-xl font-black text-white leading-snug tracking-tight truncate mt-0.5 sm:mt-1">
                  {secaoAtiva}
                </h3>
              </div>

              {/* Botões de Navegação entre Princípios */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const idx = secoesUnicas.indexOf(secaoAtiva);
                    if (idx > 0) setSecaoAtiva(secoesUnicas[idx - 1]);
                  }}
                  disabled={secoesUnicas.indexOf(secaoAtiva) <= 0}
                  className="px-2 py-1.5 sm:px-3.5 sm:py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg sm:rounded-xl text-xs font-bold transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 border border-white/10"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Anterior</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    const idx = secoesUnicas.indexOf(secaoAtiva);
                    if (idx < secoesUnicas.length - 1) setSecaoAtiva(secoesUnicas[idx + 1]);
                  }}
                  disabled={secoesUnicas.indexOf(secaoAtiva) >= secoesUnicas.length - 1}
                  className="px-2.5 py-1.5 sm:px-4 sm:py-2 bg-emerald-400 hover:bg-emerald-300 text-emerald-950 font-black rounded-lg sm:rounded-xl text-xs transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1 shadow-md"
                >
                  <span className="hidden sm:inline">Próximo</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Tabs de Seleção Rápida dos 5 Princípios - Grid 5 no Mobile (100% visível) e Flex no Desktop */}
        <div className="bg-slate-100 border-b border-slate-200 p-1 sm:px-4 sm:py-2.5 shrink-0 grid grid-cols-5 gap-1 sm:flex sm:items-center sm:gap-1.5 sm:overflow-x-auto">
          {secoesUnicas.map((secao, idx) => {
            const isSelected = secaoAtiva === secao;
            const countSec = perguntas.filter(p => p.secao === secao).length;
            const countResp = perguntas.filter(p => p.secao === secao && isPerguntaRespondida(p)).length;
            const isDone = countSec > 0 && countResp === countSec;

            const shortTitles: Record<number, { full: string; mobile: string }> = {
              1: { full: 'Legislação', mobile: 'P1 Leg.' },
              2: { full: 'Trabalhista', mobile: 'P2 Trab.' },
              3: { full: 'Comunidade', mobile: 'P3 Com.' },
              4: { full: 'Meio Ambiente', mobile: 'P4 Amb.' },
              5: { full: 'Boas Práticas', mobile: 'P5 Agro' }
            };
            const titleInfo = shortTitles[idx + 1] || { full: `Princípio ${idx + 1}`, mobile: `P${idx + 1}` };

            return (
              <button
                key={secao}
                type="button"
                onClick={() => setSecaoAtiva(secao)}
                className={`py-1.5 px-0.5 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition-all flex flex-col sm:flex-row items-center justify-center gap-0.5 sm:gap-1.5 cursor-pointer border ${
                  isSelected
                    ? 'bg-emerald-800 text-white border-emerald-800 shadow-sm ring-2 ring-emerald-600/30'
                    : isDone
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-200/80'
                }`}
                title={titleInfo.full}
              >
                <div className="flex items-center gap-1">
                  <span className={`hidden sm:flex w-5 h-5 rounded-lg items-center justify-center text-[10px] font-black ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {idx + 1}
                  </span>
                  <span className="font-extrabold truncate">
                    <span className="inline sm:hidden">{titleInfo.mobile}</span>
                    <span className="hidden sm:inline">{titleInfo.full}</span>
                  </span>
                </div>
                {isDone ? (
                  <CheckCircle2 className={`w-3 h-3 sm:w-4 sm:h-4 shrink-0 ${isSelected ? 'text-emerald-300' : 'text-emerald-600'}`} />
                ) : (
                  <span className={`text-[8px] sm:text-[10px] px-1 py-0.2 rounded font-black leading-none ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'
                  }`}>
                    {countResp}/{countSec}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Barra de Progresso e Status de Sincronização — Travamento Rígido Anti-CLS (h-9 flex items-center) */}
        <div className="h-9 px-3 sm:px-6 bg-emerald-50/80 border-b border-emerald-100 flex items-center justify-between gap-2.5 text-[11px] sm:text-xs shrink-0 select-none overflow-hidden">
          <div className="flex items-center gap-2 min-w-0">
            <span className="font-bold text-emerald-900 flex items-center gap-1 shrink-0 text-[11px] sm:text-xs leading-none">
              <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full bg-emerald-600 animate-pulse shrink-0" />
              Progresso
            </span>

            {/* Status Pill com Dimensão Rígida e Cross-Fade Suave (min-w-[145px] justify-center) */}
            <div className="relative inline-flex items-center shrink-0">
              {isOnline ? (
                <span
                  className={`inline-flex items-center justify-center gap-1.5 h-6 min-w-[145px] px-2.5 rounded-full text-[10px] sm:text-[11px] font-extrabold leading-none border shrink-0 transition-opacity duration-200 ease-in-out select-none ${
                    isSyncing
                      ? 'bg-blue-100 text-blue-900 border-blue-300 shadow-xs'
                      : 'bg-emerald-100 text-emerald-800 border-emerald-300'
                  }`}
                >
                  {isSyncing ? (
                    <Loader2 className="w-3.5 h-3.5 flex-shrink-0 animate-spin text-blue-700" />
                  ) : (
                    <CloudCheck className="w-3.5 h-3.5 flex-shrink-0 text-emerald-600" />
                  )}
                  <span className="truncate leading-none">
                    {isSyncing ? 'Sincronizando...' : 'Nuvem Conectada'}
                  </span>
                </span>
              ) : (
                <span className="inline-flex items-center justify-center gap-1.5 h-6 min-w-[145px] px-2.5 rounded-full bg-amber-100 text-amber-900 text-[10px] sm:text-[11px] font-extrabold leading-none border border-amber-300 shrink-0 select-none animate-pulse transition-opacity duration-200">
                  <WifiOff className="w-3.5 h-3.5 flex-shrink-0 text-amber-700" />
                  <span className="truncate leading-none">Modo Campo (Offline)</span>
                </span>
              )}
            </div>

            {/* Contador Reativo da Fila Local com Dimensão Estabilizada */}
            {pendingCounts.total > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  (e.currentTarget as HTMLElement).blur();
                  if (isOnline && !isSyncing) {
                    syncEngine.syncNow(true);
                  }
                }}
                onMouseLeave={(e) => (e.currentTarget as HTMLElement).blur()}
                disabled={isSyncing}
                className={`inline-flex items-center justify-center gap-1.5 h-6 min-w-[125px] px-2.5 rounded-full text-[10px] sm:text-[11px] font-extrabold leading-none border shrink-0 transition-opacity duration-200 select-none ${
                  isOnline
                    ? 'bg-blue-50 text-blue-900 border-blue-300 hover:bg-blue-100 cursor-pointer shadow-xs active:scale-95'
                    : 'bg-amber-100 text-amber-900 border-amber-300 cursor-default'
                }`}
                title={
                  isOnline
                    ? `${pendingCounts.total} pendência(s) na fila local. Clique para forçar o envio imediato.`
                    : `${pendingCounts.total} pendência(s) salva(s) no aparelho. O envio ocorrerá automaticamente ao restabelecer a conexão.`
                }
              >
                {isSyncing ? (
                  <Loader2 className="w-3.5 h-3.5 flex-shrink-0 text-blue-700 animate-spin" />
                ) : (
                  <UploadCloud className="w-3.5 h-3.5 flex-shrink-0 text-blue-700" />
                )}
                <span className="truncate leading-none">{pendingCounts.total} na fila local</span>
              </button>
            )}
          </div>

          {/* Barra de Progresso Percentual e Contador Tabular Estabilizado */}
          <div className="flex items-center gap-2 w-28 sm:w-1/3 sm:max-w-xs shrink-0">
            <div className="w-full bg-emerald-200/60 h-2 sm:h-2.5 rounded-full overflow-hidden p-0.5 border border-emerald-200">
              <div
                className="bg-gradient-to-r from-emerald-600 to-teal-500 h-full transition-all duration-300 rounded-full"
                style={{ width: `${percentualConcluido}%` }}
              />
            </div>
            <span className="font-black text-emerald-800 min-w-[34px] text-right text-[11px] sm:text-xs tabular-nums leading-none shrink-0">
              {percentualConcluido}%
            </span>
          </div>
        </div>

        {/* Lista de Perguntas do Princípio (Área Principal com Espaço Maximizado) */}
        <div className="flex-1 overflow-y-auto p-2.5 sm:p-6 space-y-3 sm:space-y-6" style={{ contain: 'layout' }}>
          {loadingPerguntas || (syncingDb && Object.keys(respostas).length === 0) ? (
            <div className="py-6 space-y-4">
              <div className="flex items-center justify-center gap-3 text-emerald-800 bg-emerald-50/90 p-4 rounded-xl border border-emerald-200/80 animate-pulse shadow-xs">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                <span className="text-sm font-extrabold tracking-wide">Carregando questionário e dados da auditoria...</span>
              </div>

              {[1, 2].map((n) => (
                <div key={n} className="bg-white rounded-2xl border border-slate-200 p-4 space-y-3 animate-pulse shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="h-5 bg-slate-200 rounded-lg w-28" />
                    <div className="h-4 bg-emerald-100 rounded-full w-20" />
                  </div>
                  <div className="h-4 bg-slate-200 rounded-md w-4/5" />
                  <div className="grid grid-cols-2 gap-3 pt-2">
                    <div className="h-10 bg-slate-100 rounded-xl border border-slate-200" />
                    <div className="h-10 bg-slate-100 rounded-xl border border-slate-200" />
                  </div>
                </div>
              ))}
            </div>
          ) : perguntasFiltradas.length === 0 ? (
            <div className="py-16 text-center text-gray-500 font-medium">Nenhum critério nesta seção.</div>
          ) : (
            perguntasFiltradas.map((pergunta) => {
              const resposta = respostas[pergunta.id];
              const isConforme = resposta?.conforme === true && !resposta?.nao_se_aplica;
              const isNaoConforme = resposta?.conforme === false && !resposta?.nao_se_aplica;
              const isNaoSeAplica = !!resposta?.nao_se_aplica;

              return (
                <div key={pergunta.id} id={`pergunta-${pergunta.id}`} className={`bg-white rounded-xl sm:rounded-2xl border p-3.5 sm:p-5 transition-all shadow-sm ${
                  isConforme 
                    ? 'border-emerald-300 ring-1 ring-emerald-100 bg-emerald-50/10' 
                    : isNaoConforme 
                    ? 'border-red-300 ring-1 ring-red-100 bg-red-50/10' 
                    : isNaoSeAplica
                    ? 'border-slate-300 ring-1 ring-slate-100 bg-slate-50/25'
                    : 'border-gray-200 hover:border-emerald-200'
                }`}>
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] sm:text-xs font-black text-white bg-slate-800 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg">Indicador {pergunta.numero_criterio}</span>
                        <span className={`text-[9px] sm:text-[10px] font-extrabold px-1.5 py-0.5 rounded ${pergunta.ponderacao === 'Imediata' ? 'bg-red-100 text-red-700 border border-red-200' : pergunta.ponderacao === 'Curto Prazo' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-blue-100 text-blue-800 border border-blue-200'}`}>
                          {pergunta.ponderacao}
                        </span>
                        {isNaoSeAplica && (
                          <span className="text-[9px] sm:text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-300 flex items-center gap-1 shadow-2xs">
                            <MinusCircle className="w-3 h-3 text-slate-500" />
                            <span>Não se Aplica</span>
                          </span>
                        )}
                        {isConforme && (
                          <span className="text-[9px] sm:text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 shadow-2xs">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Conforme</span>
                          </span>
                        )}
                        {isNaoConforme && (
                          <span className="text-[9px] sm:text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-red-50 text-red-700 border border-red-200 flex items-center gap-1 shadow-2xs">
                            <AlertCircle className="w-3 h-3 text-red-600" />
                            <span>Não Conforme</span>
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <h3 className="text-xs sm:text-base font-bold text-gray-900 leading-snug">{pergunta.enunciado || pergunta.criterio}</h3>
                    
                    {(() => {
                      const parseOrientacoes = (orientacao?: string, interpretacao_nacional?: string) => {
                        let nat = (interpretacao_nacional || '').trim();
                        let ori = (orientacao || '').trim();

                        if (!nat && ori.includes('[INTERPRETAÇÃO NACIONAL - BRASIL]')) {
                          const parts = ori.split('[DIRETRIZES GERAIS]');
                          const natPart = parts[0].replace('[INTERPRETAÇÃO NACIONAL - BRASIL]', '').trim();
                          const genPart = parts[1] ? parts[1].trim() : '';
                          nat = natPart;
                          ori = genPart;
                        }

                        return {
                          interpretacaoNacional: nat,
                          orientacaoGeral: ori
                        };
                      };

                      const { interpretacaoNacional, orientacaoGeral } = parseOrientacoes(pergunta.orientacao, pergunta.interpretacao_nacional);
                      if (!interpretacaoNacional && !orientacaoGeral) return null;

                      return (
                        <div className="bg-slate-50 rounded-lg sm:rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                          <button 
                            type="button" 
                            onClick={() => setExpandedOrientacoes(prev => ({ ...prev, [pergunta.id]: !prev[pergunta.id] }))} 
                            className="w-full px-3 py-2 sm:px-4 sm:py-2.5 text-left text-xs font-bold text-slate-700 flex items-center justify-between hover:bg-slate-100/80 transition-colors cursor-pointer"
                          >
                            <span className="text-emerald-800 font-extrabold uppercase tracking-wide text-[11px]">
                              {expandedOrientacoes[pergunta.id] ? 'Ocultar Orientação' : 'Ver Orientação / Diretrizes'}
                            </span>
                            <span className="text-slate-400 font-extrabold text-sm">{expandedOrientacoes[pergunta.id] ? '−' : '+'}</span>
                          </button>
                          {expandedOrientacoes[pergunta.id] && (
                            <div className="px-3 py-3 sm:px-4 sm:py-3 space-y-2.5 border-t border-slate-200 bg-white">
                              {interpretacaoNacional && (
                                <div className="bg-gradient-to-br from-amber-50/90 to-amber-50/40 border border-amber-200/90 rounded-lg p-2.5 sm:p-3 shadow-2xs">
                                  <div className="flex items-center gap-1.5 text-[10px] font-black text-amber-900 uppercase tracking-wider mb-1">
                                    <span>🇧🇷</span>
                                    <span>Orientações para as Interpretações Nacionais (Brasil)</span>
                                  </div>
                                  <p className="text-[11px] sm:text-xs text-amber-950 leading-relaxed font-medium whitespace-pre-line">
                                    {interpretacaoNacional}
                                  </p>
                                </div>
                              )}
                              {orientacaoGeral && (
                                <div className="bg-slate-50/70 border border-slate-200/70 rounded-lg p-2.5 sm:p-3 shadow-2xs">
                                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                                    <span>📋</span>
                                    <span>Diretrizes e Orientações Gerais</span>
                                  </div>
                                  <p className="text-[11px] sm:text-xs text-slate-700 leading-relaxed font-medium whitespace-pre-line">
                                    {orientacaoGeral}
                                  </p>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                    
                    <div className="grid grid-cols-3 gap-1.5 sm:gap-3 pt-1">
                      <button 
                        type="button" 
                        onClick={() => handleResposta(pergunta.id, true)} 
                        className={`py-2 px-1.5 sm:py-3 sm:px-4 rounded-xl font-extrabold text-[10px] sm:text-xs transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 cursor-pointer text-center ${
                          isConforme 
                            ? 'bg-emerald-600 text-white shadow-md ring-2 ring-emerald-600 ring-offset-1 scale-[1.01]' 
                            : 'bg-white border-2 border-emerald-200 text-emerald-800 hover:bg-emerald-50'
                        }`}
                      >
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span className="leading-tight">Sim, Conforme</span>
                      </button>

                      <button 
                        type="button" 
                        onClick={() => handleResposta(pergunta.id, false)} 
                        className={`py-2 px-1.5 sm:py-3 sm:px-4 rounded-xl font-extrabold text-[10px] sm:text-xs transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 cursor-pointer text-center ${
                          isNaoConforme 
                            ? 'bg-red-600 text-white shadow-md ring-2 ring-red-600 ring-offset-1 scale-[1.01]' 
                            : 'bg-white border-2 border-red-200 text-red-800 hover:bg-red-50'
                        }`}
                      >
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span className="leading-tight">Não Conforme</span>
                      </button>

                      <button 
                        type="button" 
                        onClick={() => handleResposta(pergunta.id, 'nao_se_aplica')} 
                        className={`py-2 px-1.5 sm:py-3 sm:px-4 rounded-xl font-extrabold text-[10px] sm:text-xs transition-all flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-1.5 cursor-pointer text-center ${
                          isNaoSeAplica 
                            ? 'bg-slate-700 text-white shadow-md ring-2 ring-slate-700 ring-offset-1 scale-[1.01]' 
                            : 'bg-white border-2 border-slate-300 text-slate-700 hover:bg-slate-100 hover:border-slate-400'
                        }`}
                      >
                        <MinusCircle className="w-4 h-4 shrink-0" />
                        <span className="leading-tight">Não se Aplica</span>
                      </button>
                    </div>

                    {(isConforme || isNaoConforme || isNaoSeAplica) && (
                      <div className="mt-1 pt-3 border-t border-gray-100 space-y-2.5 animate-fadeIn">
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">
                            Observações do Inspetor
                            {isNaoSeAplica && (
                              <span className="ml-1.5 text-[11px] font-medium text-slate-500">
                                (Justificativa da inaplicabilidade)
                              </span>
                            )}
                          </label>
                          <textarea 
                            rows={2} 
                            value={resposta?.observacao || ''} 
                            onChange={(e) => handleObservacao(pergunta.id, e.target.value)}
                            placeholder={isNaoSeAplica ? "Descreva resumidamente por que este indicador não se aplica a esta propriedade..." : "Detalhe as condições observadas..."}
                            className="w-full p-2.5 bg-white border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition-all" 
                          />
                        </div>
                        
                        <div>
                          {cameraLoadingId === pergunta.id ? (
                            <div className="flex items-center gap-2.5 bg-amber-50 p-2.5 rounded-xl border border-amber-200 shadow-sm animate-pulse">
                              <Loader2 className="w-4 h-4 animate-spin text-amber-600 shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-amber-900">Sincronizando arquivo na nuvem...</p>
                                <p className="text-[10px] text-amber-700">Aguarde o término do envio antes de prosseguir.</p>
                              </div>
                            </div>
                          ) : !resposta?.evidenciaUrl ? (
                            <div>
                              <input 
                                type="file" 
                                id={`file-input-${pergunta.id}`} 
                                accept="image/png,image/jpeg,image/jpg,image/webp,image/*,application/pdf" 
                                className="hidden" 
                                onChange={async (e) => { 
                                  const inputEl = e.currentTarget;
                                  const file = inputEl.files?.[0]; 
                                  if (file) {
                                    await handleUploadEvidencia(pergunta.id, file); 
                                  }
                                  try { inputEl.value = ''; } catch {}
                                }} 
                              />
                              <button type="button" onClick={() => document.getElementById(`file-input-${pergunta.id}`)?.click()} className="w-full flex items-center justify-center gap-1.5 py-2 border-2 border-dashed border-emerald-300 bg-emerald-50/50 text-emerald-700 rounded-xl hover:bg-emerald-100 hover:border-emerald-400 transition-all font-bold cursor-pointer text-xs">
                                <Camera className="w-4 h-4 text-emerald-600 shrink-0" />
                                <span>{modo === 'autoavaliacao' ? 'Enviar Evidência (PNG, JPEG ou PDF)' : 'Tirar Foto / Enviar Evidência (PNG, JPEG ou PDF)'}</span>
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-emerald-200 shadow-sm">
                              <div className="bg-emerald-100 rounded-lg overflow-hidden w-9 h-9 flex items-center justify-center shrink-0 cursor-pointer hover:opacity-85 transition-opacity border border-emerald-200" onClick={() => handleOpenEvidencia(resposta.evidenciaUrl!, pergunta.id)}>
                                {isPdfEvidence(resposta.evidenciaUrl) ? (
                                  <FileText className="w-4 h-4 text-emerald-700" />
                                ) : (
                                  <img 
                                    src={cleanEvidenceUrl(resposta.evidenciaUrl) || resposta.evidenciaUrl} 
                                    alt="Evidência" 
                                    className="w-full h-full object-cover" 
                                    onError={async (e) => {
                                      const target = e.currentTarget;
                                      const recovered = await resolveEvidenceUrlAsync({
                                        url: resposta.evidenciaUrl,
                                        auditoriaId: currentAuditoriaId || auditoriaId,
                                        perguntaId: pergunta.id
                                      });
                                      if (recovered && recovered !== target.src) {
                                        target.src = recovered;
                                        return;
                                      }
                                      target.style.display = 'none';
                                      const parent = target.parentElement;
                                      if (parent && !parent.querySelector('.broken-indicator')) {
                                        parent.classList.add('bg-amber-50');
                                        const indicator = document.createElement('span');
                                        indicator.className = 'broken-indicator text-[10px] font-extrabold text-amber-700';
                                        indicator.innerText = 'FOTO';
                                        parent.appendChild(indicator);
                                      }
                                    }}
                                  />
                                )}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-gray-900 truncate">Evidência Anexada</p>
                                <button type="button" onClick={() => handleOpenEvidencia(resposta.evidenciaUrl!, pergunta.id)} className="text-[10px] text-emerald-700 underline font-bold hover:text-emerald-900 cursor-pointer block mt-0.5 text-left">Ver Arquivo Enviado</button>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                <button type="button" title="Remover e anexar novamente" onClick={() => handleRemoveEvidencia(pergunta.id)} className="text-gray-400 hover:text-red-500 transition-colors p-1 rounded-lg hover:bg-red-50 cursor-pointer"><X className="w-4 h-4" /></button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>


          </>
        )}
                {/* Rodapé Único e Inteligente: Salvamento Automático & Submissão 100% */}
        <div className="px-3 py-2.5 sm:px-6 sm:py-4 bg-white border-t border-slate-200 shrink-0 flex flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-slate-500 min-w-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className="font-semibold text-slate-600 truncate text-[11px] sm:text-xs">
              {lastSavedTime ? `Salvo automaticamente às ${lastSavedTime}` : 'Salvo automaticamente em tempo real'}
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              type="button"
              id="btn-fechar-questionario"
              onClick={onClose}
              className="px-3.5 sm:px-5 py-2 sm:py-2.5 bg-white hover:bg-slate-100 text-slate-700 rounded-xl sm:rounded-2xl font-extrabold text-xs border border-slate-300 transition-all duration-300 hover:scale-102 active:scale-95 cursor-pointer shadow-2xs flex items-center justify-center"
            >
              <span>Fechar</span>
            </button>

            {showPanoramaView && (
              <button
                type="button"
                onClick={() => setShowPanoramaView(false)}
                className="px-3.5 sm:px-4 py-2 sm:py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl sm:rounded-2xl font-extrabold text-xs border border-slate-300/80 transition-all duration-300 hover:scale-102 active:scale-95 cursor-pointer shadow-2xs flex items-center justify-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="hidden sm:inline">Voltar aos Critérios</span>
                <span className="sm:hidden">Critérios</span>
              </button>
            )}

            {/* Enquanto houver critérios sem resposta, exibe 'Próximo Pendente' */}
            {totalRespondidas < totalPerguntas ? (
              <button
                type="button"
                onClick={handleGoToNextPending}
                className="group relative px-4 sm:px-5 py-2 sm:py-2.5 bg-gradient-to-r from-amber-600 to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white rounded-xl sm:rounded-2xl font-extrabold text-xs shadow-md shadow-amber-600/20 hover:shadow-xl hover:scale-102 active:scale-95 transition-all duration-300 flex items-center justify-center gap-1.5 cursor-pointer overflow-hidden"
              >
                <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                <ArrowRight className="w-3.5 h-3.5 shrink-0 transition-transform group-hover:translate-x-1 duration-300" />
                <span>
                  Próximo Pendente ({totalPerguntas - totalRespondidas})
                </span>
              </button>
            ) : (
              /* Liberado exclusivamente com 100% dos indicadores preenchidos */
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || loadingPerguntas || perguntas.length === 0}
                className="group relative px-5 sm:px-6 py-2 sm:py-2.5 bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white rounded-xl sm:rounded-2xl font-extrabold text-xs shadow-md shadow-[#1B7547]/20 hover:shadow-xl hover:scale-102 active:scale-95 transition-all duration-300 flex justify-center items-center gap-2 disabled:opacity-60 cursor-pointer overflow-hidden"
              >
                <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submetendo...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-300 shrink-0 transition-transform group-hover:scale-110 duration-300" />
                    <span>Submeter Vistoria RTRS</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Modal Lightbox de Foto Ampliada em Portal z-[9999] */}
      {fotoAmpliada && createPortal(
        <div 
          className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fadeIn transition-all" 
          onClick={() => {
            setFotoAmpliada(null);
            setImageLoadError(false);
            setIsRecoveringEvidence(false);
          }}
        >
          <div 
            className="relative max-w-4xl max-h-[90vh] flex flex-col items-center bg-slate-900/90 p-4 rounded-3xl border border-slate-700 shadow-2xl" 
            onClick={e => e.stopPropagation()}
          >
            <button 
              type="button" 
              onClick={() => {
                setFotoAmpliada(null);
                setImageLoadError(false);
                setIsRecoveringEvidence(false);
              }} 
              className="absolute -top-3 -right-3 text-white bg-slate-800 hover:bg-slate-700 p-2 rounded-full transition-all cursor-pointer shadow-xl border border-slate-600 z-10"
              title="Fechar"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="relative max-h-[75vh] overflow-hidden rounded-2xl flex items-center justify-center bg-slate-950 min-w-[320px] min-h-[240px]">
              {isRecoveringEvidence ? (
                <div className="p-8 text-center text-slate-400 flex flex-col items-center gap-2">
                  <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                  <span className="text-xs font-bold">Localizando arquivo de evidência...</span>
                </div>
              ) : imageLoadError ? (
                <div className="p-8 text-center max-w-md bg-slate-900/95 rounded-2xl border border-red-500/40">
                  <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-2" />
                  <p className="font-extrabold text-sm text-red-300 mb-1">Prévia Indisponível no Momento</p>
                  <p className="text-xs text-slate-400 mb-4">
                    O arquivo de imagem local não pôde ser carregado diretamente nesta sessão.
                  </p>
                  <button
                    type="button"
                    onClick={async () => {
                      setIsRecoveringEvidence(true);
                      setImageLoadError(false);
                      const recovered = await resolveEvidenceUrlAsync({
                        url: fotoAmpliada,
                        auditoriaId: currentAuditoriaId || auditoriaId,
                        perguntaId: activeModalPerguntaId
                      });
                      setIsRecoveringEvidence(false);
                      if (recovered && recovered !== fotoAmpliada) {
                        setFotoAmpliada(recovered);
                      } else {
                        setImageLoadError(true);
                      }
                    }}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer"
                  >
                    Tentar Recarregar Evidência
                  </button>
                </div>
              ) : (
                <img 
                  src={fotoAmpliada} 
                  alt="Evidência Ampliada" 
                  onError={async () => {
                    console.warn('[QuestionarioRTRS] Erro ao carregar fotoAmpliada:', fotoAmpliada);
                    // Tenta auto-recuperação automática silenciosa
                    if (activeModalPerguntaId && (currentAuditoriaId || auditoriaId)) {
                      setIsRecoveringEvidence(true);
                      try {
                        const recovered = await resolveEvidenceUrlAsync({
                          url: fotoAmpliada,
                          auditoriaId: currentAuditoriaId || auditoriaId,
                          perguntaId: activeModalPerguntaId
                        });
                        if (recovered && recovered !== fotoAmpliada) {
                          setFotoAmpliada(recovered);
                          setIsRecoveringEvidence(false);
                          return;
                        }
                      } catch (recErr) {
                        console.warn('[QuestionarioRTRS] Falha na auto-recuperação de foto:', recErr);
                      }
                      setIsRecoveringEvidence(false);
                    }
                    setImageLoadError(true);
                  }}
                  className="max-w-full max-h-[75vh] object-contain rounded-xl" 
                />
              )}
            </div>

            <div className="mt-3 flex items-center justify-between w-full px-2 gap-4">
              <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Evidência Comprovatória de Conformidade
              </span>
              {fotoAmpliada && fotoAmpliada.startsWith('http') && !fotoAmpliada.includes('data:image/svg') && (
                <a 
                  href={fotoAmpliada} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="text-xs text-emerald-400 hover:text-white underline font-bold flex items-center gap-1 bg-white/10 px-3 py-1.5 rounded-full border border-white/10 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Abrir em nova guia</span>
                </a>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Viewer de PDF */}
      {pdfAmpliado && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fadeIn" onClick={() => setPdfAmpliado(null)}>
          <div className="relative w-full max-w-5xl h-[88vh] flex flex-col bg-slate-900 rounded-2xl overflow-hidden border border-slate-700 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-3.5 bg-slate-800 border-b border-slate-700 text-white">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-400" />
                <span className="font-bold text-sm">Visualizador de Documento PDF</span>
              </div>
              <div className="flex items-center gap-3">
                <a
                  href={pdfAmpliado}
                  download="documento.pdf"
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  <span>Baixar / Abrir PDF</span>
                </a>
                <button type="button" onClick={() => setPdfAmpliado(null)} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer">
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            <div className="flex-1 w-full h-full bg-slate-950">
              <iframe src={pdfAmpliado} className="w-full h-full border-none" title="Documento PDF" />
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}

import { RTRS_CRITERIO_TO_UUID, normalizePerguntaId } from '../constants/rtrsMapping';
import { supabase } from '../lib/supabase';
import { resolveFarmEtapa } from '../lib/etapaUtils';
import {
  db,
  bulkSavePerguntas,
  getAllCachedPerguntas,
  bulkSaveAuditorias,
  bulkSaveRespostas,
  bulkSavePendencias,
  saveAppMetadata,
  getAppMetadata,
  cacheReadData,
  getPendingEvidenceKeys,
  type CachedPergunta,
  type CachedAuditoria,
  type CachedResposta,
  type CachedPendencia
} from '../lib/offlineDb';

// Importa os catálogos mestres compilados como contingência garantida (Zero Skeleton / 0ms)
import rtrsQuestionsJson from '../data/rtrs_questions.json';
import defaultAuditoriasJson from '../data/default_auditorias.json';

export interface PrecacheResult {
  success: boolean;
  perguntasCount: number;
  propriedadesCount: number;
  auditoriasCount: number;
  respostasCount: number;
  pendenciasCount: number;
  timestamp: string;
  error?: string;
}

/**
 * Garante que a tabela cached_perguntas tenha os 115 critérios RTRS
 * utilizando o arquivo JSON local caso o Dexie esteja vazio.
 */
export async function seedDefaultRTRSQuestions(): Promise<CachedPergunta[]> {
  const existing = await getAllCachedPerguntas();
  const hasLegacySyntheticIds = existing && existing.some(p => p.id && p.id.startsWith('rtrs-criterio-'));
  if (existing && existing.length > 0 && !hasLegacySyntheticIds) {
    return existing;
  }

  if (hasLegacySyntheticIds) {
    console.log('[Precache] Detectadas perguntas com IDs sintéticos antigos. Remigrando para UUIDs de produção...');
    await db.cached_perguntas.clear();
  }

  console.log('[Precache] Semeando 115 perguntas RTRS a partir do catálogo mestre local com UUIDs de produção...');
  const seededPerguntas: CachedPergunta[] = (rtrsQuestionsJson as any[]).map((q, idx) => {
    const canonicalId = q.id || RTRS_CRITERIO_TO_UUID[q.numero_criterio] || normalizePerguntaId(q.numero_criterio);
    return {
      id: canonicalId,
      secao: q.principle || q.secao || '',
      criterio: q.criterion || q.criterio || '',
      numero_criterio: q.numero_criterio || '',
      enunciado: q.enunciado || '',
      ponderacao: q.ponderacao || 'Imediata',
      orientacao: q.orientacao || '',
      interpretacao_nacional: q.interpretacao_nacional || '',
      ativo: true,
      ordem: idx + 1
    };
  });

  await bulkSavePerguntas(seededPerguntas);
  console.log(`[Precache] ${seededPerguntas.length} perguntas RTRS semeadas com sucesso no IndexedDB.`);
  return seededPerguntas;
}

/**
 * Garante que a tabela cached_auditorias tenha as auditorias e fazendas
 * com propriedades aninhadas e etapas calculadas para uso imediato em 0ms.
 */
export async function seedDefaultAuditorias(): Promise<CachedAuditoria[]> {
  const existing = await db.cached_auditorias.toArray();
  if (existing && existing.length > 0) {
    return existing;
  }

  console.log('[Precache] Semeando auditorias e fazendas padrão no IndexedDB a partir do catálogo mestre local...');
  const seededAuditorias: CachedAuditoria[] = (defaultAuditoriasJson as any[]).map(a => {
    const propFound = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
    const propId = a.propriedade_id || propFound?.id;
    const resolvedEtapa = resolveFarmEtapa(propId, propFound?.etapa, a.etapa);

    return {
      id: a.id,
      propriedade_id: propId,
      tecnico_responsavel_id: a.tecnico_responsavel_id,
      data_agendamento: a.data_agendamento,
      status: a.status || 'EM ANDAMENTO',
      etapa: resolvedEtapa || 'Prospecção',
      ultima_alteracao_at: a.ultima_alteracao_at || a.updated_at || a.created_at,
      propriedades: propFound || { nome_fazenda: 'Fazenda', nome_produtor: 'Produtor' },
      created_at: a.created_at,
      updated_at: a.updated_at
    };
  });

  await bulkSaveAuditorias(seededAuditorias);
  console.log(`[Precache] ${seededAuditorias.length} auditorias/fazendas semeadas com sucesso no IndexedDB.`);
  return seededAuditorias;
}

/**
 * Hidratação leve e não-bloqueante em background pós-login/startup
 */
export async function hydrateAuditoriasCache(): Promise<CachedAuditoria[]> {
  try {
    // 1. Garante que se o Dexie estiver vazio, seja populado imediatamente (0ms)
    const count = await db.cached_auditorias.count();
    if (count === 0) {
      await seedDefaultAuditorias();
    }

    // 2. Se estiver offline, retorna imediatamente o cache Dexie
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return await db.cached_auditorias.toArray();
    }

    // 3. Em segundo plano se online, revalida com o Supabase
    const { data: auditsData, error: audErr } = await supabase
      .from('auditorias')
      .select(`
        id,
        data_agendamento,
        status,
        etapa,
        tecnico_responsavel_id,
        propriedade_id,
        created_at,
        updated_at,
        propriedades (
          id,
          nome_fazenda,
          nome_produtor,
          codigo_car,
          codigo_sigef,
          municipio,
          geom,
          etapa,
          created_at,
          updated_at
        )
      `)
      .order('updated_at', { ascending: false });

    if (!audErr && auditsData && auditsData.length > 0) {
      const mapped: CachedAuditoria[] = auditsData.map((a: any) => {
        const propFound = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
        const propId = a.propriedade_id || propFound?.id;
        const resolvedEtapa = resolveFarmEtapa(propId, propFound?.etapa, a.etapa);
        return {
          id: a.id,
          propriedade_id: propId,
          tecnico_responsavel_id: a.tecnico_responsavel_id,
          data_agendamento: a.data_agendamento,
          status: a.status,
          etapa: resolvedEtapa,
          propriedades: propFound || { nome_fazenda: 'Fazenda', nome_produtor: 'Produtor' },
          created_at: a.created_at,
          updated_at: a.updated_at,
          ultima_alteracao_at: a.updated_at || a.created_at
        };
      });
      await bulkSaveAuditorias(mapped);
      return mapped;
    }
  } catch (err) {
    console.warn('[Precache] Falha não-fatal na hidratação em segundo plano:', err);
  }
  return await db.cached_auditorias.toArray();
}

/**
 * Rotina Completa de Pré-carregamento ("Preparar Modo Campo")
 * Baixa e armazena no IndexedDB:
 * 1. Catálogo RTRS completo
 * 2. Propriedades rurais
 * 3. Auditorias e fazendas vinculadas
 * 4. Respostas anteriores registradas
 * 5. Pendências em aberto
 */
export async function prepareFieldModeData(user?: any): Promise<PrecacheResult> {
  console.log('[Precache] Iniciando preparação de dados para Modo Campo...');
  const timestamp = new Date().toISOString();
  let perguntasCount = 0;
  let propriedadesCount = 0;
  let auditoriasCount = 0;
  let respostasCount = 0;
  let pendenciasCount = 0;

  try {
    // 1. Perguntas RTRS
    try {
      const { data: cloudPerguntas, error: pErr } = await supabase
        .from('perguntas_rtrs')
        .select('*')
        .eq('ativo', true);

      if (!pErr && cloudPerguntas && cloudPerguntas.length > 0) {
        const mappedPerguntas: CachedPergunta[] = cloudPerguntas.map((q: any) => ({
          id: q.id,
          secao: q.secao,
          numero_criterio: q.numero_criterio,
          criterio: q.criterio,
          enunciado: q.enunciado,
          ponderacao: q.ponderacao,
          orientacao: q.orientacao,
          interpretacao_nacional: q.interpretacao_nacional,
          ativo: q.ativo !== false,
          ordem: q.ordem || 0
        }));
        await bulkSavePerguntas(mappedPerguntas);
        perguntasCount = mappedPerguntas.length;
      } else {
        const local = await seedDefaultRTRSQuestions();
        perguntasCount = local.length;
      }
    } catch (e) {
      console.warn('[Precache] Erro ao buscar perguntas online, usando seed local:', e);
      const local = await seedDefaultRTRSQuestions();
      perguntasCount = local.length;
    }

    // 2. Propriedades
    let propsList: any[] = [];
    try {
      const { data: propsData, error: propsErr } = await supabase
        .from('propriedades')
        .select('id, nome_fazenda, nome_produtor, codigo_car, codigo_sigef, municipio, geom, etapa, produtor_id, created_at, updated_at');

      if (!propsErr && propsData) {
        propriedadesCount = propsData.length;
        propsList = propsData;
        await cacheReadData('tecnico_propriedades', propsData);
      }
    } catch (e) {
      console.warn('[Precache] Falha ao baixar propriedades:', e);
    }

    // 3. Auditorias e Fazendas
    try {
      const { data: auditsData, error: audErr } = await supabase
        .from('auditorias')
        .select(`
          id,
          data_agendamento,
          status,
          etapa,
          tecnico_responsavel_id,
          propriedade_id,
          created_at,
          updated_at,
          propriedades (
            id,
            nome_fazenda,
            nome_produtor,
            codigo_car,
            codigo_sigef,
            municipio,
            geom,
            etapa,
            created_at,
            updated_at
          )
        `)
        .order('updated_at', { ascending: false });

      if (!audErr && auditsData && auditsData.length > 0) {
        const cachedAudits: CachedAuditoria[] = auditsData.map((a: any) => {
          const propFound = Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades;
          const propId = a.propriedade_id || propFound?.id;
          const resolvedEtapa = resolveFarmEtapa(propId, propFound?.etapa, a.etapa);
          return {
            id: a.id,
            propriedade_id: propId,
            tecnico_responsavel_id: a.tecnico_responsavel_id,
            data_agendamento: a.data_agendamento,
            status: a.status,
            etapa: resolvedEtapa,
            propriedades: propFound || { nome_fazenda: 'Fazenda', nome_produtor: 'Produtor' },
            created_at: a.created_at,
            updated_at: a.updated_at,
            ultima_alteracao_at: a.updated_at || a.created_at
          };
        });

        // Adiciona propriedades sem auditoria registrada como mock-audit
        const existingPropIds = new Set(cachedAudits.map(ca => ca.propriedade_id));
        propsList.forEach(p => {
          if (!existingPropIds.has(p.id)) {
            cachedAudits.push({
              id: `mock-audit-${p.id}`,
              propriedade_id: p.id,
              tecnico_responsavel_id: user?.id || null,
              data_agendamento: new Date().toISOString(),
              status: 'Autoavaliação',
              etapa: resolveFarmEtapa(p.id, p.etapa),
              ultima_alteracao_at: p.updated_at || p.created_at,
              propriedades: p
            });
          }
        });

        auditoriasCount = cachedAudits.length;
        await bulkSaveAuditorias(cachedAudits);
      } else {
        const local = await seedDefaultAuditorias();
        auditoriasCount = local.length;
      }
    } catch (e) {
      console.warn('[Precache] Falha ao baixar auditorias online, usando seed local:', e);
      const local = await seedDefaultAuditorias();
      auditoriasCount = local.length;
    }

    // 4. Respostas já gravadas
    try {
      const { data: respData, error: rErr } = await supabase
        .from('respostas_auditoria')
        .select('auditoria_id, pergunta_id, conforme, observacoes, evidencia_url, updated_at');

      if (!rErr && respData) {
        respostasCount = respData.length;
        const existingLocal = await db.cached_respostas.toArray();
        const existingMap = new Map<string, CachedResposta>();
        existingLocal.forEach(el => existingMap.set(`${el.auditoria_id}-${el.pergunta_id}`, el));

        const [localJournal, pendingEvidenceKeys] = await Promise.all([
          db.sync_journal.toArray(),
          getPendingEvidenceKeys()
        ]);
        const deletedEvidenceKeys = new Set<string>();
        localJournal.forEach(j => {
          if (j.is_explicit_delete || j.evidencia_url === null) {
            deletedEvidenceKeys.add(`${j.auditoria_id}_${normalizePerguntaId(j.pergunta_id)}`);
          }
        });

        const mappedResps: CachedResposta[] = respData.map((r: any) => {
          const canonPergId = normalizePerguntaId(r.pergunta_id);
          const strictKey = `${r.auditoria_id}_${canonPergId}`;
          const localItem = existingMap.get(`${r.auditoria_id}-${r.pergunta_id}`) || existingMap.get(`${r.auditoria_id}-${canonPergId}`);

          let finalEvUrl = r.evidencia_url;
          // Se foi explicitamente deletado localmente, mantém null absoluto (não ressuscita)
          if (deletedEvidenceKeys.has(strictKey)) {
            finalEvUrl = null;
          } else if (!finalEvUrl && localItem?.evidencia_url && pendingEvidenceKeys.has(strictKey)) {
            // Só preserva URL local se ela for uma evidência ativamente pendente de envio!
            finalEvUrl = localItem.evidencia_url;
          }

          return {
            auditoria_id: r.auditoria_id,
            pergunta_id: canonPergId,
            conforme: r.conforme,
            nao_se_aplica: !!r.nao_se_aplica,
            observacoes: r.observacoes || '',
            evidencia_url: finalEvUrl,
            updated_at: r.updated_at,
            evidencia_uploaded_at: localItem?.evidencia_uploaded_at || null,
            data_envio: localItem?.data_envio || null
          };
        });

        // Preserva respostas locais pendentes no journal que ainda não constam na nuvem
        localJournal.forEach(j => {
          if (j.auditoria_id && j.pergunta_id) {
            const canonId = normalizePerguntaId(j.pergunta_id);
            const exists = mappedResps.some(m => m.auditoria_id === j.auditoria_id && m.pergunta_id === canonId);
            if (!exists) {
              mappedResps.push({
                auditoria_id: j.auditoria_id,
                pergunta_id: canonId,
                conforme: j.conforme ?? false,
                nao_se_aplica: !!j.nao_se_aplica,
                observacoes: j.observacoes || '',
                evidencia_url: j.is_explicit_delete ? null : (j.evidencia_url || null),
                updated_at: j.updated_at,
                evidencia_uploaded_at: j.updated_at,
                data_envio: j.updated_at
              });
            }
          }
        });

        await bulkSaveRespostas(mappedResps);
      }
    } catch (e) {
      console.warn('[Precache] Falha ao baixar respostas anteriores:', e);
    }

    // 5. Pendências
    try {
      const { data: pendData, error: pErr } = await supabase
        .from('pendencias')
        .select('*');

      if (!pErr && pendData) {
        pendenciasCount = pendData.length;
        const mappedPends: CachedPendencia[] = pendData.map((p: any) => ({
          id: p.id,
          propriedade_id: p.propriedade_id,
          auditoria_id: p.auditoria_id,
          titulo: p.titulo,
          descricao: p.descricao,
          status: p.status,
          prazo: p.prazo,
          gravidade: p.gravidade,
          evidencia_url: p.evidencia_url,
          resolucao_descricao: p.resolucao_descricao,
          motivo_rejeicao: p.motivo_rejeicao,
          criado_por: p.criado_por,
          created_at: p.created_at,
          updated_at: p.updated_at
        }));
        await bulkSavePendencias(mappedPends);
      }
    } catch (e) {
      console.warn('[Precache] Falha ao baixar pendências:', e);
    }

    // Gravar metadata de download
    await saveAppMetadata('last_field_prep', {
      timestamp,
      perguntasCount,
      propriedadesCount,
      auditoriasCount,
      respostasCount,
      pendenciasCount,
      user_email: user?.email || 'tecnico'
    });

    console.log(`[Precache] Dados preparados com sucesso! Perguntas: ${perguntasCount}, Auditorias: ${auditoriasCount}, Respostas: ${respostasCount}, Pendências: ${pendenciasCount}`);

    return {
      success: true,
      perguntasCount,
      propriedadesCount,
      auditoriasCount,
      respostasCount,
      pendenciasCount,
      timestamp
    };
  } catch (err: any) {
    console.error('[Precache] Falha na preparação de dados:', err);
    return {
      success: false,
      perguntasCount,
      propriedadesCount,
      auditoriasCount,
      respostasCount,
      pendenciasCount,
      timestamp,
      error: err.message
    };
  }
}

/**
 * Retorna o timestamp e resumo da última preparação offline
 */
export async function getLastFieldPrepInfo(): Promise<{
  timestamp: string | null;
  summary: string | null;
}> {
  const meta = await getAppMetadata('last_field_prep');
  if (!meta || !meta.timestamp) {
    return { timestamp: null, summary: null };
  }
  const date = new Date(meta.timestamp);
  const formattedTime = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const formattedDate = date.toLocaleDateString('pt-BR');
  const summary = `Última atualização: ${formattedDate} às ${formattedTime} (${meta.perguntasCount} critérios, ${meta.auditoriasCount} vistorias)`;

  return {
    timestamp: meta.timestamp,
    summary
  };
}

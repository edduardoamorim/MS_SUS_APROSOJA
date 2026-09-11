import { supabase } from '../lib/supabase';
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
  type CachedPergunta,
  type CachedAuditoria,
  type CachedResposta,
  type CachedPendencia
} from '../lib/offlineDb';

// Importa o JSON mestre compilado como contingência garantida
import rtrsQuestionsJson from '../data/rtrs_questions.json';

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
  if (existing && existing.length > 0) {
    return existing;
  }

  console.log('[Precache] Semeando 115 perguntas RTRS a partir do catálogo mestre local...');
  const seededPerguntas: CachedPergunta[] = (rtrsQuestionsJson as any[]).map((q, idx) => ({
    id: q.id || `rtrs-criterio-${q.numero_criterio}`,
    secao: q.principle || q.secao || '',
    criterio: q.criterion || q.criterio || '',
    numero_criterio: q.numero_criterio || '',
    enunciado: q.enunciado || '',
    ponderacao: q.ponderacao || 'Imediata',
    orientacao: q.orientacao || '',
    interpretacao_nacional: q.interpretacao_nacional || '',
    ativo: true,
    ordem: idx + 1
  }));

  await bulkSavePerguntas(seededPerguntas);
  console.log(`[Precache] ${seededPerguntas.length} perguntas RTRS semeadas com sucesso no IndexedDB.`);
  return seededPerguntas;
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
        // Fallback local se o Supabase não responder
        const local = await seedDefaultRTRSQuestions();
        perguntasCount = local.length;
      }
    } catch (e) {
      console.warn('[Precache] Erro ao buscar perguntas online, usando seed local:', e);
      const local = await seedDefaultRTRSQuestions();
      perguntasCount = local.length;
    }

    // 2. Propriedades
    try {
      const { data: propsData, error: propsErr } = await supabase
        .from('propriedades')
        .select('id, nome_fazenda, nome_produtor, codigo_car, codigo_sigef, municipio, geom, produtor_id, created_at, updated_at');

      if (!propsErr && propsData) {
        propriedadesCount = propsData.length;
        await cacheReadData('tecnico_propriedades', propsData);
      }
    } catch (e) {
      console.warn('[Precache] Falha ao baixar propriedades:', e);
    }

    // 3. Auditorias
    try {
      const { data: auditsData, error: audErr } = await supabase
        .from('auditorias')
        .select(`
          id,
          data_agendamento,
          status,
          tecnico_responsavel_id,
          propriedade_id,
          created_at,
          updated_at,
          propriedades (
            id,
            nome_fazenda,
            nome_produtor,
            codigo_car,
            municipio,
            created_at,
            updated_at
          )
        `)
        .order('updated_at', { ascending: false });

      if (!audErr && auditsData) {
        auditoriasCount = auditsData.length;
        const cachedAudits: CachedAuditoria[] = auditsData.map((a: any) => ({
          id: a.id,
          propriedade_id: a.propriedade_id,
          tecnico_responsavel_id: a.tecnico_responsavel_id,
          data_agendamento: a.data_agendamento,
          status: a.status,
          propriedades: Array.isArray(a.propriedades) ? a.propriedades[0] : a.propriedades,
          created_at: a.created_at,
          updated_at: a.updated_at
        }));
        await bulkSaveAuditorias(cachedAudits);
      }
    } catch (e) {
      console.warn('[Precache] Falha ao baixar auditorias:', e);
    }

    // 4. Respostas já gravadas
    try {
      const { data: respData, error: rErr } = await supabase
        .from('respostas_auditoria')
        .select('auditoria_id, pergunta_id, conforme, observacoes, evidencia_url, updated_at');

      if (!rErr && respData) {
        respostasCount = respData.length;
        // Preserva evidências locais existentes que ainda não foram sincronizadas com a nuvem
        const existingLocal = await db.cached_respostas.toArray();
        const existingMap = new Map<string, CachedResposta>();
        existingLocal.forEach(el => existingMap.set(`${el.auditoria_id}-${el.pergunta_id}`, el));

        const mappedResps: CachedResposta[] = respData.map((r: any) => {
          const localItem = existingMap.get(`${r.auditoria_id}-${r.pergunta_id}`);
          let finalEvUrl = r.evidencia_url;
          if (!finalEvUrl && localItem?.evidencia_url) {
            finalEvUrl = localItem.evidencia_url;
          }
          return {
            auditoria_id: r.auditoria_id,
            pergunta_id: r.pergunta_id,
            conforme: r.conforme,
            observacoes: r.observacoes || '',
            evidencia_url: finalEvUrl,
            updated_at: r.updated_at,
            evidencia_uploaded_at: localItem?.evidencia_uploaded_at || null,
            data_envio: localItem?.data_envio || null
          };
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

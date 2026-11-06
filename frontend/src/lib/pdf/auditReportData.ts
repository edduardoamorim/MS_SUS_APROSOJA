import { supabase } from '../supabase';
import { db, getAllCachedPerguntas } from '../offlineDb';
import { normalizePerguntaId } from '../../constants/rtrsMapping';
import rtrsQuestionsJson from '../../data/rtrs_questions.json';
import defaultAuditoriasJson from '../../data/default_auditorias.json';
import { resolvePonderacao } from '../../components/auditoria/PanoramaScoreRTRS';
import { cleanEvidenceUrl } from '../evidenceService';
import {
  type AuditReportData,
  type PropriedadeReportInfo,
  type AuditoriaReportInfo,
  type EstatisticasReport,
  type MatrizPrazosReport,
  type PrincipioReportStats,
  type CriterioReportItem,
  type NaoConformidadePrioritaria,
  isAuditoriaSubmetida,
  cleanQuestionText
} from './types';

export { isAuditoriaSubmetida };

// Títulos oficiais dos 5 princípios RTRS
const PRINCIPIOS_NOMES: Record<number, string> = {
  1: 'Cumprimento da Legislação e Boas Práticas Empresariais',
  2: 'Condições de Trabalho Responsáveis',
  3: 'Relações Responsáveis com a Comunidade',
  4: 'Proteção Ambiental',
  5: 'Boas Práticas Agrícolas'
};

function extrairNumeroPrincipio(secaoOuCriterio: string): number {
  const match = secaoOuCriterio.match(/^(\d)/);
  if (match) return parseInt(match[1], 10);
  const matchPrinc = secaoOuCriterio.match(/Princípio\s*(\d)/i);
  if (matchPrinc) return parseInt(matchPrinc[1], 10);
  return 1;
}

function compareCriterios(critA: string, critB: string): number {
  const parseParts = (s: string) => {
    return (s || '').split('.').map(p => {
      const num = parseInt(p, 10);
      const char = p.replace(/\d+/g, '');
      return { num: isNaN(num) ? 0 : num, char };
    });
  };
  const partsA = parseParts(critA);
  const partsB = parseParts(critB);
  const maxLen = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < maxLen; i++) {
    if (partsA[i] === undefined) return -1;
    if (partsB[i] === undefined) return 1;
    const a = partsA[i];
    const b = partsB[i];
    if (a.num !== b.num) return a.num - b.num;
    if (a.char !== b.char) return a.char.localeCompare(b.char);
  }
  return 0;
}

/**
 * Constrói o conjunto completo e consolidado de dados para a geração do relatório em PDF.
 */
export async function buildAuditReportData(
  auditoriaId?: string | null,
  propriedadeId?: string | null,
  currentUser?: any
): Promise<AuditReportData> {
  const nowIso = new Date().toISOString();
  const dataEmissaoFormatada = new Date().toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  // 1. RESOLVER DADOS DA PROPRIEDADE E DA AUDITORIA
  let targetPropId = propriedadeId;
  let targetAuditId = auditoriaId;
  let auditRow: any = null;
  let propRow: any = null;
  let sisterAuditIds: string[] = [];

  // Tenta carregar do Supabase se online
  if (typeof navigator === 'undefined' || navigator.onLine) {
    try {
      if (targetAuditId && !targetAuditId.startsWith('mock-')) {
        const { data: aData } = await supabase
          .from('auditorias')
          .select(`
            id,
            status,
            etapa,
            data_agendamento,
            created_at,
            updated_at,
            propriedade_id,
            tecnico_responsavel_id,
            propriedades (
              id,
              nome_fazenda,
              nome_produtor,
              municipio,
              codigo_car,
              codigo_sigef,
              area_total,
              area_soja,
              etapa
            )
          `)
          .eq('id', targetAuditId)
          .maybeSingle();

        if (aData) {
          auditRow = aData;
          propRow = Array.isArray(aData.propriedades) ? aData.propriedades[0] : aData.propriedades;
          if (aData.propriedade_id) targetPropId = aData.propriedade_id;
        }
      }

      if (!propRow && targetPropId && !targetPropId.startsWith('mock-')) {
        const { data: pData } = await supabase
          .from('propriedades')
          .select('id, nome_fazenda, nome_produtor, municipio, codigo_car, codigo_sigef, area_total, area_soja, etapa')
          .eq('id', targetPropId)
          .maybeSingle();
        if (pData) propRow = pData;
      }

      // Descobrir auditorias irmãs da mesma fazenda
      if (targetPropId && !targetPropId.startsWith('mock-')) {
        const { data: sAuds } = await supabase
          .from('auditorias')
          .select('id, status, etapa, data_agendamento')
          .eq('propriedade_id', targetPropId);
        if (sAuds) {
          sisterAuditIds = sAuds.map((s: any) => s.id);
        }
      }
    } catch (netErr) {
      console.warn('[AuditReportData] Falha ao consultar Supabase, usando Dexie local:', netErr);
    }
  }

  // Fallback Dexie local
  if (!auditRow && targetAuditId) {
    try {
      auditRow = await db.cached_auditorias.get(targetAuditId);
      if (auditRow?.propriedades) {
        propRow = auditRow.propriedades;
      }
      if (auditRow?.propriedade_id) {
        targetPropId = auditRow.propriedade_id;
      }
    } catch {}
  }

  if (!propRow && targetPropId) {
    try {
      const allCached = await db.cached_auditorias.toArray();
      const match = allCached.find(a => a.propriedade_id === targetPropId);
      if (match?.propriedades) {
        propRow = match.propriedades;
      }
    } catch {}
  }

  // Fallback nos dados mestres (JSON)
  if (!propRow || !auditRow) {
    const mock = (defaultAuditoriasJson as any[]).find(
      a => a.id === targetAuditId || a.propriedade_id === targetPropId
    );
    if (mock) {
      if (!auditRow) auditRow = mock;
      if (!propRow) propRow = Array.isArray(mock.propriedades) ? mock.propriedades[0] : mock.propriedades;
    }
  }

  // Nome do técnico responsável
  let tecnicoNome = 'Técnico Responsável';
  const tecnicoId = auditRow?.tecnico_responsavel_id || currentUser?.id;
  if (tecnicoId && (typeof navigator === 'undefined' || navigator.onLine)) {
    try {
      const { data: perfil } = await supabase
        .from('perfis')
        .select('nome')
        .eq('id', tecnicoId)
        .maybeSingle();
      if (perfil?.nome) tecnicoNome = perfil.nome;
    } catch {}
  } else if (currentUser?.nome) {
    tecnicoNome = currentUser.nome;
  }

  const emitidoPor = currentUser?.nome
    ? `${currentUser.nome} (${currentUser.role === 'gestor' ? 'Gestor' : 'Técnico'})`
    : 'MS Sustentável - Auditoria RTRS';

  const statusAuditoria = auditRow?.status || 'Aguardando Aprovação';
  const etapaAuditoria = auditRow?.etapa || propRow?.etapa || 'Auditoria Oficial';

  const dataVistoria = auditRow?.data_agendamento
    ? new Date(auditRow.data_agendamento).toLocaleDateString('pt-BR')
    : new Date().toLocaleDateString('pt-BR');

  const propriedade: PropriedadeReportInfo = {
    id: targetPropId || 'prop-default',
    nome_fazenda: propRow?.nome_fazenda || 'Fazenda Produtora',
    nome_produtor: propRow?.nome_produtor || 'Produtor Rural',
    municipio: propRow?.municipio || 'Mato Grosso do Sul, MS',
    codigo_car: propRow?.codigo_car || null,
    codigo_sigef: propRow?.codigo_sigef || null,
    area_total: propRow?.area_total || null,
    area_soja: propRow?.area_soja || null,
    etapa: etapaAuditoria
  };

  const auditoria: AuditoriaReportInfo = {
    id: targetAuditId || 'audit-default',
    data_vistoria: dataVistoria,
    data_emissao: dataEmissaoFormatada,
    status: statusAuditoria,
    etapa: etapaAuditoria,
    tecnico_nome: tecnicoNome,
    tecnico_id: tecnicoId || null,
    emitido_por: emitidoPor
  };

  // 2. CARREGAR OS 115 CRITÉRIOS RTRS (Catálogo Mestre)
  let perguntas: any[] = [];
  try {
    const cachedP = await getAllCachedPerguntas();
    if (cachedP && cachedP.length >= 100) {
      perguntas = cachedP;
    }
  } catch {}

  if (perguntas.length === 0) {
    perguntas = rtrsQuestionsJson as any[];
  }

  // 3. CARREGAR AS RESPOSTAS CONSOLIDADAS (Supabase + Dexie)
  const auditIdsToQuery = Array.from(
    new Set([targetAuditId, ...sisterAuditIds].filter(Boolean) as string[])
  );

  const rawRespostas: any[] = [];

  // Consulta ao Supabase
  if (auditIdsToQuery.length > 0 && (typeof navigator === 'undefined' || navigator.onLine)) {
    try {
      const { data: dbResp, error: rErr } = await supabase
        .from('respostas_auditoria')
        .select('id, auditoria_id, pergunta_id, conforme, nao_se_aplica, observacoes, evidencia_url, updated_at')
        .in('auditoria_id', auditIdsToQuery);

      if (!rErr && dbResp && dbResp.length > 0) {
        rawRespostas.push(...dbResp);
      }
    } catch (e) {
      console.warn('[AuditReportData] Falha de rede ao consultar respostas no Supabase:', e);
    }
  }

  // Consulta ao Dexie local (db.cached_respostas) e fusão com o Supabase
  if (auditIdsToQuery.length > 0) {
    try {
      const localResp = await db.cached_respostas
        .filter(r => auditIdsToQuery.includes(r.auditoria_id))
        .toArray();
      if (localResp && localResp.length > 0) {
        rawRespostas.push(...localResp);
      }
    } catch (e) {
      console.warn('[AuditReportData] Falha ao consultar Dexie cached_respostas:', e);
    }
  }

  // Mapear respostas deduplicando por pergunta_id (priorizando auditoria ativa e anotações do técnico)
  const respostaPorPergunta = new Map<string, any>();
  for (const resp of rawRespostas) {
    const canonId = normalizePerguntaId(resp.pergunta_id);
    const existing = respostaPorPergunta.get(canonId);
    if (!existing) {
      respostaPorPergunta.set(canonId, resp);
    } else {
      const existingIsDirect = existing.auditoria_id === targetAuditId;
      const currentIsDirect = resp.auditoria_id === targetAuditId;
      const existingHasObs = !!(existing.observacoes || existing.observacao);
      const currentHasObs = !!(resp.observacoes || resp.observacao);

      if (!existingIsDirect && currentIsDirect) {
        respostaPorPergunta.set(canonId, resp);
      } else if (existingIsDirect === currentIsDirect) {
        // Se apenas um tem anotação do técnico, prioriza aquele com anotação!
        if (!existingHasObs && currentHasObs) {
          respostaPorPergunta.set(canonId, resp);
        } else if (existingHasObs === currentHasObs) {
          const timeEx = new Date(existing.updated_at || 0).getTime();
          const timeCur = new Date(resp.updated_at || 0).getTime();
          if (timeCur > timeEx) {
            respostaPorPergunta.set(canonId, resp);
          }
        }
      }
    }
  }

  // 4. CONSTRUIR A LISTA DOS 115 CRITÉRIOS
  const criterios: CriterioReportItem[] = [];
  const naoConformidades: NaoConformidadePrioritaria[] = [];

  for (const q of perguntas) {
    const numCrit = q.numero_criterio || q.criterio || '';
    const canonId = q.id ? normalizePerguntaId(q.id) : normalizePerguntaId(numCrit);
    const secao = q.principle || q.secao || `Princípio ${extrairNumeroPrincipio(numCrit)}`;
    const enunciadoLimpo = cleanQuestionText(q.enunciado || '');
    const ponderacaoRaw = resolvePonderacao(numCrit, q.ponderacao);

    const prazoDesc =
      ponderacaoRaw === 'Imediato'
        ? '15 dias'
        : ponderacaoRaw === 'Curto Prazo'
        ? '60 dias'
        : '120 dias';

    const resp = respostaPorPergunta.get(canonId) || respostaPorPergunta.get(q.id) || null;

    let status: 'Conforme' | 'Não Conforme' | 'Não se Aplica' | 'Pendente' = 'Pendente';
    let observacao = '';
    let evidenciaUrl: string | null = null;

    if (resp) {
      if (resp.nao_se_aplica === true || resp.nao_se_aplica === 'true' || resp.nao_se_aplica === 1) {
        status = 'Não se Aplica';
      } else if (resp.conforme === true || resp.conforme === 'true' || resp.conforme === 1) {
        status = 'Conforme';
      } else if (resp.conforme === false || resp.conforme === 'false' || resp.conforme === 0) {
        status = 'Não Conforme';
      }
      observacao = cleanQuestionText(resp.observacoes || resp.observacao || '');
      evidenciaUrl = cleanEvidenceUrl(resp.evidencia_url);
    }

    const item: CriterioReportItem = {
      id: canonId,
      numero_criterio: numCrit,
      secao: secao,
      enunciado: enunciadoLimpo,
      ponderacao: ponderacaoRaw,
      prazoEstimado: prazoDesc,
      status: status,
      observacao: observacao,
      evidenciaUrl: evidenciaUrl
    };

    criterios.push(item);

    if (status === 'Não Conforme') {
      naoConformidades.push({
        criterio: numCrit,
        secao: secao,
        enunciado: enunciadoLimpo,
        prazo: prazoDesc,
        observacao: observacao || 'Sem anotações complementares registradas em campo.',
        evidenciaUrl: evidenciaUrl
      });
    }
  }

  // Ordena os critérios deterministamente
  criterios.sort((a, b) => compareCriterios(a.numero_criterio, b.numero_criterio));

  // Ordena as não conformidades por gravidade: Imediato (15d) -> Curto (60d) -> Médio (120d)
  const pesoPrazo = (prazo: string) => {
    if (prazo.includes('15')) return 1;
    if (prazo.includes('60')) return 2;
    return 3;
  };
  naoConformidades.sort((a, b) => {
    const diff = pesoPrazo(a.prazo) - pesoPrazo(b.prazo);
    if (diff !== 0) return diff;
    return compareCriterios(a.criterio, b.criterio);
  });

  // 5. CÁLCULO DE ESTATÍSTICAS E SCORE
  const totalPerguntas = criterios.length;
  const respondidas = criterios.filter(c => c.status !== 'Pendente').length;
  const naoSeAplica = criterios.filter(c => c.status === 'Não se Aplica').length;
  const conformes = criterios.filter(c => c.status === 'Conforme').length;
  const naoConformes = criterios.filter(c => c.status === 'Não Conforme').length;
  const aplicaveis = Math.max(0, totalPerguntas - naoSeAplica);
  const scoreConformidade = aplicaveis > 0 ? Math.round((conformes / aplicaveis) * 100) : 100;

  // Classificação
  const naoConformesImediatos = naoConformidades.filter(n => n.prazo.includes('15')).length;
  let classificacao = 'Conforme — Apto para Certificação';
  if (naoConformesImediatos > 0) {
    classificacao = 'Atenção Crítica — Não Conformidades Prioritárias';
  } else if (naoConformes > 0) {
    classificacao = 'Requer Adequação Técnica';
  }

  const estatisticas: EstatisticasReport = {
    totalPerguntas,
    respondidas,
    aplicaveis,
    conformes,
    naoConformes,
    naoSeAplica,
    scoreConformidade,
    classificacao
  };

  // 6. MATRIZ DE PRAZOS
  const matrizPrazos: MatrizPrazosReport = {
    imediato: {
      prazo: 'Imediato',
      diasTexto: '15 dias',
      total: criterios.filter(c => c.ponderacao === 'Imediato' && c.status !== 'Não se Aplica').length,
      conformes: criterios.filter(c => c.ponderacao === 'Imediato' && c.status === 'Conforme').length,
      naoConformes: criterios.filter(c => c.ponderacao === 'Imediato' && c.status === 'Não Conforme').length,
      descricao: 'Urgente / Impeditivo para Certificação'
    },
    curtoPrazo: {
      prazo: 'Curto Prazo',
      diasTexto: '60 dias',
      total: criterios.filter(c => c.ponderacao === 'Curto Prazo' && c.status !== 'Não se Aplica').length,
      conformes: criterios.filter(c => c.ponderacao === 'Curto Prazo' && c.status === 'Conforme').length,
      naoConformes: criterios.filter(c => c.ponderacao === 'Curto Prazo' && c.status === 'Não Conforme').length,
      descricao: 'Adequação Técnica'
    },
    medioPrazo: {
      prazo: 'Médio Prazo',
      diasTexto: '120 dias',
      total: criterios.filter(c => c.ponderacao === 'Médio Prazo' && c.status !== 'Não se Aplica').length,
      conformes: criterios.filter(c => c.ponderacao === 'Médio Prazo' && c.status === 'Conforme').length,
      naoConformes: criterios.filter(c => c.ponderacao === 'Médio Prazo' && c.status === 'Não Conforme').length,
      descricao: 'Melhoria Contínua'
    }
  };

  // 7. RAIO-X DOS 5 PRINCÍPIOS
  const principios: PrincipioReportStats[] = [1, 2, 3, 4, 5].map(pNum => {
    const pCrit = criterios.filter(c => extrairNumeroPrincipio(c.numero_criterio || c.secao) === pNum);
    const pTotal = pCrit.length;
    const pNaoSeAplica = pCrit.filter(c => c.status === 'Não se Aplica').length;
    const pConformes = pCrit.filter(c => c.status === 'Conforme').length;
    const pNaoConformes = pCrit.filter(c => c.status === 'Não Conforme').length;
    const pAplicaveis = Math.max(0, pTotal - pNaoSeAplica);
    const pScore = pAplicaveis > 0 ? Math.round((pConformes / pAplicaveis) * 100) : 100;

    return {
      numero: pNum,
      nome: PRINCIPIOS_NOMES[pNum] || `Princípio ${pNum}`,
      total: pTotal,
      conformes: pConformes,
      naoConformes: pNaoConformes,
      naoSeAplica: pNaoSeAplica,
      score: pScore
    };
  });

  return {
    propriedade,
    auditoria,
    estatisticas,
    matrizPrazos,
    principios,
    naoConformidades,
    criterios,
    evidenciasAnexo: []
  };
}

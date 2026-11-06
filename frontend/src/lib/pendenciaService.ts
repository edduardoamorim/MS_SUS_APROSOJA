import { supabase } from './supabase';
import { db } from './offlineDb';

/**
 * Extrai o código do critério RTRS a partir do título de uma pendência.
 * Exemplos de títulos:
 * - "Critério 1.1.2 - Legislação Ambiental" -> "1.1.2"
 * - "1.1.2 - Contrato de Trabalho" -> "1.1.2"
 * - "Critério 4.1.3: Plano de Gestão" -> "4.1.3"
 */
export function extractCriterionCodeFromTitle(title?: string | null): string | null {
  if (!title) return null;
  const match = title.match(/(?:Critério\s+)?(\d+\.\d+(?:\.\d+)?)/i);
  return match ? match[1] : null;
}

/**
 * Sincroniza a aprovação ou reabertura de uma pendência diretamente com a tabela
 * de respostas de auditoria RTRS (respostas_auditoria), garantindo que a pontuação
 * e o status de conformidade da fazenda reflitam o saneamento da exigência.
 */
export async function syncPendencyStatusWithRtrsAnswer(
  pendencia: {
    id: string;
    propriedade_id: string;
    titulo: string;
    resolucao_descricao?: string | null;
    evidencia_url?: string | null;
  },
  newStatus: 'Resolvida' | 'Pendente'
) {
  const criterioCode = extractCriterionCodeFromTitle(pendencia.titulo);
  if (!criterioCode || !pendencia.propriedade_id) return;

  try {
    // 1. Identificar o ID da pergunta correspondente
    const { data: pergunta } = await supabase
      .from('perguntas_rtrs')
      .select('id, numero_criterio')
      .eq('numero_criterio', criterioCode)
      .limit(1)
      .maybeSingle();

    if (!pergunta?.id) return;

    // 2. Identificar as auditorias da propriedade
    const { data: audits } = await supabase
      .from('auditorias')
      .select('id')
      .eq('propriedade_id', pendencia.propriedade_id);

    if (!audits || audits.length === 0) return;
    const auditIds = audits.map((a: any) => a.id);

    const isResolved = newStatus === 'Resolvida';
    const nowIso = new Date().toISOString();

    for (const audId of auditIds) {
      // Atualizar resposta no Supabase
      const updatePayload: any = {
        conforme: isResolved,
        updated_at: nowIso
      };

      if (isResolved && pendencia.evidencia_url) {
        updatePayload.evidencia_url = pendencia.evidencia_url;
      }
      if (isResolved && pendencia.resolucao_descricao) {
        updatePayload.observacoes = `[Regularizado]: ${pendencia.resolucao_descricao}`;
      }

      const { data: existingResp } = await supabase
        .from('respostas_auditoria')
        .select('id, evidencia_url, observacoes')
        .eq('auditoria_id', audId)
        .eq('pergunta_id', pergunta.id)
        .maybeSingle();

      if (existingResp?.id) {
        await supabase
          .from('respostas_auditoria')
          .update(updatePayload)
          .eq('id', existingResp.id);
      }

      // Sincronizar também no Dexie local para atualização instantânea
      try {
        const cached = await db.cached_respostas
          .where('auditoria_id')
          .equals(audId)
          .and(r => r.pergunta_id === pergunta.id)
          .first();

        if (cached) {
          await db.cached_respostas.put({
            ...cached,
            conforme: isResolved,
            ...(isResolved && pendencia.evidencia_url ? { evidencia_url: pendencia.evidencia_url } : {}),
            ...(isResolved && pendencia.resolucao_descricao ? { observacoes: `[Regularizado]: ${pendencia.resolucao_descricao}` } : {})
          });
        }
      } catch (dexErr) {
        console.warn('[syncPendencyStatusWithRtrsAnswer] Aviso no Dexie:', dexErr);
      }
    }
  } catch (err) {
    console.warn('[syncPendencyStatusWithRtrsAnswer] Erro na sincronização:', err);
  }
}


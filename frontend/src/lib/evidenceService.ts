import { supabase } from './supabase';
import { db } from './offlineDb';
import { normalizePerguntaId } from '../constants/rtrsMapping';

/**
 * Interface para parâmetros de resolução de evidência
 */
export interface EvidenceResolutionParams {
  url?: string | null;
  auditoriaId?: string | null;
  perguntaId?: string | null;
  propriedadeId?: string | null;
}

/**
 * Normaliza e higieniza uma URL de evidência de forma síncrona.
 * Blindada contra:
 * - Prefixos corrompidos do Supabase Storage sobre URLs blob: ou http:
 * - URLs blob: e data: locais (nunca reescreve para o Supabase)
 * - Caminhos relativos de buckets (evidencias / auditoria-evidencias)
 * - Strings inválidas ou marcadores temporários (ex: 'resolvido', 'comprovante')
 */
export function cleanEvidenceUrl(url?: string | null): string | null {
  if (!url || typeof url !== 'string') return null;
  let clean = url.trim();

  // Desconsidera marcadores e strings curtas inválidas
  if (
    clean === '' ||
    clean === 'null' ||
    clean === 'undefined' ||
    clean === 'resolvido' ||
    clean === 'comprovante' ||
    clean.length < 5
  ) {
    return null;
  }

  // Desfaz corrupções conhecidas causadas por concatenação indevida:
  // Ex: "https://.../storage/v1/object/public/evidencias/blob:http://localhost:5173/..."
  const blobMatch = clean.match(/(blob:https?:\/\/[^\s"'<>]+)/i);
  if (blobMatch) {
    return blobMatch[1];
  }

  // Ex: "https://.../evidencias/https://..."
  const doubleHttpMatch = clean.match(/\/evidencias\/(https?:\/\/[^\s"'<>]+)/i);
  if (doubleHttpMatch) {
    return doubleHttpMatch[1];
  }

  // URLs data: e blob: locais válidas nunca devem ser modificadas
  if (clean.startsWith('data:') || clean.startsWith('blob:')) {
    return clean;
  }

  // URLs completas HTTP/HTTPS externas ou do Supabase
  if (clean.startsWith('http://') || clean.startsWith('https://')) {
    return clean;
  }

  // Se for caminho relativo de Storage (ex: "evidencias/foto.jpg" ou "foto.jpg")
  try {
    const bucket = clean.includes('auditoria-evidencias') ? 'auditoria-evidencias' : 'evidencias';
    const filePath = clean.replace(/^(evidencias|auditoria-evidencias)\//, '');
    const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
    if (data?.publicUrl) {
      return data.publicUrl;
    }
  } catch (e) {
    console.warn('[evidenceService] Erro ao resolver URL pública do storage:', e);
  }

  return clean;
}

/**
 * Verifica se uma evidência é documento PDF de forma precisa
 */
export function isPdfEvidence(url?: string | null): boolean {
  if (!url) return false;
  const clean = cleanEvidenceUrl(url);
  if (!clean) return false;

  const lower = clean.toLowerCase();
  if (lower.startsWith('data:application/pdf')) return true;

  // Remove query params para checagem de extensão
  const urlWithoutQuery = lower.split('?')[0].split('#')[0];
  return urlWithoutQuery.endsWith('.pdf') || urlWithoutQuery.includes('.pdf');
}

/**
 * Testa se uma URL do tipo blob: ainda está viva e acessível em memória no navegador
 */
export async function isBlobAlive(blobUrl: string): Promise<boolean> {
  if (!blobUrl.startsWith('blob:')) return false;
  try {
    const response = await fetch(blobUrl, { method: 'GET' });
    return response.ok && response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Recuperador inteligente multicamadas para evidências.
 * Se a URL original for nula, corrompida ou um blob: expirado, este método:
 * 1. Tenta usar a URL limpa se ainda válida (data:, http:, ou blob: ativo).
 * 2. Se for blob: morto ou nulo, busca o Blob original no IndexedDB (sync_journal ou outbox_files).
 * 3. Se não houver blob local, busca no bucket do Supabase Storage pelo padrão do arquivo.
 * 4. Ao recuperar, atualiza o cache local (db.cached_respostas) para curar o estado.
 */
export async function resolveEvidenceUrlAsync(params: EvidenceResolutionParams): Promise<string | null> {
  const { url, auditoriaId, perguntaId } = params;
  const cleaned = cleanEvidenceUrl(url);

  // 1. URLs data: (base64) são imutáveis e sempre válidas
  if (cleaned && cleaned.startsWith('data:')) {
    return cleaned;
  }

  // 2. URLs HTTP/HTTPS públicas oficiais
  if (cleaned && (cleaned.startsWith('http://') || cleaned.startsWith('https://'))) {
    // Se a URL contém blob:http (já limpa por cleanEvidenceUrl, mas validada aqui)
    if (!cleaned.includes('blob:')) {
      return cleaned;
    }
  }

  // 3. Se for uma URL blob:, verifica se ainda está viva na sessão atual
  if (cleaned && cleaned.startsWith('blob:')) {
    const alive = await isBlobAlive(cleaned);
    if (alive) {
      return cleaned;
    }
    console.warn('[evidenceService] Blob URL expirado ou inacessível. Iniciando auto-recuperação:', cleaned);
  }

  // 4. CAMADA DE AUTO-RECUPERAÇÃO:
  // Se não temos auditoriaId ou perguntaId, não há como correlacionar com o storage ou journal
  if (!auditoriaId || !perguntaId) {
    return cleaned;
  }

  const canonPergId = normalizePerguntaId(perguntaId);

  // 4.1. Busca no Dexie (sync_journal) por file_blob local persistido
  try {
    const journalEntries = await db.sync_journal
      .where('auditoria_id')
      .equals(auditoriaId)
      .toArray();

    const matchedJournal = journalEntries.find(
      j => normalizePerguntaId(j.pergunta_id) === canonPergId && j.file_blob
    );

    if (matchedJournal && matchedJournal.file_blob) {
      const freshBlobUrl = URL.createObjectURL(matchedJournal.file_blob);
      console.log('[evidenceService] Evidência regenerada a partir do sync_journal:', freshBlobUrl);

      // Cura o cache local
      db.cached_respostas
        .where('[auditoria_id+pergunta_id]')
        .equals([auditoriaId, canonPergId])
        .modify({ evidencia_url: freshBlobUrl })
        .catch(() => {});

      return freshBlobUrl;
    }
  } catch (jErr) {
    console.warn('[evidenceService] Erro ao buscar no sync_journal:', jErr);
  }

  // 4.2. Busca no Dexie (outbox_files) por arquivo correspondente
  try {
    const outboxFiles = await db.outbox_files.toArray();
    for (const f of outboxFiles) {
      if (!f.file_blob) continue;
      const pathOrName = f.storage_path || f.file_name || '';
      if (pathOrName.includes(auditoriaId) && pathOrName.includes(canonPergId)) {
        const freshBlobUrl = URL.createObjectURL(f.file_blob);
        console.log('[evidenceService] Evidência regenerada a partir do outbox_files:', freshBlobUrl);

        // Cura o cache local
        db.cached_respostas
          .where('[auditoria_id+pergunta_id]')
          .equals([auditoriaId, canonPergId])
          .modify({ evidencia_url: freshBlobUrl })
          .catch(() => {});

        return freshBlobUrl;
      }
    }
  } catch (oErr) {
    console.warn('[evidenceService] Erro ao buscar no outbox_files:', oErr);
  }

  // 4.3. Busca no Supabase Storage remoto se online
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    try {
      const prefix = `evidencia_${auditoriaId}_${canonPergId}`;
      const { data: storageFiles, error: listErr } = await supabase.storage
        .from('evidencias')
        .list('', {
          limit: 10,
          search: prefix
        });

      if (!listErr && storageFiles && storageFiles.length > 0) {
        // Ordena pelo mais recente
        storageFiles.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
        const targetFile = storageFiles[0];

        const { data: pubData } = supabase.storage
          .from('evidencias')
          .getPublicUrl(targetFile.name);

        if (pubData?.publicUrl) {
          const recoveredUrl = pubData.publicUrl;
          console.log('[evidenceService] Evidência recuperada com sucesso do Supabase Storage:', recoveredUrl);

          // Cura o Postgres remoto se estiver com blob: ou nulo
          supabase
            .from('respostas_auditoria')
            .update({ evidencia_url: recoveredUrl })
            .match({ auditoria_id: auditoriaId, pergunta_id: canonPergId })
            .then(() => {});

          // Cura o Dexie local
          db.cached_respostas
            .where('[auditoria_id+pergunta_id]')
            .equals([auditoriaId, canonPergId])
            .modify({ evidencia_url: recoveredUrl })
            .catch(() => {});

          return recoveredUrl;
        }
      }
    } catch (sErr) {
      console.warn('[evidenceService] Erro na busca remota no Supabase Storage:', sErr);
    }
  }

  // Se tudo falhar, retorna o que tínhamos disponível
  return cleaned;
}

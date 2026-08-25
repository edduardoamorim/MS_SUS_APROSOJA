import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc2JtZm56aGpkdGlyaGl0Z2lnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkwNDE1OCwiZXhwIjoyMDk3NDgwMTU4fQ.1CFeZaQWWKQqSyxrcJXHDvpQ6gmb2hU8HTtMs8nQG6Y';
const payload = JSON.parse(Buffer.from(ANON_KEY.split('.')[1], 'base64').toString());
const CLOUD_URL = `https://${payload.ref}.supabase.co`;

const jsonPath = join(__dirname, '../base_doc_RTRS/rtrs_questions.json');
const questions = JSON.parse(readFileSync(jsonPath, 'utf-8'));

async function seedCloud() {
  console.log(`Lendo ${questions.length} perguntas de ${jsonPath}...`);

  // Limpar perguntas existentes no Cloud
  console.log('Limpando tabela perguntas_rtrs no Supabase Cloud...');
  const delRes = await fetch(`${CLOUD_URL}/rest/v1/perguntas_rtrs?secao=neq.NONE`, {
    method: 'DELETE',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${ANON_KEY}`
    }
  });
  console.log('Delete status:', delRes.status);

  // Formatar itens para inserção no Cloud
  // Inclui as interpretações nacionais estruturadas dentro de orientacao se o campo isolado não existir
  const batchPayload = questions.map((q, idx) => {
    let combinedOrientacao = q.orientacao || '';
    if (q.interpretacao_nacional && q.interpretacao_nacional.trim()) {
      combinedOrientacao = `[INTERPRETAÇÃO NACIONAL - BRASIL]\n${q.interpretacao_nacional.trim()}\n\n[DIRETRIZES GERAIS]\n${combinedOrientacao.trim()}`.trim();
    }

    return {
      secao: q.principle,
      criterio: q.criterion,
      numero_criterio: q.numero_criterio,
      enunciado: q.enunciado,
      ponderacao: q.ponderacao,
      orientacao: combinedOrientacao,
      ativo: true,
      ordem: idx + 1
    };
  });

  const BATCH_SIZE = 20;
  let inserted = 0;
  for (let i = 0; i < batchPayload.length; i += BATCH_SIZE) {
    const chunk = batchPayload.slice(i, i + BATCH_SIZE);
    const postRes = await fetch(`${CLOUD_URL}/rest/v1/perguntas_rtrs`, {
      method: 'POST',
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      },
      body: JSON.stringify(chunk)
    });

    if (!postRes.ok) {
      const errText = await postRes.text();
      console.error(`❌ Erro no lote ${i}:`, postRes.status, errText);
    } else {
      inserted += chunk.length;
      console.log(`✅ Inserido lote ${i / BATCH_SIZE + 1} (${inserted}/${batchPayload.length})`);
    }
  }

  console.log(`\n🎉 Seed concluído no Cloud com ${inserted} perguntas!`);
}

seedCloud().catch(console.error);

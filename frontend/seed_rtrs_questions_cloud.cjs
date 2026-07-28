/**
 * Seed RTRS Matrix Questions from base_doc_RTRS/rtrs_questions.json into Supabase Cloud
 * Executar: node frontend/seed_rtrs_questions_cloud.cjs
 */
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc2JtZm56aGpkdGlyaGl0Z2lnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkwNDE1OCwiZXhwIjoyMDk3NDgwMTU4fQ.1CFeZaQWWKQqSyxrcJXHDvpQ6gmb2hU8HTtMs8nQG6Y';
const payload = JSON.parse(Buffer.from(ANON_KEY.split('.')[1], 'base64').toString());
const CLOUD_URL = `https://${payload.ref}.supabase.co`;
const supabase = createClient(CLOUD_URL, ANON_KEY);

async function main() {
  console.log('=== POPULANDO MATRIZ RTRS NO SUPABASE CLOUD ===');
  console.log('URL:', CLOUD_URL);

  const jsonPath = path.join(__dirname, '../base_doc_RTRS/rtrs_questions.json');
  console.log('Lendo JSON RTRS de:', jsonPath);
  const questions = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`Total de perguntas encontradas: ${questions.length}`);

  // Limpar perguntas existentes
  console.log('Limpando tabela perguntas_rtrs...');
  const { error: delErr } = await supabase.from('perguntas_rtrs').delete().neq('secao', 'NONE');
  if (delErr) console.log('Aviso ao limpar:', delErr.message);

  const batchPayload = questions.map((q, idx) => ({
    secao: q.principle,
    criterio: q.criterion,
    numero_criterio: q.numero_criterio,
    enunciado: q.enunciado,
    ponderacao: q.ponderacao,
    orientacao: q.orientacao,
    ativo: true,
    ordem: idx + 1
  }));

  // Inserir em lotes de 20
  const BATCH_SIZE = 20;
  let inserted = 0;
  let errors = 0;

  for (let i = 0; i < batchPayload.length; i += BATCH_SIZE) {
    const chunk = batchPayload.slice(i, i + BATCH_SIZE);
    const { error } = await supabase.from('perguntas_rtrs').insert(chunk);
    if (error) {
      console.error(`❌ Erro no lote ${i}:`, error.message);
      errors++;
    } else {
      inserted += chunk.length;
    }
  }

  console.log(`\n🎉 CONCLUÍDO! Inseridas ${inserted} / ${questions.length} perguntas RTRS com sucesso (erros: ${errors}).`);

  // Verificar contagem final
  const { count } = await supabase.from('perguntas_rtrs').select('*', { count: 'exact', head: true });
  console.log(`Total no banco de dados Supabase Cloud: ${count}`);
}

main().catch(err => console.error('FATAL:', err.message));

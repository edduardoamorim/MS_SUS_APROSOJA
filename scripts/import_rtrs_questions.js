import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Client } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const connectionString = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function importRTRSQuestions() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('✅ Conectado ao banco de dados Supabase.');

    // Limpa a tabela antes de importar
    await client.query('TRUNCATE TABLE public.perguntas_rtrs CASCADE;');
    console.log('Tabela perguntas_rtrs limpa.');

    const jsonPath = join(__dirname, '../base_doc_RTRS/rtrs_questions.json');
    console.log(`Lendo arquivo JSON: ${jsonPath}`);
    const questions = JSON.parse(readFileSync(jsonPath, 'utf-8'));

    console.log(`Importando ${questions.length} perguntas...`);

    let count = 0;
    for (const q of questions) {
      const query = `
        INSERT INTO public.perguntas_rtrs (secao, numero_criterio, enunciado, ponderacao, orientacao, criterio, ativo)
        VALUES ($1, $2, $3, $4, $5, $6, TRUE)
      `;
      await client.query(query, [
        q.principle,
        q.numero_criterio,
        q.enunciado,
        q.ponderacao,
        q.orientacao,
        q.criterion
      ]);
      count++;
    }

    console.log(`🎉 Importação concluída! ${count} perguntas importadas com sucesso.`);
  } catch (error) {
    console.error('❌ Erro durante a importação das perguntas:', error);
  } finally {
    await client.end();
  }
}

importRTRSQuestions();

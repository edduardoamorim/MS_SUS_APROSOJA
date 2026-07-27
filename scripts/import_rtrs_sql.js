import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const jsonPath = join(__dirname, '../base_doc_RTRS/rtrs_questions.json');
const questions = JSON.parse(readFileSync(jsonPath, 'utf-8'));

let sql = `
-- Limpa a tabela e reinsere todos os criterios
TRUNCATE TABLE public.perguntas_rtrs CASCADE;

-- Insere todas as perguntas oficiais da matriz RTRS da planilha Certificação RTRS.xlsx
INSERT INTO public.perguntas_rtrs (secao, numero_criterio, enunciado, ponderacao, orientacao, criterio, ativo, ordem) VALUES
`;

const escape = (str) => {
  if (!str) return "''";
  return "'" + String(str).replace(/'/g, "''") + "'";
};

const rows = questions.map((q, idx) => {
  return `(${escape(q.principle)}, ${escape(q.numero_criterio)}, ${escape(q.enunciado)}, ${escape(q.ponderacao)}, ${escape(q.orientacao)}, ${escape(q.criterion)}, TRUE, ${idx + 1})`;
});

sql += rows.join(',\n') + ';\n';

const sqlPath = join(__dirname, '../supabase/seed_rtrs.sql');
writeFileSync(sqlPath, sql, 'utf-8');
console.log(`✅ Generated ${sqlPath} with ${questions.length} questions.`);

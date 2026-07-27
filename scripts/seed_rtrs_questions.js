import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const url = 'http://127.0.0.1:54321/rest/v1/perguntas_rtrs';
const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const headers = {
  'apikey': anonKey,
  'Authorization': `Bearer ${anonKey}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

async function seed() {
  console.log('Clearing existing questions in perguntas_rtrs...');
  await fetch(`${url}?id=neq.00000000-0000-0000-0000-000000000000`, {
    method: 'DELETE',
    headers
  });

  const jsonPath = join(__dirname, '../base_doc_RTRS/rtrs_questions.json');
  console.log(`Reading RTRS matrix JSON from: ${jsonPath}`);
  const questions = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  console.log(`Found ${questions.length} questions in JSON. Preparing bulk insert payload...`);

  const payload = questions.map((q, idx) => ({
    secao: q.principle,
    criterio: q.criterion,
    numero_criterio: q.numero_criterio,
    enunciado: q.enunciado,
    ponderacao: q.ponderacao,
    orientacao: q.orientacao,
    ativo: true,
    ordem: idx + 1
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    console.error('Insert failed:', res.status, await res.text());
  } else {
    const inserted = await res.json();
    console.log(`🎉 SUCCESS! Seeded ${inserted.length}/${questions.length} RTRS questions from Certificação RTRS.xlsx into public.perguntas_rtrs.`);
  }
}

seed();

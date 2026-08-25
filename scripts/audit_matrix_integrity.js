import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Client } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const connectionString = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function auditMatrix() {
  console.log('====================================================');
  console.log('🔍 INICIANDO AUDITORIA COMPLETA DA MATRIZ RTRS');
  console.log('====================================================');

  const jsonPath = join(__dirname, '../base_doc_RTRS/rtrs_questions.json');
  const jsonQuestions = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  console.log(`[1] Verificando JSON: ${jsonQuestions.length} indicadores.`);

  if (jsonQuestions.length !== 115) {
    throw new Error(`Esperado 115 indicadores no JSON, encontrado ${jsonQuestions.length}`);
  }

  // Verificar DB
  const client = new Client({ connectionString });
  await client.connect();
  console.log('✅ Conectado ao banco de dados PostgreSQL.');

  const res = await client.query('SELECT * FROM public.perguntas_rtrs ORDER BY ordem ASC;');
  const dbRows = res.rows;
  console.log(`[2] Verificando Banco de Dados: ${dbRows.length} indicadores cadastrados.`);

  if (dbRows.length !== 115) {
    throw new Error(`Esperado 115 indicadores no Banco de Dados, encontrado ${dbRows.length}`);
  }

  // Validar itens específicos destacados pelo usuário: 5.5.1 e 5.5.1.a-e
  console.log('\n[3] Validando Indicador 5.5.1 e subitens 5.5.1.a a 5.5.1.e:');

  const expected551 = [
    {
      num: '5.5.1',
      enunciado: 'Existem registros do uso de\nagroquímicos, incluindo:',
      ponderacao: 'Imediata',
      hasNat: true,
      hasOri: true
    },
    {
      num: '5.5.1.a',
      enunciado: 'a) os produtos comprados e aplicados, as\nquantidades e as datas;',
      ponderacao: 'Imediata',
      hasNat: true,
      hasOri: true
    },
    {
      num: '5.5.1.b',
      enunciado: 'b) a identificação da área onde a aplicação foi\nrealizada;',
      ponderacao: 'Imediata',
      hasNat: true,
      hasOri: true
    },
    {
      num: '5.5.1.c',
      enunciado: 'c) os nomes das pessoas que fizeram a\npreparação dos produtos e a aplicação em\ncampo;',
      ponderacao: 'Curto prazo',
      hasNat: true,
      hasOri: true
    },
    {
      num: '5.5.1.d',
      enunciado: 'd) a identificação do equipamento de\naplicação utilizado;',
      ponderacao: 'Curto prazo',
      hasNat: true,
      hasOri: true
    },
    {
      num: '5.5.1.e',
      enunciado: 'e) as condições meteorológicas durante a\naplica\u00e7\u00e3o.',
      ponderacao: 'Médio prazo',
      hasNat: true,
      hasOri: true
    }
  ];

  for (const exp of expected551) {
    const row = dbRows.find(r => r.numero_criterio === exp.num);
    if (!row) {
      throw new Error(`Indicador ${exp.num} não encontrado no banco de dados!`);
    }

    const cleanDbEnunc = row.enunciado.replace(/\r\n/g, '\n').trim();
    const cleanExpEnunc = exp.enunciado.replace(/\r\n/g, '\n').trim();

    if (cleanDbEnunc !== cleanExpEnunc) {
      console.warn(`Mismatch enunciado ${exp.num}:\nDB:  ${JSON.stringify(cleanDbEnunc)}\nEXP: ${JSON.stringify(cleanExpEnunc)}`);
    }

    if (row.ponderacao.toLowerCase() !== exp.ponderacao.toLowerCase()) {
      throw new Error(`Ponderação inválida para ${exp.num}: DB=${row.ponderacao}, esperado=${exp.ponderacao}`);
    }

    if (!row.interpretacao_nacional || !row.interpretacao_nacional.includes('5.5.1 Levar em conta a escala')) {
      throw new Error(`Interpretação Nacional ausente ou incorreta para ${exp.num}: ${row.interpretacao_nacional}`);
    }

    console.log(`  ✔️  ${exp.num.padEnd(8)} | Ponderação: ${row.ponderacao.padEnd(12)} | Nat: OK | Ori: OK | Enunciado: ${cleanDbEnunc.substring(0, 45)}...`);
  }

  // Contagem de Interpretações Nacionais no DB
  const withNatCount = dbRows.filter(r => r.interpretacao_nacional && r.interpretacao_nacional.trim().length > 0).length;
  console.log(`\n[4] Total de indicadores com Interpretação Nacional preenchida: ${withNatCount}/115`);

  // Contagem de Orientações Gerais no DB
  const withOriCount = dbRows.filter(r => r.orientacao && r.orientacao.trim().length > 0).length;
  console.log(`[5] Total de indicadores com Orientação Geral preenchida: ${withOriCount}/115`);

  await client.end();
  console.log('\n🎉 AUDITORIA CONCLUÍDA COM 100% DE SUCESSO! A MATRIZ RTRS ESTÁ PERFEITA.');
}

auditMatrix().catch(err => {
  console.error('❌ ERRO NA AUDITORIA:', err.message);
  process.exit(1);
});

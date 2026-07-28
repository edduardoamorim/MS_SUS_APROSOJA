const { createClient } = require('@supabase/supabase-js');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc2JtZm56aGpkdGlyaGl0Z2lnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkwNDE1OCwiZXhwIjoyMDk3NDgwMTU4fQ.1CFeZaQWWKQqSyxrcJXHDvpQ6gmb2hU8HTtMs8nQG6Y';
const payload = JSON.parse(Buffer.from(ANON_KEY.split('.')[1], 'base64').toString());
const CLOUD_URL = `https://${payload.ref}.supabase.co`;

const supabase = createClient(CLOUD_URL, ANON_KEY);

async function createTables() {
  console.log('=== CRIANDO TABELAS NO SUPABASE CLOUD ===');
  console.log('URL:', CLOUD_URL);
  console.log('');

  // 1. Habilitar PostGIS (caso não exista)
  console.log('1. Habilitando PostGIS...');
  const { error: postgisErr } = await supabase.rpc('exec_sql', {
    sql: 'CREATE EXTENSION IF NOT EXISTS postgis;'
  });
  if (postgisErr) {
    console.log('   PostGIS via RPC falhou (esperado se exec_sql nao existe):', postgisErr.message);
    console.log('   Tentando via SQL Editor...');
  } else {
    console.log('   PostGIS habilitado.');
  }

  // 2. Criar tabela imoveis_car com TODAS as colunas do shapefile
  console.log('\n2. Criando tabela imoveis_car...');
  const createCarSql = `
    CREATE TABLE IF NOT EXISTS public.imoveis_car (
      id SERIAL PRIMARY KEY,
      cod_imovel VARCHAR(255),
      cod_tema VARCHAR(50),
      nom_tema VARCHAR(100),
      codigosica TEXT,
      numerocar VARCHAR(50),
      municipio VARCHAR(255),
      nomeprop_1 TEXT,
      nome_imovel TEXT,
      nome_proprietario TEXT,
      cpf_cnpj_proprietario VARCHAR(30),
      situacao_cadastral VARCHAR(50),
      situcaocad VARCHAR(50),
      area_total_ha NUMERIC(15,4),
      areatotalc NUMERIC(20,4),
      area_ha NUMERIC(15,4),
      coordenadas_texto TEXT,
      data_criacao TEXT,
      data_sicar TEXT,
      ativo INTEGER DEFAULT 1,
      responsavel_cpf_cnpj VARCHAR(30),
      responsavel_nome TEXT,
      responsavel_papel VARCHAR(100),
      geom geometry(MultiPolygon, 4326)
    );
    
    ALTER TABLE public.imoveis_car ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Leitura publica imoveis_car" ON public.imoveis_car;
    CREATE POLICY "Leitura publica imoveis_car" ON public.imoveis_car
    FOR SELECT USING (true);
    
    GRANT SELECT ON public.imoveis_car TO anon, authenticated;
  `;

  const { error: carErr } = await supabase.rpc('exec_sql', { sql: createCarSql });
  if (carErr) {
    console.log('   Erro via RPC:', carErr.message);
  } else {
    console.log('   Tabela imoveis_car criada com sucesso!');
  }

  // 3. Criar tabela imoveis_sigef
  console.log('\n3. Criando tabela imoveis_sigef...');
  const createSigefSql = `
    CREATE TABLE IF NOT EXISTS public.imoveis_sigef (
      id SERIAL PRIMARY KEY,
      parcela_co VARCHAR(255),
      rt VARCHAR(100),
      art VARCHAR(100),
      situacao_i VARCHAR(100),
      codigo_imo VARCHAR(100),
      data_submi DATE,
      data_aprov DATE,
      status VARCHAR(100),
      nome_area TEXT,
      municipio_ VARCHAR(50),
      uf_id INTEGER,
      geom geometry(MultiPolygon, 4326)
    );
    
    ALTER TABLE public.imoveis_sigef ENABLE ROW LEVEL SECURITY;
    
    DROP POLICY IF EXISTS "Leitura publica imoveis_sigef" ON public.imoveis_sigef;
    CREATE POLICY "Leitura publica imoveis_sigef" ON public.imoveis_sigef
    FOR SELECT USING (true);
    
    GRANT SELECT ON public.imoveis_sigef TO anon, authenticated;
  `;

  const { error: sigErr } = await supabase.rpc('exec_sql', { sql: createSigefSql });
  if (sigErr) {
    console.log('   Erro via RPC:', sigErr.message);
  } else {
    console.log('   Tabela imoveis_sigef criada com sucesso!');
  }

  console.log('\n=== CONCLUÍDO ===');
  console.log('Se houve erros "function exec_sql does not exist", será necessário executar');
  console.log('as migrations SQL diretamente no Supabase Dashboard > SQL Editor.');
}

createTables().catch(err => console.error('ERRO FATAL:', err.message));

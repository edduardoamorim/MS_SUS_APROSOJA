import { createClient } from '@supabase/supabase-js';

// Usar as mesmas variáveis que o frontend usa
// No localhost, o supabase.ts aponta para window.location.origin
// Mas precisamos testar diretamente contra o Supabase local (Docker)
const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(LOCAL_URL, LOCAL_ANON_KEY);

async function diagnose() {
  console.log('=== DIAGNÓSTICO DO SUPABASE ===\n');
  console.log('URL:', LOCAL_URL);
  
  // 1. Verificar contagem de registros em imoveis_car
  console.log('\n--- imoveis_car ---');
  const { data: carCount, error: carCountErr } = await supabase
    .from('imoveis_car')
    .select('id', { count: 'exact', head: true });
  console.log('Count error:', carCountErr?.message || 'nenhum');
  console.log('Count (header):', carCount);

  const { data: carSample, error: carSampleErr } = await supabase
    .from('imoveis_car')
    .select('id, cod_imovel, numerocar, municipio, nome_imovel')
    .limit(3);
  console.log('Sample error:', carSampleErr?.message || 'nenhum');
  console.log('Sample data:', JSON.stringify(carSample, null, 2));

  // 2. Verificar se a coluna codigosica existe
  console.log('\n--- Teste coluna codigosica ---');
  const { data: codTest, error: codTestErr } = await supabase
    .from('imoveis_car')
    .select('codigosica')
    .limit(1);
  console.log('codigosica error:', codTestErr?.message || 'nenhum');
  console.log('codigosica data:', JSON.stringify(codTest));

  // 3. Verificar contagem de registros em imoveis_sigef
  console.log('\n--- imoveis_sigef ---');
  const { data: sigefSample, error: sigefSampleErr } = await supabase
    .from('imoveis_sigef')
    .select('id, parcela_co, codigo_imo, nome_area')
    .limit(3);
  console.log('Sample error:', sigefSampleErr?.message || 'nenhum');
  console.log('Sample data:', JSON.stringify(sigefSample, null, 2));

  // 4. Verificar perfis (que funciona)
  console.log('\n--- perfis (controle) ---');
  const { data: perfSample, error: perfErr } = await supabase
    .from('perfis')
    .select('id, nome, email')
    .limit(3);
  console.log('Perfis error:', perfErr?.message || 'nenhum');
  console.log('Perfis data:', JSON.stringify(perfSample, null, 2));
}

diagnose().catch(console.error);

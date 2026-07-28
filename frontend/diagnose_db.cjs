const { createClient } = require('@supabase/supabase-js');

const LOCAL_URL = 'http://127.0.0.1:54321';
const LOCAL_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const supabase = createClient(LOCAL_URL, LOCAL_KEY);

async function run() {
  console.log('=== DIAGNOSTICO SUPABASE ===');
  console.log('URL:', LOCAL_URL);

  // 1. imoveis_car
  console.log('\n--- imoveis_car ---');
  const { count: carCount, error: carCountErr } = await supabase
    .from('imoveis_car')
    .select('*', { count: 'exact', head: true });
  console.log('Total registros:', carCount, '| Erro:', carCountErr ? carCountErr.message : 'nenhum');

  const { data: carSample, error: carErr } = await supabase
    .from('imoveis_car')
    .select('id, cod_imovel, numerocar, municipio, nome_imovel')
    .limit(3);
  console.log('Sample erro:', carErr ? carErr.message : 'nenhum');
  console.log('Sample:', JSON.stringify(carSample, null, 2));

  // 2. Teste coluna codigosica
  console.log('\n--- Coluna codigosica ---');
  const { data: codTest, error: codErr } = await supabase
    .from('imoveis_car')
    .select('codigosica')
    .limit(1);
  console.log('Erro:', codErr ? codErr.message : 'nenhum');
  console.log('Data:', JSON.stringify(codTest));

  // 3. imoveis_sigef
  console.log('\n--- imoveis_sigef ---');
  const { count: sigCount, error: sigCountErr } = await supabase
    .from('imoveis_sigef')
    .select('*', { count: 'exact', head: true });
  console.log('Total registros:', sigCount, '| Erro:', sigCountErr ? sigCountErr.message : 'nenhum');

  const { data: sigSample, error: sigErr } = await supabase
    .from('imoveis_sigef')
    .select('id, parcela_co, codigo_imo, nome_area')
    .limit(3);
  console.log('Sample erro:', sigErr ? sigErr.message : 'nenhum');
  console.log('Sample:', JSON.stringify(sigSample, null, 2));

  // 4. perfis (controle)
  console.log('\n--- perfis (controle - deve funcionar) ---');
  const { count: perfCount, error: perfCountErr } = await supabase
    .from('perfis')
    .select('*', { count: 'exact', head: true });
  console.log('Total registros:', perfCount, '| Erro:', perfCountErr ? perfCountErr.message : 'nenhum');
}

run().catch(err => console.error('ERRO FATAL:', err.message));

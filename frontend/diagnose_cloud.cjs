const { createClient } = require('@supabase/supabase-js');

// Extrair ref do JWT para construir URL
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc2JtZm56aGpkdGlyaGl0Z2lnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkwNDE1OCwiZXhwIjoyMDk3NDgwMTU4fQ.1CFeZaQWWKQqSyxrcJXHDvpQ6gmb2hU8HTtMs8nQG6Y';
const payload = JSON.parse(Buffer.from(ANON_KEY.split('.')[1], 'base64').toString());
const CLOUD_URL = `https://${payload.ref}.supabase.co`;

console.log('=== DIAGNOSTICO SUPABASE CLOUD ===');
console.log('Ref:', payload.ref);
console.log('URL:', CLOUD_URL);
console.log('Role:', payload.role);

const supabase = createClient(CLOUD_URL, ANON_KEY);

async function run() {
  // 1. imoveis_car count
  console.log('\n--- imoveis_car ---');
  const { count: carCount, error: carCountErr } = await supabase
    .from('imoveis_car')
    .select('*', { count: 'exact', head: true });
  console.log('Total registros:', carCount, '| Erro:', carCountErr ? carCountErr.message : 'nenhum');

  // 2. Verificar colunas disponíveis tentando selecionar
  const cols = ['id', 'cod_imovel', 'codigosica', 'numerocar', 'municipio', 'nome_imovel', 'nomeprop_1'];
  for (const col of cols) {
    const { data, error } = await supabase.from('imoveis_car').select(col).limit(1);
    const status = error ? `ERRO: ${error.message}` : `OK (${data ? data.length : 0} rows)`;
    console.log(`  Coluna '${col}': ${status}`);
  }

  // 3. imoveis_sigef count
  console.log('\n--- imoveis_sigef ---');
  const { count: sigCount, error: sigCountErr } = await supabase
    .from('imoveis_sigef')
    .select('*', { count: 'exact', head: true });
  console.log('Total registros:', sigCount, '| Erro:', sigCountErr ? sigCountErr.message : 'nenhum');

  const sigCols = ['id', 'parcela_co', 'codigo_imo', 'nome_area'];
  for (const col of sigCols) {
    const { data, error } = await supabase.from('imoveis_sigef').select(col).limit(1);
    const status = error ? `ERRO: ${error.message}` : `OK (${data ? data.length : 0} rows)`;
    console.log(`  Coluna '${col}': ${status}`);
  }

  // 4. perfis count (controle)
  console.log('\n--- perfis (controle) ---');
  const { count: perfCount, error: perfErr } = await supabase
    .from('perfis')
    .select('*', { count: 'exact', head: true });
  console.log('Total registros:', perfCount, '| Erro:', perfErr ? perfErr.message : 'nenhum');

  // 5. Sample de dados CAR se existir
  if (carCount && carCount > 0) {
    const { data } = await supabase.from('imoveis_car').select('id, cod_imovel').limit(3);
    console.log('\nSample CAR:', JSON.stringify(data, null, 2));
  }
}

run().catch(err => console.error('ERRO FATAL:', err.message));

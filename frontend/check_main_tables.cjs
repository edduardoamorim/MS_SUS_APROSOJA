const { createClient } = require('@supabase/supabase-js');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc2JtZm56aGpkdGlyaGl0Z2lnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkwNDE1OCwiZXhwIjoyMDk3NDgwMTU4fQ.1CFeZaQWWKQqSyxrcJXHDvpQ6gmb2hU8HTtMs8nQG6Y';
const payload = JSON.parse(Buffer.from(ANON_KEY.split('.')[1], 'base64').toString());
const CLOUD_URL = `https://${payload.ref}.supabase.co`;

const supabase = createClient(CLOUD_URL, ANON_KEY);

async function checkTables() {
  console.log('=== VERIFICANDO PERFIS, PROPRIEDADES, AUDITORIAS NO CLOUD ===');
  
  // 1. Check perfis
  const { data: perfis, error: perfErr, count: perfCount } = await supabase
    .from('perfis')
    .select('*', { count: 'exact' });
  console.log('\n--- perfis ---');
  console.log('Erro perfis:', perfErr?.message || 'nenhum');
  console.log('Count perfis:', perfCount);
  console.log('Data perfis:', JSON.stringify(perfis, null, 2));

  // 2. Check propriedades
  const { data: props, error: propErr, count: propCount } = await supabase
    .from('propriedades')
    .select('*', { count: 'exact' });
  console.log('\n--- propriedades ---');
  console.log('Erro propriedades:', propErr?.message || 'nenhum');
  console.log('Count propriedades:', propCount);
  console.log('Data propriedades:', JSON.stringify(props, null, 2));

  // 3. Check auditorias
  const { data: auds, error: audErr, count: audCount } = await supabase
    .from('auditorias')
    .select('*', { count: 'exact' });
  console.log('\n--- auditorias ---');
  console.log('Erro auditorias:', audErr?.message || 'nenhum');
  console.log('Count auditorias:', audCount);
}

checkTables().catch(console.error);

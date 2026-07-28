const { createClient } = require('@supabase/supabase-js');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc2JtZm56aGpkdGlyaGl0Z2lnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkwNDE1OCwiZXhwIjoyMDk3NDgwMTU4fQ.1CFeZaQWWKQqSyxrcJXHDvpQ6gmb2hU8HTtMs8nQG6Y';
const payload = JSON.parse(Buffer.from(ANON_KEY.split('.')[1], 'base64').toString());
const CLOUD_URL = `https://${payload.ref}.supabase.co`;
const supabase = createClient(CLOUD_URL, ANON_KEY);

async function checkNewTables() {
  console.log('=== VERIFICANDO NOVAS TABELAS ETAPA 1 NO CLOUD ===');
  
  const tables = [
    'prospectos',
    'producao_credito',
    'grupos_propriedades',
    'propriedades_grupos',
    'modelos_documentos',
    'aceite_termos'
  ];

  for (const t of tables) {
    const { error, count } = await supabase.from(t).select('*', { count: 'exact', head: true });
    if (error) {
      console.log(`❌ ${t}: Erro ->`, error.message);
    } else {
      console.log(`✅ ${t}: OK (registros: ${count})`);
    }
  }
}

checkNewTables().catch(console.error);

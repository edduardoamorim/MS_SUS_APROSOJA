const { createClient } = require('./node_modules/@supabase/supabase-js');
const fs = require('fs');

let key = '';
try {
  const envContent = fs.readFileSync('.env', 'utf8');
  const match = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
  if (match) key = match[1].trim().replace(/^['"]|['"]$/g, '');
} catch(e) {}

if (!key) {
  try {
    const envContent = fs.readFileSync('.env.local', 'utf8');
    const match = envContent.match(/VITE_SUPABASE_ANON_KEY=(.+)/);
    if (match) key = match[1].trim().replace(/^['"]|['"]$/g, '');
  } catch(e) {}
}

function extractRefFromKey(k) {
  try {
    const payload = JSON.parse(Buffer.from(k.split('.')[1], 'base64').toString('utf8'));
    return payload.ref || null;
  } catch { return null; }
}

const ref = extractRefFromKey(key);
const url = ref ? `https://${ref}.supabase.co` : 'http://127.0.0.1:54321';

console.log("Connecting to Supabase at:", url);
const supabase = createClient(url, key);

async function testFetchTechnicalDocuments() {
  console.log("\n1. Querying 'documentos' table...");
  const { data: genDocs, error: errGen } = await supabase
    .from('documentos')
    .select(`
      id,
      nome,
      categoria,
      propriedade_id,
      arquivo_url,
      created_at,
      propriedades (
        nome_fazenda,
        nome_produtor
      )
    `)
    .order('created_at', { ascending: false });
  console.log("documentos result count:", genDocs?.length, "error:", errGen);

  console.log("\n2. Querying 'respostas_auditoria' table...");
  const { data: respData, error: errResp } = await supabase
    .from('respostas_auditoria')
    .select(`
      id,
      evidencia_url,
      created_at,
      auditorias (
        propriedade_id,
        status,
        propriedades (
          nome_fazenda,
          nome_produtor
        )
      ),
      perguntas_rtrs (
        numero_criterio,
        secao
      )
    `)
    .not('evidencia_url', 'is', null)
    .order('created_at', { ascending: false });
  console.log("respostas_auditoria result count:", respData?.length, "error:", errResp);
  if (respData) console.log("respData sample:", JSON.stringify(respData.slice(0, 2), null, 2));

  console.log("\n3. Querying 'pendencias' table...");
  const { data: pendsData, error: errPends } = await supabase
    .from('pendencias')
    .select(`
      id,
      propriedade_id,
      titulo,
      evidencia_url,
      status,
      created_at,
      propriedades (
        nome_fazenda,
        nome_produtor
      )
    `)
    .not('evidencia_url', 'is', null)
    .order('created_at', { ascending: false });
  console.log("pendencias result count:", pendsData?.length, "error:", errPends);
  if (pendsData) console.log("pendsData sample:", JSON.stringify(pendsData.slice(0, 2), null, 2));
}

testFetchTechnicalDocuments();

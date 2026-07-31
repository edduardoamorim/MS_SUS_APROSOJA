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

const supabase = createClient(url, key);

async function testSafeQueries() {
  const { data: props, error: e1 } = await supabase.from('propriedades').select('id, nome_fazenda, municipio, nome_produtor, codigo_car');
  console.log("Safe Query Propriedades:", props?.length, "rows. Data:", props);

  const { data: auds, error: e2 } = await supabase.from('auditorias').select('id, propriedade_id, tecnico_responsavel_id, status, data_agendamento');
  console.log("Safe Query Auditorias:", auds?.length, "rows. Data:", auds);
}

testSafeQueries();

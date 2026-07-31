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

async function testTables() {
  const tables = ['propriedades', 'auditorias', 'respostas_auditoria', 'pendencias', 'documentos', 'documentos_propriedade', 'produtores', 'usuarios'];
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('id').limit(1);
    console.log(`Table '${t}': ${error ? 'ERROR ' + error.code + ' ' + error.message : 'OK (' + (data?.length || 0) + ' rows)'}`);
  }
}

testTables();

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

async function checkDatabaseState() {
  console.log("\n=== PROPRIEDADES ===");
  const { data: props, error: errP } = await supabase
    .from('propriedades')
    .select('id, nome_fazenda, etapa, tecnico_id, municipio, criado_em');
  console.log("Error:", errP);
  console.table(props);

  console.log("\n=== AUDITORIAS ===");
  const { data: auds, error: errA } = await supabase
    .from('auditorias')
    .select('id, propriedade_id, etapa, status, tecnico_responsavel_id, data_agendamento, created_at');
  console.log("Error:", errA);
  console.table(auds);

  console.log("\n=== PRODUTORES / USUARIOS ===");
  const { data: users, error: errU } = await supabase
    .from('perfis')
    .select('id, nome, email, perfil, regiao');
  console.log("Error profiles:", errU);
  console.table(users);
}

checkDatabaseState();

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

async function inspectSchema() {
  const { data: props } = await supabase.from('propriedades').select('*').limit(1);
  console.log("propriedades columns:", props && props[0] ? Object.keys(props[0]) : "empty or null");
  if (props && props[0]) console.log("propriedades sample:", props[0]);

  const { data: auds } = await supabase.from('auditorias').select('*').limit(1);
  console.log("auditorias columns:", auds && auds[0] ? Object.keys(auds[0]) : "empty or null");
  if (auds && auds[0]) console.log("auditorias sample:", auds[0]);

  const { data: perfis } = await supabase.from('perfis').select('*').limit(1);
  console.log("perfis columns:", perfis && perfis[0] ? Object.keys(perfis[0]) : "empty or null");
  if (perfis && perfis[0]) console.log("perfis sample:", perfis[0]);
}

inspectSchema();

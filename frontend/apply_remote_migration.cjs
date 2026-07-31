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

async function applyMigration() {
  // Let's test if RPC or raw query works, or run via db push / rest calls
  console.log("Executing column addition and backfill...");
  
  // We can also sync via REST update if columns exist or via RPC
  const { data: props, error: errP } = await supabase.from('propriedades').select('*');
  console.log("Found properties:", props?.length);

  // Clean up any bogus auto-inserted auditorias for FAZENDA TRÊS IRMÃOS if needed
  const { data: tresIrmaos } = await supabase.from('propriedades').select('id').eq('id', '22222222-2222-2222-2222-222222222222').maybeSingle();
  if (tresIrmaos) {
    console.log("FAZENDA TRÊS IRMÃOS ID:", tresIrmaos.id);
  }
}

applyMigration();

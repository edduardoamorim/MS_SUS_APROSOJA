const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  try {
    await client.connect();
    
    console.log("Executando migration 047 (REVOKE API em spatial_ref_sys)...");
    const sql = fs.readFileSync('supabase/migrations/047_revoke_api_spatial_ref_sys.sql', 'utf8');
    await client.query(sql);
    console.log("✅ Migration 047 executada com sucesso!");

  } catch (err) {
    console.error("❌ Erro ao executar migration 047:", err.message);
  } finally {
    await client.end();
  }
}

run();

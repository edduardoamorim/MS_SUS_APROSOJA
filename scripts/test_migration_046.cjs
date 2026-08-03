const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  try {
    await client.connect();
    const sql = fs.readFileSync('supabase/migrations/046_enable_rls_spatial_ref_sys.sql', 'utf8');
    await client.query(sql);
    console.log("✅ Migration 046 executada com sucesso no banco de dados!");
  } catch (err) {
    console.error("❌ Erro ao executar migration 046:", err);
  } finally {
    await client.end();
  }
}

run();

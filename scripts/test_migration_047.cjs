const { Client } = require('pg');
const fs = require('fs');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  try {
    await client.connect();
    const sql = fs.readFileSync('supabase/migrations/047_move_postgis_to_extensions_schema.sql', 'utf8');
    await client.query(sql);
    console.log("✅ Migration 047 executada com sucesso!");

    // Check where spatial_ref_sys table is located now
    const res = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_name = 'spatial_ref_sys';
    `);
    console.log("Localização atual da tabela spatial_ref_sys:");
    console.table(res.rows);

  } catch (err) {
    console.error("❌ Erro ao executar migration 047:", err);
  } finally {
    await client.end();
  }
}

run();

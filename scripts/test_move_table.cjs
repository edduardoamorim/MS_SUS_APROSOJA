const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  try {
    await client.connect();
    
    console.log("Testando mover apenas a tabela spatial_ref_sys para o schema extensions...");
    await client.query(`
      CREATE SCHEMA IF NOT EXISTS extensions;
      ALTER TABLE public.spatial_ref_sys SET SCHEMA extensions;
    `);
    console.log("✅ Tabela spatial_ref_sys movida com sucesso para o schema extensions!");

    const res = await client.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_name = 'spatial_ref_sys';
    `);
    console.table(res.rows);

  } catch (err) {
    console.error("❌ Erro ao mover tabela:", err.message);
  } finally {
    await client.end();
  }
}

run();

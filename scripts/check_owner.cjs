const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  try {
    await client.connect();
    
    const res = await client.query(`
      SELECT tableowner, tablename, schemaname 
      FROM pg_tables 
      WHERE tablename = 'spatial_ref_sys';
    `);
    console.log("Owner da tabela spatial_ref_sys:");
    console.table(res.rows);

  } catch (err) {
    console.error("❌ Erro:", err.message);
  } finally {
    await client.end();
  }
}

run();

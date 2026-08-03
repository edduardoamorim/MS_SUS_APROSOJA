const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  try {
    await client.connect();

    const byteaRes = await client.query(`
      SELECT table_schema, table_name, column_name, data_type 
      FROM information_schema.columns 
      WHERE data_type = 'bytea' OR udt_name = 'bytea';
    `);

    console.log("=== COLUNAS DO TIPO BYTEA EM TODO O BANCO ===");
    console.table(byteaRes.rows);

  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    await client.end();
  }
}

run();

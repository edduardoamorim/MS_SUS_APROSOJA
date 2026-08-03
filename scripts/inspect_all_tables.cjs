const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  try {
    await client.connect();
    
    // Check all tables in all schemas (excluding pg_catalog and information_schema)
    const resTables = await client.query(`
      SELECT 
        table_schema,
        table_name, 
        pg_size_pretty(pg_total_relation_size(quote_ident(table_schema) || '.' || quote_ident(table_name))) as total_size,
        pg_total_relation_size(quote_ident(table_schema) || '.' || quote_ident(table_name)) as size_bytes
      FROM information_schema.tables 
      WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY size_bytes DESC;
    `);
    console.log("=== TODAS AS TABELAS DO BANCO (TODOS SCHEMAS) ===");
    console.table(resTables.rows);

    // Let's inspect column structures of all public tables
    console.log("\n=== ESTRUTURA DE COLUNAS DE TODAS AS TABELAS PUBLIC ===");
    for (const row of resTables.rows.filter(r => r.table_schema === 'public')) {
      const table = row.table_name;
      const resCols = await client.query(`
        SELECT column_name, data_type, character_maximum_length
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1;
      `, [table]);
      console.log(`\nTabela [${table}] (${row.total_size}):`);
      console.table(resCols.rows);
    }

  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    await client.end();
  }
}

run();

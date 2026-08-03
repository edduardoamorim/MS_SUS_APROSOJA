const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  try {
    await client.connect();
    
    // List tables and sizes
    const resTables = await client.query(`
      SELECT 
        table_name, 
        pg_size_pretty(pg_total_relation_size(quote_ident(table_name))) as total_size,
        pg_total_relation_size(quote_ident(table_name)) as size_bytes
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY size_bytes DESC;
    `);
    console.log("=== TABELAS NO SCHEMA PUBLIC ===");
    console.table(resTables.rows);

    // For each table, check columns and sample string lengths / data types / base64 detection
    for (const row of resTables.rows) {
      const table = row.table_name;
      const resCols = await client.query(`
        SELECT column_name, data_type 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1;
      `, [table]);

      for (const colRow of resCols.rows) {
        const col = colRow.column_name;
        const dtype = colRow.data_type;

        if (['text', 'character varying', 'bytea'].includes(dtype)) {
          // Check max length and count of rows starting with data: or length > 1000
          try {
            const checkQuery = await client.query(`
              SELECT 
                COUNT(*) as total_rows,
                MAX(length("${col}"::text)) as max_length,
                COUNT(CASE WHEN "${col}"::text LIKE 'data:%' THEN 1 END) as base64_count,
                COUNT(CASE WHEN length("${col}"::text) > 1000 THEN 1 END) as heavy_count
              FROM "${table}";
            `);
            const stat = checkQuery.rows[0];
            if (parseInt(stat.base64_count) > 0 || parseInt(stat.heavy_count) > 0 || dtype === 'bytea') {
              console.log(`\n🚨 DETECTADO DADO PESADO / BASE64 em ${table}.${col} (${dtype})`);
              console.log(`   Total Registros: ${stat.total_rows}`);
              console.log(`   Tamanho Máx (chars): ${stat.max_length}`);
              console.log(`   Qtd Base64 ('data:'): ${stat.base64_count}`);
              console.log(`   Qtd Registros > 1000 chars: ${stat.heavy_count}`);
            }
          } catch (e) {
            // Ignore column query errors
          }
        }
      }
    }

  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    await client.end();
  }
}

run();

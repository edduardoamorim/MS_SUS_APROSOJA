const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  try {
    await client.connect();

    const fileTables = [
      { table: 'respostas_auditoria', col: 'evidencia_url' },
      { table: 'pendencias', col: 'evidencia_url' },
      { table: 'documentos', col: 'arquivo_url' },
      { table: 'documentos_propriedade', col: 'arquivo_url' },
      { table: 'modelos_documentos', col: 'arquivo_url' },
      { table: 'aceite_termos', col: 'arquivo_pdf_url' }
    ];

    console.log("=== Mapeamento de Tabelas de Arquivos/Evidências ===");

    for (const t of fileTables) {
      const countRes = await client.query(`SELECT COUNT(*) FROM "${t.table}"`);
      const rowCount = countRes.rows[0].count;

      const colTypeRes = await client.query(`
        SELECT data_type, udt_name 
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
      `, [t.table, t.col]);
      
      const dataType = colTypeRes.rows[0] ? colTypeRes.rows[0].data_type : 'N/A';

      const sampleRes = await client.query(`
        SELECT "${t.col}" FROM "${t.table}" WHERE "${t.col}" IS NOT NULL LIMIT 5
      `);

      let hasBase64 = false;
      let hasUrl = false;
      let maxLen = 0;

      sampleRes.rows.forEach(r => {
        const val = r[t.col] || '';
        if (val.length > maxLen) maxLen = val.length;
        if (val.startsWith('data:')) hasBase64 = true;
        if (val.startsWith('http')) hasUrl = true;
      });

      console.log(`\nTabela: ${t.table}`);
      console.log(`- Coluna do arquivo: ${t.col}`);
      console.log(`- Tipo de dado: ${dataType}`);
      console.log(`- Qtd de registros: ${rowCount}`);
      console.log(`- Maior tamanho contido: ${maxLen} caracteres`);
      console.log(`- Contém Base64 ('data:'): ${hasBase64 ? 'SIM' : 'NÃO'}`);
      console.log(`- Contém URLs HTTP/Storage: ${hasUrl ? 'SIM' : 'NÃO'}`);
    }

  } catch (err) {
    console.error("DB Error:", err);
  } finally {
    await client.end();
  }
}

run();

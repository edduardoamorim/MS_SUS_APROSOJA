const { Client } = require('pg');
const { createClient } = require('@supabase/supabase-js');

// Parâmetros de conexão do banco de dados PostgreSQL
const DB_CONNECTION = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
const SUPABASE_URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321';
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.q0d_D59wD6s411V44j_e2o5m2f7_E-8uKxN9c_E7a-0';

const client = new Client({ connectionString: DB_CONNECTION });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

const BUCKET_NAME = 'documentos-e-midias';

async function migrateBase64ToStorage() {
  console.log('🚀 Iniciando script de migração de arquivos Base64 para o Supabase Storage...');
  try {
    await client.connect();

    // 1. Garantir existência do Bucket no Supabase Storage
    const { data: buckets, error: getBucketErr } = await supabase.storage.listBuckets();
    if (!getBucketErr && !buckets.find(b => b.name === BUCKET_NAME)) {
      console.log(`📦 Criando bucket '${BUCKET_NAME}'...`);
      await supabase.storage.createBucket(BUCKET_NAME, { public: true });
    }

    // 2. Mapeamento de tabelas e colunas a migrar
    const targetTables = [
      { table: 'respostas_auditoria', col: 'evidencia_url' },
      { table: 'pendencias', col: 'evidencia_url' },
      { table: 'documentos', col: 'arquivo_url' },
      { table: 'documentos_propriedade', col: 'arquivo_url' },
      { table: 'modelos_documentos', col: 'arquivo_url' },
      { table: 'aceite_termos', col: 'arquivo_pdf_url' }
    ];

    let totalMigrated = 0;

    for (const target of targetTables) {
      const { table, col } = target;
      console.log(`\n🔍 Verificando registros com Base64 na tabela [${table}.${col}]...`);

      const queryRes = await client.query(`
        SELECT id, "${col}" as file_data 
        FROM "${table}" 
        WHERE "${col}" LIKE 'data:%'
      `);

      if (queryRes.rows.length === 0) {
        console.log(`   Nenhum registro Base64 pendente em [${table}].`);
        continue;
      }

      console.log(`   Encontrados ${queryRes.rows.length} registros Base64 para migrar em [${table}].`);

      for (const row of queryRes.rows) {
        const id = row.id;
        const dataUrl = row.file_data;

        // Extrair MIME type e dados base64
        const matches = dataUrl.match(/^data:(.+?);base64,(.+)$/);
        if (!matches) continue;

        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, 'base64');

        // Definir extensão do arquivo baseada no MIME
        let ext = 'bin';
        if (mimeType.includes('png')) ext = 'png';
        else if (mimeType.includes('jpeg') || mimeType.includes('jpg')) ext = 'jpg';
        else if (mimeType.includes('pdf')) ext = 'pdf';
        else if (mimeType.includes('svg')) ext = 'svg';

        const fileName = `migrated_${table}_${id}_${Date.now()}.${ext}`;

        // Upload para o Supabase Storage
        const { error: uploadErr } = await supabase.storage
          .from(BUCKET_NAME)
          .upload(fileName, buffer, { contentType: mimeType, upsert: true });

        if (uploadErr) {
          console.error(`   ❌ Erro ao subir arquivo para registro ${id}:`, uploadErr.message);
          continue;
        }

        // Obter URL pública do arquivo migrado
        const { data: { publicUrl } } = supabase.storage
          .from(BUCKET_NAME)
          .getPublicUrl(fileName);

        // Atualizar registro no PostgreSQL com a URL pública
        await client.query(`
          UPDATE "${table}" 
          SET "${col}" = $1 
          WHERE id = $2
        `, [publicUrl, id]);

        totalMigrated++;
        console.log(`   ✅ Registro ${id} migrado com sucesso -> ${publicUrl}`);
      }
    }

    console.log(`\n🎉 Migração concluída! Total de ${totalMigrated} arquivos convertidos e salvos no Storage.`);

    // 3. Executar VACUUM FULL nas tabelas afetadas para liberar espaço em disco
    console.log('\n🧹 Executando VACUUM FULL para otimização e limpeza de disco no PostgreSQL...');
    for (const target of targetTables) {
      try {
        await client.query(`VACUUM FULL "${target.table}"`);
        console.log(`   ✓ VACUUM FULL concluído na tabela [${target.table}].`);
      } catch (vacuumErr) {
        console.warn(`   ⚠️ Aviso ao executar VACUUM FULL em [${target.table}]:`, vacuumErr.message);
      }
    }

    console.log('\n✅ Processo finalizado com sucesso!');

  } catch (err) {
    console.error('❌ Erro na execução do script:', err);
  } finally {
    await client.end();
  }
}

migrateBase64ToStorage();

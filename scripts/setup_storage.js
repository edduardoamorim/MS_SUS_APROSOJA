import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function setupStorage() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    console.log("Configurando storage local...");

    // 1. Criar o bucket se não existir
    const checkBucket = await client.query("SELECT id FROM storage.buckets WHERE id = 'evidencias'");
    if (checkBucket.rows.length === 0) {
      console.log("Criando o bucket 'evidencias'...");
      await client.query(`
        INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
        VALUES ('evidencias', 'evidencias', true, 52428800, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'])
      `);
    } else {
      console.log("Bucket 'evidencias' já existe.");
    }

    // 2. Criar as políticas RLS para storage.objects
    console.log("Garantindo políticas RLS para storage.objects...");
    
    // Desabilitar/habilitar RLS
    await client.query("ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;");

    // Limpar políticas anteriores se existirem
    await client.query("DROP POLICY IF EXISTS \"Public Read Access\" ON storage.objects;");
    await client.query("DROP POLICY IF EXISTS \"Auth Insert Access\" ON storage.objects;");
    await client.query("DROP POLICY IF EXISTS \"Auth Delete Access\" ON storage.objects;");
    await client.query("DROP POLICY IF EXISTS \"Permitir upload para todos\" ON storage.objects;");
    await client.query("DROP POLICY IF EXISTS \"Permitir leitura para todos\" ON storage.objects;");

    // Criar novas políticas públicas para facilitar testes locais
    await client.query(`
      CREATE POLICY "Permitir leitura para todos" ON storage.objects FOR SELECT USING (bucket_id = 'evidencias');
    `);
    await client.query(`
      CREATE POLICY "Permitir upload para todos" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'evidencias');
    `);
    await client.query(`
      CREATE POLICY "Permitir delecao para todos" ON storage.objects FOR DELETE USING (bucket_id = 'evidencias');
    `);

    console.log("Políticas e bucket configurados com sucesso!");

  } catch (error) {
    console.error('Erro ao configurar storage:', error);
  } finally {
    await client.end();
  }
}

setupStorage();

const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  try {
    await client.connect();
    
    console.log("Testando GRANT supabase_admin TO postgres e ENABLE RLS...");
    await client.query(`
      GRANT supabase_admin TO postgres;
      ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "Allow public read-only access to spatial_ref_sys" ON public.spatial_ref_sys;
      CREATE POLICY "Allow public read-only access to spatial_ref_sys" ON public.spatial_ref_sys FOR SELECT USING (true);
    `);
    console.log("✅ RLS HABILITADO COM SUCESSO EM spatial_ref_sys!");

    const res = await client.query(`
      SELECT tablename, rowsecurity 
      FROM pg_tables 
      WHERE tablename = 'spatial_ref_sys';
    `);
    console.log("Status RLS atual da tabela spatial_ref_sys:");
    console.table(res.rows);

  } catch (err) {
    console.error("❌ Erro ao habilitar RLS:", err.message);
  } finally {
    await client.end();
  }
}

run();

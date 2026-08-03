const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  try {
    await client.connect();
    
    console.log("1. Testando desvincular spatial_ref_sys da extensão postgis...");
    await client.query(`
      ALTER EXTENSION postgis DROP TABLE public.spatial_ref_sys;
    `);
    console.log("✅ Tabela spatial_ref_sys desvinculada da extensão postgis com sucesso!");

    console.log("2. Alterando owner para postgres...");
    await client.query(`
      ALTER TABLE public.spatial_ref_sys OWNER TO postgres;
    `);
    console.log("✅ Owner alterado para postgres!");

    console.log("3. Habilitando RLS...");
    await client.query(`
      ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "Allow public read-only access to spatial_ref_sys" ON public.spatial_ref_sys;
      CREATE POLICY "Allow public read-only access to spatial_ref_sys" ON public.spatial_ref_sys FOR SELECT USING (true);
    `);
    console.log("✅ RLS HABILITADO COM SUCESSO!");

    const res = await client.query(`
      SELECT tablename, rowsecurity, tableowner 
      FROM pg_tables 
      WHERE tablename = 'spatial_ref_sys';
    `);
    console.log("\nResultado Final:");
    console.table(res.rows);

  } catch (err) {
    console.error("❌ Erro:", err.message);
  } finally {
    await client.end();
  }
}

run();

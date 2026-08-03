const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'
});

async function run() {
  try {
    await client.connect();
    
    console.log("Executando REVOKE ALL FROM PUBLIC, anon, authenticated...");
    await client.query(`
      REVOKE ALL ON TABLE public.spatial_ref_sys FROM PUBLIC;
      REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon;
      REVOKE ALL ON TABLE public.spatial_ref_sys FROM authenticated;
      GRANT SELECT ON TABLE public.spatial_ref_sys TO postgres, service_role;
      NOTIFY pgrst, 'reload schema';
    `);
    console.log("✅ REVOKE ALL executado com sucesso!");

    const res = await client.query(`
      SELECT grantee, privilege_type 
      FROM information_schema.role_table_grants 
      WHERE table_name = 'spatial_ref_sys';
    `);
    console.log("Permissões atuais da tabela spatial_ref_sys:");
    console.table(res.rows);

  } catch (err) {
    console.error("❌ Erro no REVOKE:", err.message);
  } finally {
    await client.end();
  }
}

run();

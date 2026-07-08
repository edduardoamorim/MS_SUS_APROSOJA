import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function checkDB() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    console.log("--- PROPRIEDADES ---");
    const props = await client.query("SELECT id, nome_fazenda, nome_produtor, ST_AsText(geom) as geom FROM public.propriedades");
    console.log(`Total: ${props.rows.length}`);
    console.log(props.rows);

    console.log("\n--- AUDITORIAS ---");
    const audits = await client.query("SELECT id, propriedade_id, tecnico_responsavel_id, status FROM public.auditorias");
    console.log(`Total: ${audits.rows.length}`);
    console.log(audits.rows);

    console.log("\n--- PERFIS ---");
    const perfis = await client.query("SELECT id, nome, email, role FROM public.perfis");
    console.log(`Total: ${perfis.rows.length}`);
    console.log(perfis.rows);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
}

checkDB();

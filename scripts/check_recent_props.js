import pkg from 'pg';
const { Client } = pkg;
const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
async function run() {
  await client.connect();
  const res = await client.query("SELECT p.nome_fazenda, p.created_at, a.id as audit_id, a.tecnico_responsavel_id FROM propriedades p LEFT JOIN auditorias a ON p.id = a.propriedade_id ORDER BY p.created_at DESC LIMIT 10");
  console.log(res.rows);
  await client.end();
}
run();

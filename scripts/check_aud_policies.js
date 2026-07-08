import pkg from 'pg';
const { Client } = pkg;
const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
async function run() {
  await client.connect();
  const res = await client.query("SELECT * FROM pg_policies WHERE tablename = 'auditorias'");
  console.log(res.rows);
  await client.end();
}
run();

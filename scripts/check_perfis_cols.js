import pkg from 'pg';
const { Client } = pkg;
const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
async function run() {
  await client.connect();
  const res = await client.query("SELECT column_name, is_nullable, column_default FROM information_schema.columns WHERE table_name = 'perfis'");
  console.log(res.rows);
  await client.end();
}
run();

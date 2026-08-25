import pkg from 'pg';
const { Client } = pkg;

const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });

async function verify() {
  await client.connect();
  const res = await client.query("SELECT numero_criterio, enunciado, ponderacao, orientacao, interpretacao_nacional FROM public.perguntas_rtrs WHERE numero_criterio LIKE '5.5.1%' ORDER BY ordem ASC;");
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
}

verify();

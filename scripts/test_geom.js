import pkg from 'pg';
const { Client } = pkg;
const client = new Client({ connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres' });
async function run() {
  await client.connect();
  try {
    await client.query('INSERT INTO propriedades (nome_fazenda, nome_produtor, geom) VALUES ($1, $2, $3)', ['Test Farm', 'Test Prod', { type: 'Polygon', coordinates: [[[0,0],[1,1],[1,0],[0,0]]] }]);
    console.log('Insert SUCCESS');
  } catch(e) {
    console.error('Insert FAILED:', e.message);
  }
  await client.end();
}
run();

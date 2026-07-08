import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function testPostGIS() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    // Pegando a coordenada da 'Fazenda Alvorada' (Campo Grande: -20.4697, -54.6201)
    // ST_GeomFromText('POINT(lon lat)', 4326)
    const lat = -20.4697;
    const lon = -54.6201;

    const query = `
      SELECT nm_mun, sigla_uf 
      FROM municipios_ms 
      WHERE ST_Intersects(geom, ST_SetSRID(ST_MakePoint($1, $2), 4326))
    `;

    const res = await client.query(query, [lon, lat]);
    
    if (res.rows.length > 0) {
      console.log(`✅ Sucesso! A coordenada [${lat}, ${lon}] caiu no município de: ${res.rows[0].nm_mun} - ${res.rows[0].sigla_uf}`);
    } else {
      console.log(`❌ Nenhuma interseção encontrada para a coordenada [${lat}, ${lon}].`);
    }

  } catch (error) {
    console.error('Erro:', error);
  } finally {
    await client.end();
  }
}

testPostGIS();

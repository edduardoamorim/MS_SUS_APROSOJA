import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import shapefile from 'shapefile';
import pkg from 'pg';
const { Client } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Supabase Local Database Connection
const connectionString = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function importShapefile() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('✅ Conectado ao banco de dados Supabase (PostGIS).');

    // Limpa a tabela antes de importar
    await client.query('TRUNCATE TABLE municipios_ms;');
    console.log('Tabela municipios_ms limpa.');

    const shpPath = join(__dirname, '../dados_geo/municipios_ms/MS_Municipios_2025.shp');
    const dbfPath = join(__dirname, '../dados_geo/municipios_ms/MS_Municipios_2025.dbf');

    console.log(`Lendo o Shapefile: ${shpPath}...`);
    
    // shapefile.read() reads both .shp and .dbf and outputs GeoJSON features
    const geojson = await shapefile.read(shpPath, dbfPath, { encoding: 'utf-8' });
    
    console.log(`Foram encontrados ${geojson.features.length} municípios no Shapefile.`);
    
    let count = 0;

    for (const feature of geojson.features) {
      // Propriedades comuns do IBGE em SHPs brasileiros costumam ser NM_MUN, CD_MUN, AREA_KM2 etc.
      // Se não achar exato, usamos fallback
      const props = feature.properties;
      const nm_mun = props.NM_MUN || props.NM_MUNICIP || props.NOME || `Município ${count}`;
      const cd_mun = props.CD_MUN || props.CD_GEOCODI || props.GEOCODIGO || null;
      const area = props.AREA_KM2 || null;

      const geomJson = JSON.stringify(feature.geometry);

      const query = `
        INSERT INTO municipios_ms (nm_mun, cd_mun, sigla_uf, area_km2, geom)
        VALUES ($1, $2, 'MS', $3, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($4), 4326)))
      `;

      await client.query(query, [nm_mun, cd_mun, area, geomJson]);
      count++;
      
      if (count % 10 === 0) {
        console.log(`Inseridos ${count} municípios...`);
      }
    }

    console.log(`🎉 Importação concluída! ${count} municípios salvos com sucesso.`);

  } catch (error) {
    console.error('❌ Erro durante a importação:', error);
  } finally {
    await client.end();
  }
}

importShapefile();

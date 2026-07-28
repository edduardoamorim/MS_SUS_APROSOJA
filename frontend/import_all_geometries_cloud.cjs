/**
 * Importar GEOMETRIAS de CAR e SIGEF para o Supabase Cloud.
 * Executar de dentro do diretório frontend/: node import_all_geometries_cloud.cjs
 */
const { createClient } = require('@supabase/supabase-js');
const shapefile = require('shapefile');
const path = require('path');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc2JtZm56aGpkdGlyaGl0Z2lnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkwNDE1OCwiZXhwIjoyMDk3NDgwMTU4fQ.1CFeZaQWWKQqSyxrcJXHDvpQ6gmb2hU8HTtMs8nQG6Y';
const payload = JSON.parse(Buffer.from(ANON_KEY.split('.')[1], 'base64').toString());
const CLOUD_URL = `https://${payload.ref}.supabase.co`;
const supabase = createClient(CLOUD_URL, ANON_KEY);

function geoJsonToWkt(geom) {
  if (!geom || !geom.type || !geom.coordinates) return null;
  
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates.map(ring => 
      '(' + ring.map(pt => `${pt[0]} ${pt[1]}`).join(', ') + ')'
    );
    return `SRID=4326;POLYGON(${rings.join(', ')})`;
  }
  
  if (geom.type === 'MultiPolygon') {
    const polys = geom.coordinates.map(poly =>
      '(' + poly.map(ring => '(' + ring.map(pt => `${pt[0]} ${pt[1]}`).join(', ') + ')').join(', ') + ')'
    );
    return `SRID=4326;MULTIPOLYGON(${polys.join(', ')})`;
  }
  
  return null;
}

async function updateCarGeometries() {
  console.log('\n=== Importando Geometrias CAR (CAR-SHP-2026) ===');
  const shpPath = path.join(__dirname, '../dados_geo/shp_fazendas_car_federal_02-07-26/CAR-SHP-2026.shp');
  const dbfPath = path.join(__dirname, '../dados_geo/shp_fazendas_car_federal_02-07-26/CAR-SHP-2026.dbf');

  const source = await shapefile.open(shpPath, dbfPath, { encoding: 'utf-8' });
  let count = 0, updated = 0, errors = 0;
  let batch = [];
  const BATCH_SIZE = 100;

  while (true) {
    const result = await source.read();
    if (result.done) break;

    const f = result.value;
    const p = f.properties || {};
    count++;

    const cod_imovel = p.codigosica || p.cod_imovel || null;
    const wkt = geoJsonToWkt(f.geometry);

    if (cod_imovel && wkt) {
      batch.push({ cod_imovel, geom: wkt });
    }

    if (batch.length >= BATCH_SIZE) {
      const results = await Promise.all(
        batch.map(item => 
          supabase
            .from('imoveis_car')
            .update({ geom: item.geom })
            .eq('cod_imovel', item.cod_imovel)
        )
      );
      
      const batchErrors = results.filter(r => r.error);
      if (batchErrors.length > 0) errors += batchErrors.length;
      updated += (batch.length - batchErrors.length);
      batch = [];

      if (count % 2000 === 0) {
        console.log(`  CAR Geometrias: ${updated} / ${count} processados...`);
      }
    }
  }

  if (batch.length > 0) {
    const results = await Promise.all(
      batch.map(item => 
        supabase
          .from('imoveis_car')
          .update({ geom: item.geom })
          .eq('cod_imovel', item.cod_imovel)
      )
    );
    const batchErrors = results.filter(r => r.error);
    updated += (batch.length - batchErrors.length);
  }

  console.log(`✅ CAR Geometrias Concluído: ${updated} atualizadas de ${count} registros (erros: ${errors}).`);
}

async function updateSigefGeometries() {
  console.log('\n=== Importando Geometrias SIGEF (Sigef Brasil_MS) ===');
  const shpPath = path.join(__dirname, '../dados_geo/shp_fazendas_SIGEF_07-07-26/Sigef Brasil_MS.shp');
  const dbfPath = path.join(__dirname, '../dados_geo/shp_fazendas_SIGEF_07-07-26/Sigef Brasil_MS.dbf');

  const source = await shapefile.open(shpPath, dbfPath, { encoding: 'utf-8' });
  let count = 0, updated = 0, errors = 0;
  let batch = [];
  const BATCH_SIZE = 100;

  while (true) {
    const result = await source.read();
    if (result.done) break;

    const f = result.value;
    const p = f.properties || {};
    count++;

    const parcela_co = p.parcela_co || null;
    const wkt = geoJsonToWkt(f.geometry);

    if (parcela_co && wkt) {
      batch.push({ parcela_co, geom: wkt });
    }

    if (batch.length >= BATCH_SIZE) {
      const results = await Promise.all(
        batch.map(item => 
          supabase
            .from('imoveis_sigef')
            .update({ geom: item.geom })
            .eq('parcela_co', item.parcela_co)
        )
      );
      
      const batchErrors = results.filter(r => r.error);
      if (batchErrors.length > 0) errors += batchErrors.length;
      updated += (batch.length - batchErrors.length);
      batch = [];

      if (count % 5000 === 0) {
        console.log(`  SIGEF Geometrias: ${updated} / ${count} processados...`);
      }
    }
  }

  if (batch.length > 0) {
    const results = await Promise.all(
      batch.map(item => 
        supabase
          .from('imoveis_sigef')
          .update({ geom: item.geom })
          .eq('parcela_co', item.parcela_co)
      )
    );
    const batchErrors = results.filter(r => r.error);
    updated += (batch.length - batchErrors.length);
  }

  console.log(`✅ SIGEF Geometrias Concluído: ${updated} atualizadas de ${count} registros (erros: ${errors}).`);
}

async function main() {
  console.log('=== ATUALIZANDO POLÍGONOS DE GEOMETRIA NO SUPABASE CLOUD ===');
  console.log('URL:', CLOUD_URL);
  
  await updateCarGeometries();
  await updateSigefGeometries();
  
  console.log('\n🎉 Atualização de geometrias finalizada!');
}

main().catch(err => console.error('FATAL:', err.message));

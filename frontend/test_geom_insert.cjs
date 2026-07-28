const { createClient } = require('@supabase/supabase-js');
const shapefile = require('shapefile');
const path = require('path');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc2JtZm56aGpkdGlyaGl0Z2lnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkwNDE1OCwiZXhwIjoyMDk3NDgwMTU4fQ.1CFeZaQWWKQqSyxrcJXHDvpQ6gmb2hU8HTtMs8nQG6Y';
const payload = JSON.parse(Buffer.from(ANON_KEY.split('.')[1], 'base64').toString());
const CLOUD_URL = `https://${payload.ref}.supabase.co`;
const supabase = createClient(CLOUD_URL, ANON_KEY);

// Helper para converter GeoJSON Geometry object para WKT (Well-Known Text)
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

async function testSingleGeom() {
  console.log('=== TESTANDO FORMATO DE GEOMETRIA NO SUPABASE CLOUD ===');
  
  const shpPath = path.join(__dirname, '../dados_geo/shp_fazendas_car_federal_02-07-26/CAR-SHP-2026.shp');
  const dbfPath = path.join(__dirname, '../dados_geo/shp_fazendas_car_federal_02-07-26/CAR-SHP-2026.dbf');
  
  const source = await shapefile.open(shpPath, dbfPath, { encoding: 'utf-8' });
  const result = await source.read();
  const f = result.value;
  
  console.log('Feature lida do SHP:', f.properties.codigosica || f.properties.nomeprop_1);
  console.log('Geometria tipo:', f.geometry.type);
  
  const wkt = geoJsonToWkt(f.geometry);
  console.log('WKT gerado (amostra):', wkt.substring(0, 100) + '...');
  
  // Testar update na primeira linha de imoveis_car com o WKT
  const { data: firstRow } = await supabase.from('imoveis_car').select('id, cod_imovel').limit(1).single();
  console.log('Atualizando registro ID:', firstRow.id);
  
  const { error: updErr } = await supabase
    .from('imoveis_car')
    .update({ geom: wkt })
    .eq('id', firstRow.id);
    
  if (updErr) {
    console.error('❌ Erro no update WKT:', updErr.message);
    
    // Tentar com objeto GeoJSON direto
    console.log('Tentando com GeoJSON direto...');
    const { error: geoErr } = await supabase
      .from('imoveis_car')
      .update({ geom: f.geometry })
      .eq('id', firstRow.id);
      
    if (geoErr) {
      console.error('❌ Erro no update GeoJSON:', geoErr.message);
    } else {
      console.log('✅ Update com GeoJSON direto FUNCIONOU!');
    }
  } else {
    console.log('✅ Update com WKT FUNCIONOU!');
  }
}

testSingleGeom().catch(console.error);

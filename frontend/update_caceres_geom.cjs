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

async function updateSpecificFarm() {
  console.log('=== BUSCANDO GEOMETRIA REAL DA FAZENDA CÁCERES NO SHAPEFILE ===');
  
  const shpPath = path.join(__dirname, '../dados_geo/shp_fazendas_car_federal_02-07-26/CAR-SHP-2026.shp');
  const dbfPath = path.join(__dirname, '../dados_geo/shp_fazendas_car_federal_02-07-26/CAR-SHP-2026.dbf');
  
  const source = await shapefile.open(shpPath, dbfPath, { encoding: 'utf-8' });
  
  let foundFeature = null;
  
  while (true) {
    const result = await source.read();
    if (result.done) break;
    
    const f = result.value;
    const p = f.properties || {};
    
    const cod = (p.codigosica || p.cod_imovel || '').toUpperCase();
    const nome = (p.nomeprop_1 || p.nome_imovel || '').toUpperCase();
    
    if (cod.includes('MS-5003207-2D62') || nome.includes('CÁCERES') || nome.includes('CACERES')) {
      foundFeature = f;
      console.log('✅ Fazenda Encontrada no Shapefile!');
      console.log('   Código:', cod);
      console.log('   Nome:', nome);
      console.log('   Tipo de Geometria:', f.geometry.type);
      console.log('   Coordenadas amostra:', JSON.stringify(f.geometry.coordinates[0]?.slice(0, 3)));
      break;
    }
  }
  
  if (!foundFeature) {
    console.error('❌ Fazenda não encontrada no shapefile!');
    return;
  }
  
  const wkt = geoJsonToWkt(foundFeature.geometry);
  const codImovel = foundFeature.properties.codigosica || foundFeature.properties.cod_imovel;
  
  // 1. Atualizar imoveis_car no Cloud
  console.log('\n1. Atualizando tabela imoveis_car...');
  const { error: carErr } = await supabase
    .from('imoveis_car')
    .update({ geom: wkt })
    .or(`codigosica.eq.${codImovel},cod_imovel.eq.${codImovel}`);
    
  if (carErr) {
    console.error('❌ Erro ao atualizar imoveis_car:', carErr.message);
  } else {
    console.log('✅ imoveis_car atualizado com o polígono real!');
  }
  
  // 2. Atualizar tabela propriedades (todas as propriedades cadastradas com FAZENDA CÁCERES ou este código)
  console.log('\n2. Atualizando tabela propriedades...');
  const { data: propsToUpdate } = await supabase
    .from('propriedades')
    .select('id, nome_fazenda, codigo_car')
    .or(`nome_fazenda.ilike.%CÁCERES%,codigo_car.ilike.%MS-5003207-2D62%`);
    
  console.log('Propriedades encontradas para atualizar:', propsToUpdate?.length || 0);
  
  if (propsToUpdate && propsToUpdate.length > 0) {
    for (const prop of propsToUpdate) {
      const { error: propErr } = await supabase
        .from('propriedades')
        .update({ geom: wkt })
        .eq('id', prop.id);
        
      if (propErr) {
        console.error(`❌ Erro ao atualizar propriedade ${prop.id}:`, propErr.message);
      } else {
        console.log(`✅ Propriedade ${prop.nome_fazenda} (${prop.id}) atualizada com o polígono real!`);
      }
    }
  }
}

updateSpecificFarm().catch(console.error);

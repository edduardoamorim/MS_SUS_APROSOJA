/**
 * Importar Shapefiles CAR e SIGEF para o Supabase Cloud via API REST.
 * Executar de dentro do diretório frontend/: node import_cloud.cjs
 */
const { createClient } = require('@supabase/supabase-js');
const shapefile = require('shapefile');
const path = require('path');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc2JtZm56aGpkdGlyaGl0Z2lnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkwNDE1OCwiZXhwIjoyMDk3NDgwMTU4fQ.1CFeZaQWWKQqSyxrcJXHDvpQ6gmb2hU8HTtMs8nQG6Y';
const payload = JSON.parse(Buffer.from(ANON_KEY.split('.')[1], 'base64').toString());
const CLOUD_URL = `https://${payload.ref}.supabase.co`;
const supabase = createClient(CLOUD_URL, ANON_KEY);

async function insertBatch(table, batch, retryCount) {
  const { error } = await supabase.from(table).insert(batch);
  if (error) {
    if (error.message.includes('geom') || error.message.includes('geometry') || error.message.includes('Geometry')) {
      // Tentar sem geometria
      const noGeom = batch.map(({ geom, ...rest }) => rest);
      const { error: e2 } = await supabase.from(table).insert(noGeom);
      if (e2) {
        console.error(`  Batch ${table} falhou sem geom:`, e2.message.substring(0, 200));
        return false;
      }
      return true;
    }
    console.error(`  Batch ${table} erro:`, error.message.substring(0, 200));
    return false;
  }
  return true;
}

async function importCAR() {
  console.log('\n=== Importando CAR (CAR-SHP-2026) ===');
  const shpPath = path.join(__dirname, '../dados_geo/shp_fazendas_car_federal_02-07-26/CAR-SHP-2026.shp');
  const dbfPath = path.join(__dirname, '../dados_geo/shp_fazendas_car_federal_02-07-26/CAR-SHP-2026.dbf');

  try {
    // Limpar
    await supabase.from('imoveis_car').delete().neq('id', 0);
    
    const source = await shapefile.open(shpPath, dbfPath, { encoding: 'utf-8' });
    let count = 0, skipped = 0, errors = 0;
    let batch = [];
    const BATCH_SIZE = 50;

    while (true) {
      const result = await source.read();
      if (result.done) break;

      const f = result.value;
      const p = f.properties || {};
      if (!f.geometry) { skipped++; continue; }

      batch.push({
        cod_imovel: p.codigosica || p.cod_imovel || null,
        codigosica: p.codigosica || null,
        nom_tema: p.descricao || null,
        numerocar: p.numerocar || null,
        municipio: p.municipio || null,
        nomeprop_1: p.nomeprop_1 || null,
        nome_imovel: p.nomeprop_1 || null,
        nome_proprietario: p.nomepropri || null,
        situacao_cadastral: p.situcaocad || null,
        situcaocad: p.situcaocad || null,
        area_total_ha: p.areatotalc ? parseFloat(p.areatotalc) : null,
        areatotalc: p.areatotalc ? parseFloat(p.areatotalc) : null,
        ativo: p.ativo != null ? parseInt(p.ativo) : 1,
        responsavel_nome: p.Nome___Raz || null,
        responsavel_papel: p.Papel || null
      });
      count++;

      if (batch.length >= BATCH_SIZE) {
        const ok = await insertBatch('imoveis_car', batch);
        if (!ok) errors++;
        batch = [];
        if (count % 2000 === 0) console.log(`  CAR: ${count} registros...`);
      }
    }
    if (batch.length > 0) {
      const ok = await insertBatch('imoveis_car', batch);
      if (!ok) errors++;
    }

    console.log(`✅ CAR: ${count} importados, ${skipped} sem geom, ${errors} erros de batch`);
  } catch (err) {
    console.error('❌ Erro CAR:', err.message);
  }
}

async function importSIGEF() {
  console.log('\n=== Importando SIGEF (Sigef Brasil_MS) ===');
  const shpPath = path.join(__dirname, '../dados_geo/shp_fazendas_SIGEF_07-07-26/Sigef Brasil_MS.shp');
  const dbfPath = path.join(__dirname, '../dados_geo/shp_fazendas_SIGEF_07-07-26/Sigef Brasil_MS.dbf');

  try {
    await supabase.from('imoveis_sigef').delete().neq('id', 0);
    
    const source = await shapefile.open(shpPath, dbfPath, { encoding: 'utf-8' });
    let count = 0, skipped = 0, errors = 0;
    let batch = [];
    const BATCH_SIZE = 50;

    while (true) {
      const result = await source.read();
      if (result.done) break;

      const f = result.value;
      const p = f.properties || {};
      if (!f.geometry) { skipped++; continue; }

      batch.push({
        parcela_co: p.parcela_co || null,
        rt: p.rt || null,
        art: p.art || null,
        situacao_i: p.situacao_i || null,
        codigo_imo: (p.codigo_imo || p.codigo_im || '').toString() || null,
        data_submi: p.data_submi || null,
        data_aprov: p.data_aprov || null,
        status: p.status || null,
        nome_area: p.nome_area || null,
        municipio_: (p.municipio_ || '').toString() || null,
        uf_id: p.uf_id ? parseInt(p.uf_id) : null
      });
      count++;

      if (batch.length >= BATCH_SIZE) {
        const ok = await insertBatch('imoveis_sigef', batch);
        if (!ok) errors++;
        batch = [];
        if (count % 2000 === 0) console.log(`  SIGEF: ${count} registros...`);
      }
    }
    if (batch.length > 0) {
      const ok = await insertBatch('imoveis_sigef', batch);
      if (!ok) errors++;
    }

    console.log(`✅ SIGEF: ${count} importados, ${skipped} sem geom, ${errors} erros de batch`);
  } catch (err) {
    console.error('❌ Erro SIGEF:', err.message);
  }
}

async function main() {
  console.log('URL:', CLOUD_URL);
  
  // Verificar se tabelas existem
  const { error: e1 } = await supabase.from('imoveis_car').select('id').limit(1);
  const { error: e2 } = await supabase.from('imoveis_sigef').select('id').limit(1);
  if (e1) { console.error('Tabela imoveis_car inacessivel:', e1.message); return; }
  if (e2) { console.error('Tabela imoveis_sigef inacessivel:', e2.message); return; }
  
  console.log('Tabelas acessiveis. Importando...');
  await importCAR();
  await importSIGEF();
  console.log('\nFinalizado!');
}

main();

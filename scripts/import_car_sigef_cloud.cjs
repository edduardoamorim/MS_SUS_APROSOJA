/**
 * Script para importar os Shapefiles CAR e SIGEF para o Supabase Cloud
 * via API REST (insert em batch).
 * 
 * Uso: node scripts/import_car_sigef_cloud.cjs
 */
const { createClient } = require('@supabase/supabase-js');
const shapefile = require('shapefile');
const path = require('path');

// Supabase Cloud - extraído do JWT
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc2JtZm56aGpkdGlyaGl0Z2lnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkwNDE1OCwiZXhwIjoyMDk3NDgwMTU4fQ.1CFeZaQWWKQqSyxrcJXHDvpQ6gmb2hU8HTtMs8nQG6Y';
const payload = JSON.parse(Buffer.from(ANON_KEY.split('.')[1], 'base64').toString());
const CLOUD_URL = `https://${payload.ref}.supabase.co`;

const supabase = createClient(CLOUD_URL, ANON_KEY);

async function importCAR() {
  console.log('\n========================================');
  console.log('  Importando Imóveis CAR (SICAR) → Cloud');
  console.log('  Shapefile: CAR-SHP-2026');
  console.log('========================================\n');

  const shpPath = path.join(__dirname, 'dados_geo/shp_fazendas_car_federal_02-07-26/CAR-SHP-2026.shp');
  const dbfPath = path.join(__dirname, 'dados_geo/shp_fazendas_car_federal_02-07-26/CAR-SHP-2026.dbf');

  try {
    // Limpar tabela antes de importar
    console.log('Limpando tabela imoveis_car...');
    const { error: delErr } = await supabase.from('imoveis_car').delete().neq('id', 0);
    if (delErr) console.log('  Aviso ao limpar:', delErr.message);

    console.log(`Lendo Shapefile: ${shpPath}...`);
    const source = await shapefile.open(shpPath, dbfPath, { encoding: 'utf-8' });

    let count = 0;
    let skipped = 0;
    let batch = [];
    const BATCH_SIZE = 100;

    while (true) {
      const result = await source.read();
      if (result.done) break;

      const feature = result.value;
      const props = feature.properties || {};

      if (!feature.geometry) {
        skipped++;
        continue;
      }

      const row = {
        cod_imovel: props.codigosica || props.cod_imovel || null,
        codigosica: props.codigosica || null,
        nom_tema: props.descricao || null,
        numerocar: props.numerocar || null,
        municipio: props.municipio || null,
        nomeprop_1: props.nomeprop_1 || null,
        nome_imovel: props.nomeprop_1 || null,
        nome_proprietario: props.nomepropri || null,
        cpf_cnpj_proprietario: props.cpfoucnpjp || null,
        situacao_cadastral: props.situcaocad || null,
        situcaocad: props.situcaocad || null,
        area_total_ha: props.areatotalc || null,
        areatotalc: props.areatotalc || null,
        area_ha: props.area_ha || null,
        coordenadas_texto: props.coordenada || null,
        data_criacao: props.datacriaca || null,
        data_sicar: props.datasicar || null,
        ativo: props.ativo != null ? props.ativo : 1,
        responsavel_cpf_cnpj: props.CPF_CNPJ || null,
        responsavel_nome: props.Nome___Raz || null,
        responsavel_papel: props.Papel || null,
        // PostGIS geometry como GeoJSON string
        geom: JSON.stringify(feature.geometry)
      };

      batch.push(row);
      count++;

      if (batch.length >= BATCH_SIZE) {
        await insertBatch('imoveis_car', batch);
        batch = [];
        if (count % 1000 === 0) {
          console.log(`  CAR: ${count} registros inseridos...`);
        }
      }
    }

    if (batch.length > 0) {
      await insertBatch('imoveis_car', batch);
    }

    console.log(`\n✅ CAR concluído: ${count} imóveis importados. (${skipped} sem geometria ignorados)`);
  } catch (err) {
    console.error('❌ Erro ao importar CAR:', err.message);
  }
}

async function importSIGEF() {
  console.log('\n========================================');
  console.log('  Importando Imóveis SIGEF (INCRA) → Cloud');
  console.log('========================================\n');

  const shpPath = path.join(__dirname, 'dados_geo/shp_fazendas_SIGEF_07-07-26/Sigef Brasil_MS.shp');
  const dbfPath = path.join(__dirname, 'dados_geo/shp_fazendas_SIGEF_07-07-26/Sigef Brasil_MS.dbf');

  try {
    console.log('Limpando tabela imoveis_sigef...');
    const { error: delErr } = await supabase.from('imoveis_sigef').delete().neq('id', 0);
    if (delErr) console.log('  Aviso ao limpar:', delErr.message);

    console.log(`Lendo Shapefile: ${shpPath}...`);
    const source = await shapefile.open(shpPath, dbfPath, { encoding: 'utf-8' });

    let count = 0;
    let skipped = 0;
    let batch = [];
    const BATCH_SIZE = 100;

    while (true) {
      const result = await source.read();
      if (result.done) break;

      const feature = result.value;
      const props = feature.properties || {};

      if (!feature.geometry) {
        skipped++;
        continue;
      }

      const row = {
        parcela_co: props.parcela_co || null,
        rt: props.rt || null,
        art: props.art || null,
        situacao_i: props.situacao_i || null,
        codigo_imo: props.codigo_imo || props.codigo_im || null,
        data_submi: props.data_submi || null,
        data_aprov: props.data_aprov || null,
        status: props.status || null,
        nome_area: props.nome_area || null,
        municipio_: props.municipio_ || null,
        uf_id: props.uf_id || null,
        geom: JSON.stringify(feature.geometry)
      };

      batch.push(row);
      count++;

      if (batch.length >= BATCH_SIZE) {
        await insertBatch('imoveis_sigef', batch);
        batch = [];
        if (count % 1000 === 0) {
          console.log(`  SIGEF: ${count} registros inseridos...`);
        }
      }
    }

    if (batch.length > 0) {
      await insertBatch('imoveis_sigef', batch);
    }

    console.log(`\n✅ SIGEF concluído: ${count} imóveis importados. (${skipped} sem geometria ignorados)`);
  } catch (err) {
    console.error('❌ Erro ao importar SIGEF:', err.message);
  }
}

async function insertBatch(table, batch) {
  const { error } = await supabase.from(table).insert(batch);
  if (error) {
    // Se erro é de geometria, tentar sem geom
    if (error.message.includes('geom') || error.message.includes('geometry')) {
      console.log(`  Tentando batch sem geometria (${batch.length} rows)...`);
      const noGeomBatch = batch.map(({ geom, ...rest }) => rest);
      const { error: retryErr } = await supabase.from(table).insert(noGeomBatch);
      if (retryErr) {
        console.error(`  ❌ Erro fatal no batch ${table}:`, retryErr.message);
      }
    } else {
      console.error(`  ❌ Erro no batch ${table}:`, error.message);
    }
  }
}

async function main() {
  console.log('=== IMPORTAÇÃO PARA SUPABASE CLOUD ===');
  console.log('URL:', CLOUD_URL);
  console.log('');

  // Verificar se tabelas existem
  const { error: carCheck } = await supabase.from('imoveis_car').select('id').limit(1);
  if (carCheck && carCheck.message.includes('Could not find the table')) {
    console.error('❌ TABELA imoveis_car NÃO EXISTE NO SUPABASE CLOUD!');
    console.error('   Execute primeiro o SQL em: supabase/setup_cloud_tables.sql');
    console.error('   No Supabase Dashboard > SQL Editor');
    process.exit(1);
  }

  const { error: sigCheck } = await supabase.from('imoveis_sigef').select('id').limit(1);
  if (sigCheck && sigCheck.message.includes('Could not find the table')) {
    console.error('❌ TABELA imoveis_sigef NÃO EXISTE NO SUPABASE CLOUD!');
    console.error('   Execute primeiro o SQL em: supabase/setup_cloud_tables.sql');
    process.exit(1);
  }

  console.log('✅ Tabelas encontradas no Cloud. Iniciando importação...\n');

  await importCAR();
  await importSIGEF();

  console.log('\n🎉 Importação completa!');
}

main().catch(err => console.error('ERRO FATAL:', err.message));

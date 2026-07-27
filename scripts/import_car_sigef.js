import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import shapefile from 'shapefile';
import pkg from 'pg';
const { Client } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const connectionString = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function importCAR(client) {
  console.log('\n========================================');
  console.log('  Importando Imóveis CAR (SICAR)...');
  console.log('  Shapefile: CAR-SHP-2026 (enriquecido)');
  console.log('========================================\n');

  const shpPath = join(__dirname, '../dados_geo/shp_fazendas_car_federal_02-07-26/CAR-SHP-2026.shp');
  const dbfPath = join(__dirname, '../dados_geo/shp_fazendas_car_federal_02-07-26/CAR-SHP-2026.dbf');

  try {
    // Limpar tabela antes de importar
    await client.query('TRUNCATE TABLE imoveis_car RESTART IDENTITY;');
    console.log('Tabela imoveis_car limpa.');

    console.log(`Lendo Shapefile: ${shpPath}...`);
    const source = await shapefile.open(shpPath, dbfPath, { encoding: 'utf-8' });

    let count = 0;
    let skipped = 0;
    let batch = [];
    const BATCH_SIZE = 300; // Batch menor para evitar estouro de memória com 18 colunas

    while (true) {
      const result = await source.read();
      if (result.done) break;

      const feature = result.value;
      const props = feature.properties || {};

      // Mapear colunas do novo shapefile CAR-SHP-2026
      // cod_imovel ← codigosica (mantém compatibilidade com autocomplete e triggers)
      const cod_imovel = props.codigosica || props.cod_imovel || props.COD_IMOVEL || null;
      const cod_tema = null; // Não existe mais no novo shapefile
      const nom_tema = props.descricao || null; // "Área Total do Imóvel"

      // Novas colunas enriquecidas
      const numerocar = props.numerocar || null;
      const municipio = props.municipio || null;
      const nome_imovel = props.nomeprop_1 || null; // Nome da fazenda
      const nome_proprietario = props.nomepropri || null; // Nome do proprietário pessoa
      const cpf_cnpj_proprietario = props.cpfoucnpjp || null;
      const situacao_cadastral = props.situcaocad || null; // Inscrito, Pendente, Aprovado
      const area_total_ha = props.areatotalc || null;
      const coordenadas_texto = props.coordenada || null;
      const data_criacao = props.datacriaca || null;
      const data_sicar = props.datasicar || null;
      const ativo = props.ativo != null ? props.ativo : 1;
      const responsavel_cpf_cnpj = props.CPF_CNPJ || null;
      const responsavel_nome = props.Nome___Raz || null;
      const responsavel_papel = props.Papel || null;

      if (!feature.geometry) {
        skipped++;
        continue;
      }

      const geomJson = JSON.stringify(feature.geometry);

      batch.push({
        cod_imovel, cod_tema, nom_tema, geomJson,
        numerocar, municipio, nome_imovel, nome_proprietario,
        cpf_cnpj_proprietario, situacao_cadastral, area_total_ha,
        coordenadas_texto, data_criacao, data_sicar, ativo,
        responsavel_cpf_cnpj, responsavel_nome, responsavel_papel
      });
      count++;

      if (batch.length >= BATCH_SIZE) {
        await insertCARBatch(client, batch);
        batch = [];
        if (count % 5000 === 0) {
          console.log(`  CAR: ${count} registros inseridos...`);
        }
      }
    }

    // Inserir resto
    if (batch.length > 0) {
      await insertCARBatch(client, batch);
    }

    console.log(`✅ CAR concluído: ${count} imóveis importados. (${skipped} sem geometria ignorados)`);
  } catch (err) {
    console.error('❌ Erro ao importar CAR:', err.message);
    console.error(err.stack);
  }
}

async function insertCARBatch(client, batch) {
  const values = [];
  const params = [];
  let idx = 1;
  const COLS_PER_ROW = 18;

  for (const row of batch) {
    const placeholders = [];
    for (let i = 0; i < COLS_PER_ROW - 1; i++) {
      placeholders.push(`$${idx + i}`);
    }
    // Último placeholder é a geometria com ST_Multi wrapper
    placeholders.push(`ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($${idx + COLS_PER_ROW - 1}), 4326))`);

    values.push(`(${placeholders.join(', ')})`);
    params.push(
      row.cod_imovel, row.cod_tema, row.nom_tema,
      row.numerocar, row.municipio, row.nome_imovel,
      row.nome_proprietario, row.cpf_cnpj_proprietario,
      row.situacao_cadastral, row.area_total_ha,
      row.coordenadas_texto, row.data_criacao, row.data_sicar,
      row.ativo, row.responsavel_cpf_cnpj, row.responsavel_nome,
      row.responsavel_papel, row.geomJson
    );
    idx += COLS_PER_ROW;
  }

  const query = `INSERT INTO imoveis_car (
    cod_imovel, cod_tema, nom_tema,
    numerocar, municipio, nome_imovel,
    nome_proprietario, cpf_cnpj_proprietario,
    situacao_cadastral, area_total_ha,
    coordenadas_texto, data_criacao, data_sicar,
    ativo, responsavel_cpf_cnpj, responsavel_nome,
    responsavel_papel, geom
  ) VALUES ${values.join(', ')}`;
  await client.query(query, params);
}

async function importSIGEF(client) {
  console.log('\n========================================');
  console.log('  Importando Imóveis SIGEF (INCRA)...');
  console.log('========================================\n');

  const shpPath = join(__dirname, '../dados_geo/shp_fazendas_SIGEF_07-07-26/Sigef Brasil_MS.shp');
  const dbfPath = join(__dirname, '../dados_geo/shp_fazendas_SIGEF_07-07-26/Sigef Brasil_MS.dbf');

  try {
    await client.query('TRUNCATE TABLE imoveis_sigef RESTART IDENTITY;');
    console.log('Tabela imoveis_sigef limpa.');

    console.log(`Lendo Shapefile: ${shpPath}...`);
    const source = await shapefile.open(shpPath, dbfPath, { encoding: 'utf-8' });

    let count = 0;
    let batch = [];
    const BATCH_SIZE = 500;

    while (true) {
      const result = await source.read();
      if (result.done) break;

      const feature = result.value;
      const props = feature.properties || {};

      const parcela_co = props.parcela_co || null;
      const rt = props.rt || null;
      const art = props.art || null;
      const situacao_i = props.situacao_i || null;
      const codigo_imo = props.codigo_imo || props.codigo_im || null;
      const data_submi = props.data_submi || null;
      const data_aprov = props.data_aprov || null;
      const status = props.status || null;
      const nome_area = props.nome_area || null;

      if (!feature.geometry) continue;

      const geomJson = JSON.stringify(feature.geometry);

      batch.push({ parcela_co, rt, art, situacao_i, codigo_imo, data_submi, data_aprov, status, nome_area, geomJson });
      count++;

      if (batch.length >= BATCH_SIZE) {
        await insertSIGEFBatch(client, batch);
        batch = [];
        if (count % 5000 === 0) {
          console.log(`  SIGEF: ${count} registros inseridos...`);
        }
      }
    }

    if (batch.length > 0) {
      await insertSIGEFBatch(client, batch);
    }

    console.log(`✅ SIGEF concluído: ${count} imóveis importados.`);
  } catch (err) {
    console.error('❌ Erro ao importar SIGEF:', err.message);
  }
}

async function insertSIGEFBatch(client, batch) {
  const values = [];
  const params = [];
  let idx = 1;

  for (const row of batch) {
    values.push(`($${idx}, $${idx + 1}, $${idx + 2}, $${idx + 3}, $${idx + 4}, $${idx + 5}, $${idx + 6}, $${idx + 7}, $${idx + 8}, ST_Multi(ST_SetSRID(ST_GeomFromGeoJSON($${idx + 9}), 4326)))`);
    params.push(
      row.parcela_co, row.rt, row.art, row.situacao_i, row.codigo_imo,
      row.data_submi, row.data_aprov, row.status, row.nome_area, row.geomJson
    );
    idx += 10;
  }

  const query = `INSERT INTO imoveis_sigef (parcela_co, rt, art, situacao_i, codigo_imo, data_submi, data_aprov, status, nome_area, geom) VALUES ${values.join(', ')}`;
  await client.query(query, params);
}

async function main() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('✅ Conectado ao banco de dados Supabase (PostGIS).');

    await importCAR(client);
    await importSIGEF(client);

    console.log('\n🎉 Importação completa de CAR e SIGEF finalizada!');
  } catch (error) {
    console.error('❌ Erro geral:', error.message);
    console.log('\n⚠️  Se o Docker Desktop não estiver ativo, execute este script após iniciá-lo:');
    console.log('    node scripts/import_car_sigef.js');
  } finally {
    await client.end();
  }
}

main();

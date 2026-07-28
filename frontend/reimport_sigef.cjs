/**
 * Re-importar APENAS SIGEF para o Supabase Cloud
 * Executar: node frontend/reimport_sigef.cjs
 */
const { createClient } = require('@supabase/supabase-js');
const shapefile = require('shapefile');
const path = require('path');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc2JtZm56aGpkdGlyaGl0Z2lnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkwNDE1OCwiZXhwIjoyMDk3NDgwMTU4fQ.1CFeZaQWWKQqSyxrcJXHDvpQ6gmb2hU8HTtMs8nQG6Y';
const payload = JSON.parse(Buffer.from(ANON_KEY.split('.')[1], 'base64').toString());
const CLOUD_URL = `https://${payload.ref}.supabase.co`;
const supabase = createClient(CLOUD_URL, ANON_KEY);

async function main() {
  console.log('=== Re-importando SIGEF ===');
  console.log('URL:', CLOUD_URL);

  // Limpar tabela sigef
  console.log('Limpando imoveis_sigef...');
  await supabase.from('imoveis_sigef').delete().neq('id', 0);

  const shpPath = path.join(__dirname, '../dados_geo/shp_fazendas_SIGEF_07-07-26/Sigef Brasil_MS.shp');
  const dbfPath = path.join(__dirname, '../dados_geo/shp_fazendas_SIGEF_07-07-26/Sigef Brasil_MS.dbf');

  const source = await shapefile.open(shpPath, dbfPath, { encoding: 'utf-8' });
  let count = 0, errors = 0;
  let batch = [];
  const BATCH_SIZE = 50;

  while (true) {
    const result = await source.read();
    if (result.done) break;

    const f = result.value;
    const p = f.properties || {};
    if (!f.geometry) continue;

    // Inserir SEM data_submi e data_aprov se forem DATE e o valor for string
    const dataSubmi = p.data_submi || null;
    const dataAprov = p.data_aprov || null;

    batch.push({
      parcela_co: p.parcela_co || null,
      rt: p.rt || null,
      art: p.art || null,
      situacao_i: p.situacao_i || null,
      codigo_imo: (p.codigo_imo || p.codigo_im || '').toString() || null,
      data_submi: dataSubmi,
      data_aprov: dataAprov,
      status: p.status || null,
      nome_area: p.nome_area || null,
      municipio_: (p.municipio_ || '').toString() || null,
      uf_id: p.uf_id ? parseInt(p.uf_id) : null
    });
    count++;

    if (batch.length >= BATCH_SIZE) {
      const { error } = await supabase.from('imoveis_sigef').insert(batch);
      if (error) {
        errors++;
        if (errors <= 3) console.log('  Erro batch:', error.message.substring(0, 200));
      }
      batch = [];
      if (count % 5000 === 0) console.log(`  SIGEF: ${count}...`);
    }
  }
  if (batch.length > 0) {
    const { error } = await supabase.from('imoveis_sigef').insert(batch);
    if (error) errors++;
  }

  console.log(`\nSIGEF: ${count} processados, ${errors} erros de batch`);

  // Verificar count final
  const { count: finalCount } = await supabase.from('imoveis_sigef').select('*', { count: 'exact', head: true });
  console.log('Total no banco:', finalCount);
}

main().catch(e => console.error('FATAL:', e.message));

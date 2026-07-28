const { createClient } = require('@supabase/supabase-js');

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvc2JtZm56aGpkdGlyaGl0Z2lnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MTkwNDE1OCwiZXhwIjoyMDk3NDgwMTU4fQ.1CFeZaQWWKQqSyxrcJXHDvpQ6gmb2hU8HTtMs8nQG6Y';
const payload = JSON.parse(Buffer.from(ANON_KEY.split('.')[1], 'base64').toString());
const CLOUD_URL = `https://${payload.ref}.supabase.co`;
const supabase = createClient(CLOUD_URL, ANON_KEY);

async function cleanSigefDb() {
  console.log('=== LIMPANDO E PADRONIZANDO NOMES CORROMPIDOS EM IMOVEIS_SIGEF ===');

  // 1. Buscar registros que contenham o caractere de substituição UTF-8 ou padrões corrompidos
  const { data: records, error } = await supabase
    .from('imoveis_sigef')
    .select('id, nome_area')
    .or('nome_area.ilike.%CAMPAN%,nome_area.ilike.%rea%,nome_area.ilike.%\uFFFD%');

  if (error) {
    console.error('Erro ao buscar imoveis_sigef:', error);
    return;
  }

  console.log(`Encontrados ${records.length} registros para higienização.`);

  let updated = 0;
  for (const rec of records) {
    if (!rec.nome_area) continue;
    let newName = rec.nome_area
      .replace(/CAMPAN[\uFFFD]RIO|CAMPAN.RIO/gi, 'CAMPANÁRIO')
      .replace(/[\uFFFD]rea|.rea/gi, 'Área')
      .replace(/S[\uFFFD]O|S.O/gi, 'SÃO')
      .replace(/JO[\uFFFD]O|JO.O/gi, 'JOÃO')
      .replace(/TR[\uFFFD]S|TR.S/gi, 'TRÊS')
      .replace(/[\uFFFD]/g, '');

    if (newName !== rec.nome_area) {
      const { error: updErr } = await supabase
        .from('imoveis_sigef')
        .update({ nome_area: newName })
        .eq('id', rec.id);

      if (!updErr) updated++;
    }
  }

  console.log(`✅ Higienização concluída! ${updated} registros atualizados na base de dados do Cloud.`);
}

cleanSigefDb().catch(console.error);

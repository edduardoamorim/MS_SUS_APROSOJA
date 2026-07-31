const { createClient } = require('./node_modules/@supabase/supabase-js');

const supabaseUrl = 'http://127.0.0.1:54321';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsaG9zdCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzA0MDY3MjAwLCJleHAiOjIwMTk2NDMyMDB9.P8HpxXv_-cM1DbgvO4L5W2-Zg01a2X9G8r-F6F6J8bY';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkDocs() {
  console.log("=== CHECKING RESPPOSTAS_AUDITORIA ===");
  const { data: resp, error: err1 } = await supabase
    .from('respostas_auditoria')
    .select('id, evidencia_url, auditoria_id, created_at')
    .not('evidencia_url', 'is', null);
  console.log("respostas_auditoria count:", resp?.length, "error:", err1);
  if (resp && resp.length > 0) {
    console.log("Sample respuestas_auditoria evid_urls:", resp.map(r => ({ id: r.id, url: r.evidencia_url })));
  }

  console.log("\n=== CHECKING DOCUMENTOS_PROPRIEDADE ===");
  const { data: docProp, error: err2 } = await supabase
    .from('documentos_propriedade')
    .select('id, nome, arquivo_url, created_at');
  console.log("documentos_propriedade count:", docProp?.length, "error:", err2);

  console.log("\n=== CHECKING PENDENCIAS ===");
  const { data: pends, error: err3 } = await supabase
    .from('pendencias')
    .select('id, titulo, evidencia_url, created_at')
    .not('evidencia_url', 'is', null);
  console.log("pendencias count:", pends?.length, "error:", err3);
}

checkDocs();

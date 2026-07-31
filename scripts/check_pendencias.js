import pkg from 'pg';
const { Client } = pkg;

const connectionString = 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

async function check() {
  const client = new Client({ connectionString });
  await client.connect();
  
  console.log("--- COLUNAS DE PENDENCIAS ---");
  const res = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pendencias'");
  console.log(res.rows);

  // Garantir colunas se faltarem
  console.log("\n--- APLICANDO MIGRATION DE AUTOCURA EM PENDENCIAS ---");
  await client.query(`
    ALTER TABLE public.pendencias 
    ADD COLUMN IF NOT EXISTS tecnico_responsavel_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS criado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS motivo_rejeicao TEXT,
    ADD COLUMN IF NOT EXISTS gravidade VARCHAR(20) DEFAULT 'Média';
    
    NOTIFY pgrst, 'reload schema';
  `);
  console.log("Colunas garantidas e PostgREST schema reloaded!");

  const res2 = await client.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'pendencias'");
  console.log("\n--- NOVAS COLUNAS DE PENDENCIAS ---");
  console.log(res2.rows);

  await client.end();
}

check().catch(console.error);

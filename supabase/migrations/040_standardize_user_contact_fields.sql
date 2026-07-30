-- Migration 040: Padronizacao dos campos de contato (email, telefone, whatsapp) nas tabelas perfis e propriedades

-- 1. Garantir colunas de contato em public.perfis
ALTER TABLE public.perfis 
ADD COLUMN IF NOT EXISTS telefone VARCHAR(50),
ADD COLUMN IF NOT EXISTS whatsapp VARCHAR(50);

-- 2. Garantir colunas de contato em public.propriedades
ALTER TABLE public.propriedades 
ADD COLUMN IF NOT EXISTS telefone_produtor VARCHAR(50),
ADD COLUMN IF NOT EXISTS email_produtor VARCHAR(255);

-- 3. Atualizar dados de contato padronizados para perfis existentes de teste
UPDATE public.perfis
SET 
  telefone = COALESCE(telefone, '(67) 99881-2233'),
  whatsapp = COALESCE(whatsapp, '(67) 99881-2233'),
  email = COALESCE(email, 'edward.produtor@aprosojams.org.br')
WHERE nome ILIKE '%Edward%' OR email ILIKE '%produtor%';

UPDATE public.perfis
SET 
  telefone = COALESCE(telefone, '(67) 99912-3456'),
  whatsapp = COALESCE(whatsapp, '(67) 99912-3456'),
  email = COALESCE(email, 'analistacampo1@aprosojams.org.br')
WHERE email ILIKE '%analistacampo1%';

UPDATE public.perfis
SET 
  telefone = COALESCE(telefone, '(67) 99988-7766'),
  whatsapp = COALESCE(whatsapp, '(67) 99988-7766'),
  email = COALESCE(email, 'analistacampo2@aprosojams.org.br')
WHERE email ILIKE '%analistacampo2%';

UPDATE public.perfis
SET 
  telefone = COALESCE(telefone, '(67) 99955-4433'),
  whatsapp = COALESCE(whatsapp, '(67) 99955-4433'),
  email = COALESCE(email, 'gestor@ms.gov.br')
WHERE email ILIKE '%gestor%';

UPDATE public.perfis
SET 
  telefone = COALESCE(telefone, '(67) 99933-2211'),
  whatsapp = COALESCE(whatsapp, '(67) 99933-2211'),
  email = COALESCE(email, 'tecnico@ms.gov.br')
WHERE email ILIKE '%tecnico@ms.gov.br%';

-- 4. Atualizar propriedades com e-mail e telefone vinculados do produtor
UPDATE public.propriedades p
SET 
  email_produtor = perf.email,
  telefone_produtor = perf.telefone
FROM public.perfis perf
WHERE p.produtor_id = perf.id OR LOWER(p.nome_produtor) = LOWER(perf.nome);

NOTIFY pgrst, 'reload schema';

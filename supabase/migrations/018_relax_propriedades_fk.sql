-- Alterar as FKs que referenciam auth.users(id) para public.perfis(id)
-- Isso permite vincular fazendas, auditorias, pendências e documentos a usuários simulados/mockados ou prospectados.

-- 1. propriedades.produtor_id
ALTER TABLE public.propriedades DROP CONSTRAINT IF EXISTS propriedades_produtor_id_fkey;
ALTER TABLE public.propriedades 
ADD CONSTRAINT propriedades_produtor_id_fkey 
FOREIGN KEY (produtor_id) REFERENCES public.perfis(id) 
ON DELETE SET NULL;

-- 2. auditorias.tecnico_responsavel_id
ALTER TABLE public.auditorias DROP CONSTRAINT IF EXISTS auditorias_tecnico_responsavel_id_fkey;
ALTER TABLE public.auditorias 
ADD CONSTRAINT auditorias_tecnico_responsavel_id_fkey 
FOREIGN KEY (tecnico_responsavel_id) REFERENCES public.perfis(id) 
ON DELETE SET NULL;

-- 3. documentos.criado_por
ALTER TABLE public.documentos DROP CONSTRAINT IF EXISTS documentos_criado_por_fkey;
ALTER TABLE public.documentos 
ADD CONSTRAINT documentos_criado_por_fkey 
FOREIGN KEY (criado_por) REFERENCES public.perfis(id) 
ON DELETE SET NULL;

-- 4. pendencias.criado_por
ALTER TABLE public.pendencias DROP CONSTRAINT IF EXISTS pendencias_criado_por_fkey;
ALTER TABLE public.pendencias 
ADD CONSTRAINT pendencias_criado_por_fkey 
FOREIGN KEY (criado_por) REFERENCES public.perfis(id) 
ON DELETE SET NULL;

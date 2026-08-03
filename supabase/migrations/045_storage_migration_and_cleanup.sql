-- ============================================================================
-- MIGRATION 045: CRIAÇÃO DE BUCKETS DE STORAGE, POLÍTICAS RLS E LIMPEZA DE BASE64
-- ============================================================================

-- 1. Garantir que os buckets 'evidencias' e 'documentos-e-midias' existam no Supabase Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('evidencias', 'evidencias', true, 52428800, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf']),
  ('documentos-e-midias', 'documentos-e-midias', true, 52428800, ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf'])
ON CONFLICT (id) DO UPDATE SET 
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Garantir habilitação de RLS em storage.objects
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 3. Remover políticas antigas para evitar conflitos
DROP POLICY IF EXISTS "Permitir leitura para todos em evidencias" ON storage.objects;
DROP POLICY IF EXISTS "Permitir upload para todos em evidencias" ON storage.objects;
DROP POLICY IF EXISTS "Permitir delecao para todos em evidencias" ON storage.objects;

DROP POLICY IF EXISTS "Permitir leitura para todos em documentos-e-midias" ON storage.objects;
DROP POLICY IF EXISTS "Permitir upload para todos em documentos-e-midias" ON storage.objects;
DROP POLICY IF EXISTS "Permitir delecao para todos em documentos-e-midias" ON storage.objects;

-- 4. Criar políticas RLS para os buckets
CREATE POLICY "Permitir leitura para todos em evidencias" 
  ON storage.objects FOR SELECT 
  USING (bucket_id IN ('evidencias', 'documentos-e-midias'));

CREATE POLICY "Permitir upload para todos em evidencias" 
  ON storage.objects FOR INSERT 
  WITH CHECK (bucket_id IN ('evidencias', 'documentos-e-midias'));

CREATE POLICY "Permitir delecao para todos em evidencias" 
  ON storage.objects FOR DELETE 
  USING (bucket_id IN ('evidencias', 'documentos-e-midias'));

-- 5. Limpeza de registros antigos que continham fallback Base64 nas tabelas de mídia
UPDATE public.respostas_auditoria SET evidencia_url = NULL WHERE evidencia_url LIKE 'data:%';
UPDATE public.pendencias SET evidencia_url = NULL WHERE evidencia_url LIKE 'data:%';
UPDATE public.documentos SET arquivo_url = NULL WHERE arquivo_url LIKE 'data:%';
UPDATE public.documentos_propriedade SET arquivo_url = NULL WHERE arquivo_url LIKE 'data:%';
UPDATE public.modelos_documentos SET arquivo_url = NULL WHERE arquivo_url LIKE 'data:%';
UPDATE public.aceite_termos SET arquivo_pdf_url = NULL WHERE arquivo_pdf_url LIKE 'data:%';

-- 6. Notificar PostgREST para recarregar o schema
NOTIFY pgrst, 'reload schema';

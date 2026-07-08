-- Criar o bucket de evidências se não existir
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'evidencias', 
    'evidencias', 
    true, 
    52428800, 
    ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- RLS is enabled by default in Supabase storage schema.


-- Remover políticas antigas para evitar conflitos
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
DROP POLICY IF EXISTS "Auth Insert Access" ON storage.objects;
DROP POLICY IF EXISTS "Auth Delete Access" ON storage.objects;
DROP POLICY IF EXISTS "Permitir tudo para todos" ON storage.objects;

-- Criar política totalmente permissiva para o bucket de evidencias local
CREATE POLICY "Permitir tudo para todos" ON storage.objects 
FOR ALL 
USING (bucket_id = 'evidencias') 
WITH CHECK (bucket_id = 'evidencias');

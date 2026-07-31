-- Migration 044: Create documentos_propriedade table
CREATE TABLE IF NOT EXISTS public.documentos_propriedade (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    propriedade_id UUID REFERENCES public.propriedades(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    categoria TEXT DEFAULT 'Geral',
    arquivo_url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS and grant permissions
ALTER TABLE public.documentos_propriedade ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all select access to documentos_propriedade"
    ON public.documentos_propriedade FOR SELECT
    USING (true);

CREATE POLICY "Allow all insert access to documentos_propriedade"
    ON public.documentos_propriedade FOR INSERT
    WITH CHECK (true);

CREATE POLICY "Allow all update access to documentos_propriedade"
    ON public.documentos_propriedade FOR UPDATE
    USING (true);

CREATE POLICY "Allow all delete access to documentos_propriedade"
    ON public.documentos_propriedade FOR DELETE
    USING (true);

GRANT ALL ON public.documentos_propriedade TO anon, authenticated, service_role;

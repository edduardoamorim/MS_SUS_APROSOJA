-- Nova política de RLS para permitir que produtores insiram pendências para suas próprias propriedades
-- Isso é necessário para a geração automática de pendências no preenchimento de autoavaliações
CREATE POLICY "Produtores podem inserir pendencias para suas propriedades" 
ON public.pendencias FOR INSERT 
WITH CHECK (
    EXISTS (
        SELECT 1 FROM public.propriedades 
        WHERE propriedades.id = pendencias.propriedade_id 
        AND propriedades.produtor_id = auth.uid()
    )
);

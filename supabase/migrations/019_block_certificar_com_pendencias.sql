-- Função do trigger para verificar se a propriedade possui pendências não resolvidas
CREATE OR REPLACE FUNCTION public.check_propriedade_pendencias()
RETURNS TRIGGER AS $$
DECLARE
    has_active_pendencies BOOLEAN;
BEGIN
    -- Só nos interessa quando o status muda para 'Certificada'
    IF NEW.status = 'Certificada' THEN
        SELECT EXISTS (
            SELECT 1 FROM public.pendencias
            WHERE propriedade_id = NEW.propriedade_id
            AND status != 'Resolvida'
        ) INTO has_active_pendencies;

        IF has_active_pendencies THEN
            RAISE EXCEPTION 'Não é permitido certificar uma propriedade que possui pendências pendentes ou em análise!';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar o trigger na tabela public.auditorias
DROP TRIGGER IF EXISTS trigger_check_propriedade_pendencias ON public.auditorias;
CREATE TRIGGER trigger_check_propriedade_pendencias
BEFORE INSERT OR UPDATE ON public.auditorias
FOR EACH ROW
EXECUTE FUNCTION public.check_propriedade_pendencias();

-- ============================================================================
-- SCHEMA COMPLETO DA APLICAÇÃO MS SUSTENTÁVEL / RTRS PARA SUPABASE CLOUD
-- ============================================================================

-- 1. Habilitar extensões
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Tabela: perfis (Produtores, Técnicos, Gestores)
CREATE TABLE IF NOT EXISTS public.perfis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'produtor',
    regiao VARCHAR(100),
    fazendas_vinculadas INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Ativo',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Tabela: propriedades (Fazendas)
CREATE TABLE IF NOT EXISTS public.propriedades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produtor_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
    nome_fazenda VARCHAR(255) NOT NULL,
    nome_produtor VARCHAR(255) NOT NULL,
    codigo_car VARCHAR(255),
    codigo_sigef VARCHAR(255),
    origem_cadastro VARCHAR(50) DEFAULT 'CAR',
    municipio VARCHAR(255) DEFAULT 'Geral, MS',
    geom geometry(Geometry, 4326),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Tabela: auditorias (Vistoria / Visita de campo)
CREATE TABLE IF NOT EXISTS public.auditorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    propriedade_id UUID REFERENCES public.propriedades(id) ON DELETE CASCADE,
    tecnico_responsavel_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
    data_agendamento TIMESTAMPTZ,
    status VARCHAR(50) DEFAULT 'Autoavaliação',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Tabela: perguntas_rtrs
CREATE TABLE IF NOT EXISTS public.perguntas_rtrs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    secao VARCHAR(255) NOT NULL, 
    numero_criterio VARCHAR(50) NOT NULL UNIQUE,
    enunciado TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Tabela: respostas_auditoria
CREATE TABLE IF NOT EXISTS public.respostas_auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auditoria_id UUID REFERENCES public.auditorias(id) ON DELETE CASCADE,
    pergunta_id UUID REFERENCES public.perguntas_rtrs(id) ON DELETE CASCADE,
    conforme BOOLEAN NOT NULL,
    observacoes TEXT,
    evidencia_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (auditoria_id, pergunta_id)
);

-- 7. Tabela: pendencias
CREATE TABLE IF NOT EXISTS public.pendencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    propriedade_id UUID REFERENCES public.propriedades(id) ON DELETE CASCADE NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'Pendente',
    prazo DATE,
    evidencia_url TEXT,
    resolucao_descricao TEXT,
    motivo_rejeicao TEXT,
    criado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. RPC cadastrar_prospeccao_completa
CREATE OR REPLACE FUNCTION public.cadastrar_prospeccao_completa(
  produtor_option text,
  produtor_id uuid,
  novo_produtor jsonb,
  propriedades_list jsonb,
  tecnico_id uuid,
  auto_schedule boolean
) RETURNS jsonb AS $$
DECLARE
  v_produtor_id uuid;
  v_produtor_nome text;
  v_prop_id uuid;
  v_prop record;
BEGIN
  IF produtor_option = 'novo' THEN
    INSERT INTO public.perfis (nome, email, role, regiao, status)
    VALUES (
      novo_produtor->>'nome',
      COALESCE(novo_produtor->>'email', LOWER(REPLACE(novo_produtor->>'nome', ' ', '')) || '@produtor.com.br'),
      'produtor',
      COALESCE(novo_produtor->>'regiao', 'Geral, MS'),
      'Ativo'
    )
    RETURNING id, nome INTO v_produtor_id, v_produtor_nome;
  ELSE
    IF produtor_id IS NULL THEN
      v_produtor_nome := 'Produtor Rural';
    ELSE
      v_produtor_id := produtor_id;
      SELECT nome INTO v_produtor_nome FROM public.perfis WHERE id = v_produtor_id;
      IF v_produtor_nome IS NULL THEN
        v_produtor_nome := 'Produtor Rural';
      END IF;
    END IF;
  END IF;

  FOR v_prop IN SELECT * FROM jsonb_to_recordset(propriedades_list) AS x(
    nome_fazenda text,
    codigo_car text,
    codigo_sigef text,
    origem text,
    geom jsonb
  )
  LOOP
    INSERT INTO public.propriedades (
      nome_fazenda,
      nome_produtor,
      produtor_id,
      codigo_car,
      codigo_sigef,
      origem_cadastro,
      geom
    ) VALUES (
      v_prop.nome_fazenda,
      v_produtor_nome,
      v_produtor_id,
      CASE WHEN v_prop.origem = 'CAR' THEN v_prop.codigo_car ELSE NULL END,
      CASE WHEN v_prop.origem = 'SIGEF' THEN v_prop.codigo_sigef ELSE NULL END,
      v_prop.origem,
      CASE WHEN v_prop.geom IS NOT NULL THEN ST_SetSRID(ST_GeomFromGeoJSON(v_prop.geom::text), 4326) ELSE NULL END
    )
    RETURNING id INTO v_prop_id;

    IF auto_schedule THEN
      INSERT INTO public.auditorias (
        propriedade_id,
        tecnico_responsavel_id,
        data_agendamento,
        status
      ) VALUES (
        v_prop_id,
        tecnico_id,
        CURRENT_DATE,
        'Visita de Campo'
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('success', true, 'produtor_id', v_produtor_id);
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Erro no cadastro: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Habilitar RLS e Políticas Permissivas
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propriedades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perguntas_rtrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respostas_auditoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pendencias ENABLE ROW LEVEL SECURITY;

-- Políticas de Leitura e Escrita Públicas/Autenticadas
DROP POLICY IF EXISTS "Acesso total perfis" ON public.perfis;
CREATE POLICY "Acesso total perfis" ON public.perfis FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total propriedades" ON public.propriedades;
CREATE POLICY "Acesso total propriedades" ON public.propriedades FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total auditorias" ON public.auditorias;
CREATE POLICY "Acesso total auditorias" ON public.auditorias FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total perguntas_rtrs" ON public.perguntas_rtrs;
CREATE POLICY "Acesso total perguntas_rtrs" ON public.perguntas_rtrs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total respostas_auditoria" ON public.respostas_auditoria;
CREATE POLICY "Acesso total respostas_auditoria" ON public.respostas_auditoria FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acesso total pendencias" ON public.pendencias;
CREATE POLICY "Acesso total pendencias" ON public.pendencias FOR ALL USING (true) WITH CHECK (true);

-- Permissões Grants
GRANT ALL ON public.perfis TO anon, authenticated, service_role;
GRANT ALL ON public.propriedades TO anon, authenticated, service_role;
GRANT ALL ON public.auditorias TO anon, authenticated, service_role;
GRANT ALL ON public.perguntas_rtrs TO anon, authenticated, service_role;
GRANT ALL ON public.respostas_auditoria TO anon, authenticated, service_role;
GRANT ALL ON public.pendencias TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cadastrar_prospeccao_completa TO anon, authenticated, service_role;

-- 10. Inserir Produtor Inicial de Teste (Eddu) se não existir
INSERT INTO public.perfis (nome, email, role, regiao, status)
SELECT 'Eddu', 'eddu.amorim@gmail.com', 'produtor', 'Corumbá, MS', 'Ativo'
WHERE NOT EXISTS (SELECT 1 FROM public.perfis WHERE nome ILIKE '%Eddu%');

INSERT INTO public.perfis (nome, email, role, regiao, status)
SELECT 'Produtor MS', 'produtor@ms.gov.br', 'produtor', 'Campo Grande, MS', 'Ativo'
WHERE NOT EXISTS (SELECT 1 FROM public.perfis WHERE email = 'produtor@ms.gov.br');

INSERT INTO public.perfis (nome, email, role, regiao, status)
SELECT 'Técnico MS', 'tecnico@ms.gov.br', 'tecnico', 'Geral, MS', 'Ativo'
WHERE NOT EXISTS (SELECT 1 FROM public.perfis WHERE email = 'tecnico@ms.gov.br');

SELECT 'Schema e perfis inicializados com sucesso!' AS resultado;

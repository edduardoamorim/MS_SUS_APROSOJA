-- Função RPC para cadastrar prospecção (Produtor + Fazendas + Auditorias) em uma única transação
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
  -- 1. Resolver o Produtor
  IF produtor_option = 'novo' THEN
    -- Inserir novo produtor
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
    -- Validar produtor existente
    IF produtor_id IS NULL THEN
      RAISE EXCEPTION 'ID do produtor existente não fornecido.';
    END IF;
    v_produtor_id := produtor_id;
    SELECT nome INTO v_produtor_nome FROM public.perfis WHERE id = v_produtor_id;
  END IF;

  -- 2. Cadastrar as Fazendas
  FOR v_prop IN SELECT * FROM jsonb_to_recordset(propriedades_list) AS x(
    nome_fazenda text,
    codigo_car text,
    codigo_sigef text,
    origem text,
    geom jsonb
  )
  LOOP
    -- Inserir propriedade
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

    -- 3. Auto-agendar auditoria se solicitado
    IF auto_schedule AND tecnico_id IS NOT NULL THEN
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
  -- Qualquer erro reverte a transação inteira automaticamente
  RAISE EXCEPTION 'Erro na transação de cadastro: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Dar permissão para usuários autenticados usarem a função
GRANT EXECUTE ON FUNCTION public.cadastrar_prospeccao_completa(text, uuid, jsonb, jsonb, uuid, boolean) TO authenticated;

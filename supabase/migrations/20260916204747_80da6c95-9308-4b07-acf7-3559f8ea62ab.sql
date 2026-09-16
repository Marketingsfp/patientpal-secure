CREATE OR REPLACE FUNCTION public.coach_vincular_atendente(
  _clinica_id uuid,
  _nome_antigo text,
  _user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _novo_nome text;
  _n_analises int := 0;
  _n_roleplay int := 0;
  _n_provas int := 0;
  _n_metas int := 0;
  _n_eventos int := 0;
  _n_tempo int := 0;
  _n_tempo_somado int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF _clinica_id IS NULL OR _user_id IS NULL OR _nome_antigo IS NULL OR btrim(_nome_antigo) = '' THEN
    RAISE EXCEPTION 'Parâmetros inválidos';
  END IF;

  IF NOT public.has_module_access(auth.uid(), _clinica_id, 'coach', 'write') THEN
    RAISE EXCEPTION 'Sem permissão para gerenciar o Coach nesta clínica';
  END IF;

  -- O usuário de destino precisa ser membro ativo da mesma clínica.
  IF NOT EXISTS (
    SELECT 1 FROM public.clinica_memberships
    WHERE user_id = _user_id AND clinica_id = _clinica_id AND ativo = true
  ) THEN
    RAISE EXCEPTION 'Usuário não é membro ativo desta clínica';
  END IF;

  SELECT btrim(nome) INTO _novo_nome FROM public.profiles WHERE id = _user_id;
  IF _novo_nome IS NULL OR _novo_nome = '' THEN
    RAISE EXCEPTION 'O usuário escolhido não tem nome no perfil';
  END IF;

  _nome_antigo := btrim(_nome_antigo);

  UPDATE public.coach_analises
     SET atendente = _novo_nome, user_id = _user_id
   WHERE clinica_id = _clinica_id AND atendente = _nome_antigo;
  GET DIAGNOSTICS _n_analises = ROW_COUNT;

  UPDATE public.coach_roleplay_sessions
     SET atendente = _novo_nome, user_id = _user_id
   WHERE clinica_id = _clinica_id AND atendente = _nome_antigo;
  GET DIAGNOSTICS _n_roleplay = ROW_COUNT;

  UPDATE public.coach_provas
     SET atendente = _novo_nome, user_id = _user_id
   WHERE clinica_id = _clinica_id AND atendente = _nome_antigo;
  GET DIAGNOSTICS _n_provas = ROW_COUNT;

  UPDATE public.coach_eventos_seguranca
     SET atendente = _novo_nome, user_id = _user_id
   WHERE clinica_id = _clinica_id AND atendente = _nome_antigo;
  GET DIAGNOSTICS _n_eventos = ROW_COUNT;

  -- Metas: chave única (clinica_id, atendente). Se já existir meta do novo
  -- nome, a antiga é descartada para não sobrescrever a meta vigente.
  IF EXISTS (
    SELECT 1 FROM public.coach_desempenho_metas
     WHERE clinica_id = _clinica_id AND atendente = _novo_nome
  ) THEN
    DELETE FROM public.coach_desempenho_metas
     WHERE clinica_id = _clinica_id AND atendente = _nome_antigo AND _novo_nome <> _nome_antigo;
  ELSE
    UPDATE public.coach_desempenho_metas
       SET atendente = _novo_nome, user_id = _user_id
     WHERE clinica_id = _clinica_id AND atendente = _nome_antigo;
    GET DIAGNOSTICS _n_metas = ROW_COUNT;
  END IF;

  -- Tempo de estudo: soma nas linhas que já existem para o novo nome.
  IF _novo_nome <> _nome_antigo THEN
    WITH somadas AS (
      UPDATE public.coach_tempo_estudo novo
         SET segundos = novo.segundos + antigo.segundos,
             user_id = COALESCE(novo.user_id, _user_id),
             updated_at = now()
        FROM public.coach_tempo_estudo antigo
       WHERE antigo.clinica_id = _clinica_id
         AND antigo.atendente = _nome_antigo
         AND novo.clinica_id = _clinica_id
         AND novo.atendente = _novo_nome
         AND novo.atividade = antigo.atividade
         AND novo.dia = antigo.dia
      RETURNING antigo.id AS id_antigo
    ), removidas AS (
      DELETE FROM public.coach_tempo_estudo
       WHERE id IN (SELECT id_antigo FROM somadas)
      RETURNING 1
    )
    SELECT count(*) INTO _n_tempo_somado FROM removidas;
  END IF;

  UPDATE public.coach_tempo_estudo
     SET atendente = _novo_nome, user_id = _user_id, updated_at = now()
   WHERE clinica_id = _clinica_id AND atendente = _nome_antigo;
  GET DIAGNOSTICS _n_tempo = ROW_COUNT;

  RETURN jsonb_build_object(
    'novo_nome', _novo_nome,
    'analises', _n_analises,
    'roleplay', _n_roleplay,
    'provas', _n_provas,
    'metas', _n_metas,
    'eventos', _n_eventos,
    'tempo_estudo', _n_tempo,
    'tempo_estudo_somado', _n_tempo_somado
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.coach_vincular_atendente(uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_vincular_atendente(uuid, text, uuid) TO authenticated;
-- Funções de apoio da API de integração (/api/integrations/v1).
-- Nenhuma tabela nova; as tabelas já existem desde a etapa 1.

-- 1) Consumo de rate limit de forma atômica (evita corrida entre chamadas
--    simultâneas da mesma chave). Retorna o contador já incrementado.
CREATE OR REPLACE FUNCTION public.integracao_rate_limit_consumir(
  _api_key_id uuid,
  _janela text,
  _janela_inicio timestamptz,
  _limite integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_contador integer;
BEGIN
  INSERT INTO public.integracao_rate_limit (api_key_id, janela, janela_inicio, contador)
  VALUES (_api_key_id, _janela, _janela_inicio, 1)
  ON CONFLICT (api_key_id, janela, janela_inicio)
  DO UPDATE SET contador = public.integracao_rate_limit.contador + 1,
                updated_at = now()
  RETURNING contador INTO v_contador;

  RETURN jsonb_build_object(
    'permitido', v_contador <= _limite,
    'contador', v_contador,
    'limite', _limite
  );
END;
$$;

REVOKE ALL ON FUNCTION public.integracao_rate_limit_consumir(uuid, text, timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integracao_rate_limit_consumir(uuid, text, timestamptz, integer) TO service_role;

-- 2) Emissão de chave de API. A chave em texto claro só existe no retorno
--    desta chamada; o banco guarda apenas o SHA-256.
CREATE OR REPLACE FUNCTION public.integracao_criar_api_key(
  _clinica_id uuid,
  _nome text,
  _origem_integracao text,
  _escopos text[] DEFAULT ARRAY['availability:read','appointments:read','appointments:write'],
  _expira_em timestamptz DEFAULT NULL,
  _limite_por_minuto integer DEFAULT 60,
  _limite_por_dia integer DEFAULT 1000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_segredo text;
  v_prefixo text;
  v_chave text;
  v_id uuid;
BEGIN
  IF NOT public.can_manage_clinica(auth.uid(), _clinica_id) THEN
    RAISE EXCEPTION 'Sem permissão para emitir chave de integração nesta clínica.';
  END IF;

  IF _origem_integracao IS NULL OR btrim(_origem_integracao) = '' THEN
    RAISE EXCEPTION 'Informe a origem_integracao (identificador do parceiro).';
  END IF;

  v_prefixo := 'hh_' || encode(gen_random_bytes(4), 'hex');
  v_segredo := encode(gen_random_bytes(32), 'hex');
  v_chave := v_prefixo || '_' || v_segredo;

  INSERT INTO public.integracao_api_keys (
    clinica_id, origem_integracao, nome, key_prefix, key_hash,
    escopos, ativo, expira_em, limite_por_minuto, limite_por_dia, criado_por
  ) VALUES (
    _clinica_id, btrim(_origem_integracao), _nome, v_prefixo,
    encode(digest(v_chave, 'sha256'), 'hex'),
    _escopos, true, _expira_em, _limite_por_minuto, _limite_por_dia, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'key_prefix', v_prefixo,
    'api_key', v_chave,
    'escopos', _escopos,
    'aviso', 'Guarde esta chave agora: ela não pode ser recuperada depois.'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.integracao_criar_api_key(uuid, text, text, text[], timestamptz, integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.integracao_criar_api_key(uuid, text, text, text[], timestamptz, integer, integer) TO authenticated, service_role;

-- 3) Revogação.
CREATE OR REPLACE FUNCTION public.integracao_revogar_api_key(_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica uuid;
BEGIN
  SELECT clinica_id INTO v_clinica FROM public.integracao_api_keys WHERE id = _id;
  IF v_clinica IS NULL THEN
    RETURN false;
  END IF;
  IF NOT public.can_manage_clinica(auth.uid(), v_clinica) THEN
    RAISE EXCEPTION 'Sem permissão para revogar chave de integração nesta clínica.';
  END IF;
  UPDATE public.integracao_api_keys SET ativo = false, updated_at = now() WHERE id = _id;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.integracao_revogar_api_key(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.integracao_revogar_api_key(uuid) TO authenticated, service_role;
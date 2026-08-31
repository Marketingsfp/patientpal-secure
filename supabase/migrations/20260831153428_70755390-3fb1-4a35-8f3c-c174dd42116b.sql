ALTER TABLE public.integracao_api_keys
  ADD COLUMN IF NOT EXISTS limite_pacientes_por_minuto integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS limite_pacientes_por_dia integer NOT NULL DEFAULT 200;

DROP FUNCTION IF EXISTS public.integracao_criar_api_key(uuid, text, text, text[], timestamptz, integer, integer);

CREATE OR REPLACE FUNCTION public.integracao_criar_api_key(
  _clinica_id uuid,
  _nome text,
  _origem_integracao text,
  _escopos text[] DEFAULT ARRAY['availability:read'::text, 'appointments:read'::text, 'appointments:write'::text],
  _expira_em timestamptz DEFAULT NULL,
  _limite_por_minuto integer DEFAULT 60,
  _limite_por_dia integer DEFAULT 1000,
  _limite_pacientes_por_minuto integer DEFAULT 20,
  _limite_pacientes_por_dia integer DEFAULT 200
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_segredo text;
  v_prefixo text;
  v_chave text;
  v_id uuid;
BEGIN
  IF NOT public.can_manage_clinica(auth.uid(), _clinica_id) THEN
    RAISE EXCEPTION 'Sem permissao para emitir chave de integracao nesta clinica.';
  END IF;

  IF _origem_integracao IS NULL OR btrim(_origem_integracao) = '' THEN
    RAISE EXCEPTION 'Informe a origem_integracao (identificador do parceiro).';
  END IF;

  v_prefixo := 'hh_' || encode(extensions.gen_random_bytes(4), 'hex');
  v_segredo := encode(extensions.gen_random_bytes(32), 'hex');
  v_chave := v_prefixo || '_' || v_segredo;

  INSERT INTO public.integracao_api_keys (
    clinica_id, origem_integracao, nome, key_prefix, key_hash,
    escopos, ativo, expira_em, limite_por_minuto, limite_por_dia,
    limite_pacientes_por_minuto, limite_pacientes_por_dia, criado_por
  ) VALUES (
    _clinica_id, btrim(_origem_integracao), _nome, v_prefixo,
    encode(extensions.digest(v_chave, 'sha256'), 'hex'),
    _escopos, true, _expira_em, _limite_por_minuto, _limite_por_dia,
    _limite_pacientes_por_minuto, _limite_pacientes_por_dia, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'id', v_id,
    'key_prefix', v_prefixo,
    'api_key', v_chave,
    'escopos', _escopos,
    'aviso', 'Guarde esta chave agora: ela nao pode ser recuperada depois.'
  );
END;
$function$;

-- Resolucao de paciente da API v1.1.
-- Roda sob trava por (clinica, cpf) para que dois cliques simultaneos do site
-- publico nao criem paciente duplicado. NAO existe indice unico em
-- (clinica_id, cpf_digits) de proposito: a base legada tem duplicidades.
CREATE OR REPLACE FUNCTION public.integracao_resolver_paciente(
  _clinica_id uuid,
  _cpf_digits text,
  _nome text,
  _data_nascimento date,
  _telefone text,
  _email text DEFAULT NULL,
  _sexo text DEFAULT 'nao_informar'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_nasc date;
  v_sexo text;
BEGIN
  IF _clinica_id IS NULL OR _cpf_digits IS NULL OR length(_cpf_digits) <> 11 THEN
    RAISE EXCEPTION 'Parametros invalidos para resolver paciente.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(_clinica_id::text || _cpf_digits));

  SELECT id, data_nascimento INTO v_id, v_nasc
    FROM public.pacientes
   WHERE clinica_id = _clinica_id
     AND cpf_digits = _cpf_digits
     AND ativo = true
   ORDER BY created_at ASC
   LIMIT 1;

  IF v_id IS NOT NULL THEN
    IF v_nasc IS DISTINCT FROM _data_nascimento THEN
      RETURN jsonb_build_object('mismatch', true);
    END IF;
    -- Cadastro existente e fonte de verdade: nada e sobrescrito aqui.
    RETURN jsonb_build_object('paciente_id', v_id, 'criado', false, 'mismatch', false);
  END IF;

  v_sexo := COALESCE(NULLIF(btrim(_sexo), ''), 'nao_informar');
  IF v_sexo NOT IN ('masculino', 'feminino', 'outro', 'nao_informar') THEN
    v_sexo := 'nao_informar';
  END IF;

  INSERT INTO public.pacientes (
    clinica_id, nome, cpf, data_nascimento, telefone, email, sexo,
    ativo, consentimento_lgpd_em
  ) VALUES (
    _clinica_id, btrim(_nome), _cpf_digits, _data_nascimento,
    NULLIF(btrim(COALESCE(_telefone, '')), ''), NULLIF(btrim(COALESCE(_email, '')), ''),
    v_sexo, true, now()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('paciente_id', v_id, 'criado', true, 'mismatch', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.integracao_resolver_paciente(uuid, text, text, date, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integracao_resolver_paciente(uuid, text, text, date, text, text, text) TO service_role;
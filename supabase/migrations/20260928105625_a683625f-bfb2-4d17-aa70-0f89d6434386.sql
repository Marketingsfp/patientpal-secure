DROP FUNCTION IF EXISTS public.integracao_resolver_paciente(uuid, text, text, date, text, text, text);

CREATE FUNCTION public.integracao_resolver_paciente(
  _clinica_id uuid, _cpf_digits text, _nome text, _data_nascimento date, _telefone text,
  _email text DEFAULT NULL, _sexo text DEFAULT 'nao_informar', _somente_existente boolean DEFAULT false)
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
    RETURN jsonb_build_object('paciente_id', v_id, 'criado', false, 'mismatch', false);
  END IF;

  -- v1.4: sem nome/telefone a API so pode reaproveitar cadastro existente.
  IF _somente_existente THEN
    RETURN jsonb_build_object('nao_encontrado', true);
  END IF;

  IF _nome IS NULL OR btrim(_nome) = '' THEN
    RAISE EXCEPTION 'Nome obrigatorio para criar paciente.';
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

REVOKE ALL ON FUNCTION public.integracao_resolver_paciente(uuid, text, text, date, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integracao_resolver_paciente(uuid, text, text, date, text, text, text, boolean) TO service_role;

-- v1.4: consulta mascarada. Mesmo SELECT nos dois caminhos; so devolve dados
-- quando CPF e nascimento batem. Nunca devolve id.
CREATE OR REPLACE FUNCTION public.integracao_lookup_paciente(
  _clinica_id uuid, _cpf_digits text, _data_nascimento date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_nome text;
  v_tel text;
  v_nasc date;
  v_ok boolean;
BEGIN
  IF _clinica_id IS NULL OR _cpf_digits IS NULL OR length(_cpf_digits) <> 11 THEN
    RAISE EXCEPTION 'Parametros invalidos.';
  END IF;

  SELECT nome, COALESCE(NULLIF(telefone, ''), telefone2), data_nascimento
    INTO v_nome, v_tel, v_nasc
    FROM public.pacientes
   WHERE clinica_id = _clinica_id
     AND cpf_digits = _cpf_digits
     AND ativo = true
   ORDER BY created_at ASC
   LIMIT 1;

  v_ok := v_nasc IS NOT NULL AND v_nasc = _data_nascimento;

  RETURN jsonb_build_object(
    'encontrado', v_ok,
    'nome', CASE WHEN v_ok THEN v_nome END,
    'telefone', CASE WHEN v_ok THEN v_tel END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.integracao_lookup_paciente(uuid, text, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integracao_lookup_paciente(uuid, text, date) TO service_role;
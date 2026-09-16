-- Cadastro da Nina: mesmos campos obrigatórios do Clínica OS, CPF opcional.
-- Adição isolada. Não altera a API de integração existente nem dados históricos.
CREATE OR REPLACE FUNCTION public.nina_resolver_cadastro(
  _clinica_id uuid, _conversa_id uuid, _nome text, _data_nascimento date,
  _telefone text, _cpf text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_conv public.atend_conversas%ROWTYPE;
  v_pac public.pacientes%ROWTYPE;
  v_ids uuid[];
  v_id uuid;
  v_nome text := upper(public.strip_accents(regexp_replace(btrim(coalesce(_nome, '')), '\s+', ' ', 'g')));
  v_tel text := public.normalizar_telefone(_telefone);
  v_cpf text := nullif(regexp_replace(coalesce(_cpf, ''), '\D', '', 'g'), '');
  v_criado boolean := false;
  v_completados text[] := ARRAY[]::text[];
BEGIN
  IF _clinica_id IS NULL OR _conversa_id IS NULL OR length(v_nome) < 2
    OR _data_nascimento IS NULL OR _data_nascimento > current_date
    OR _data_nascimento < (current_date - interval '120 years')::date
    OR v_tel IS NULL OR length(v_tel) NOT BETWEEN 10 AND 11
    OR (v_cpf IS NOT NULL AND length(v_cpf) <> 11) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'VALIDATION_ERROR');
  END IF;

  SELECT * INTO v_conv FROM public.atend_conversas
    WHERE id = _conversa_id AND clinica_id = _clinica_id FOR UPDATE;
  IF NOT FOUND OR coalesce(v_conv.is_teste, false) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'PERMISSION_DENIED');
  END IF;
  -- A trava vale também entre conversas da mesma pessoa, com ou sem CPF.
  PERFORM pg_advisory_xact_lock(hashtextextended(_clinica_id::text || '|' || v_nome || '|' || _data_nascimento::text, 0));
  IF v_cpf IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext(_clinica_id::text || v_cpf));
  END IF;

  IF v_conv.identidade_confirmada AND v_conv.contato_paciente_id IS NOT NULL THEN
    v_id := v_conv.contato_paciente_id;
  ELSE
    -- CPF espontaneamente informado pode ajudar, mas jamais é exigido.
    IF v_cpf IS NOT NULL THEN
      SELECT array_agg(id) INTO v_ids FROM public.pacientes
        WHERE clinica_id = _clinica_id AND cpf_digits = v_cpf
          AND NOT is_mock_data AND NOT teste;
      IF cardinality(v_ids) > 1 THEN
        RETURN jsonb_build_object('ok', false, 'erro', 'PATIENT_AMBIGUOUS');
      END IF;
      v_id := v_ids[1];
    END IF;
    IF v_id IS NULL THEN
      SELECT array_agg(id) INTO v_ids FROM public.pacientes
        WHERE clinica_id = _clinica_id AND NOT is_mock_data AND NOT teste
          AND upper(public.strip_accents(regexp_replace(btrim(nome), '\s+', ' ', 'g'))) = v_nome
          AND (data_nascimento = _data_nascimento OR data_nascimento IS NULL);
      IF cardinality(v_ids) > 1 THEN
        -- Homônimos nunca são escolhidos por ordem, nem por tentativa de agenda.
        RETURN jsonb_build_object('ok', false, 'erro', 'PATIENT_AMBIGUOUS');
      END IF;
      v_id := v_ids[1];
      IF v_id IS NOT NULL THEN
        SELECT * INTO v_pac FROM public.pacientes WHERE id = v_id AND clinica_id = _clinica_id;
        IF public.normalizar_telefone(v_pac.telefone) IS DISTINCT FROM v_tel
          AND public.normalizar_telefone(v_pac.telefone2) IS DISTINCT FROM v_tel THEN
          RETURN jsonb_build_object('ok', false, 'erro', 'PATIENT_DATA_MISMATCH');
        END IF;
      END IF;
    END IF;
  END IF;

  IF v_id IS NOT NULL THEN
    SELECT * INTO v_pac FROM public.pacientes
      WHERE id = v_id AND clinica_id = _clinica_id AND NOT is_mock_data AND NOT teste FOR UPDATE;
    IF NOT FOUND OR NOT v_pac.ativo
      OR upper(public.strip_accents(regexp_replace(btrim(v_pac.nome), '\s+', ' ', 'g'))) <> v_nome
      OR (v_pac.data_nascimento IS NOT NULL AND v_pac.data_nascimento <> _data_nascimento)
      OR (v_cpf IS NOT NULL AND nullif(v_pac.cpf_digits, '') IS NOT NULL AND v_pac.cpf_digits <> v_cpf) THEN
      RETURN jsonb_build_object('ok', false, 'erro', 'PATIENT_DATA_MISMATCH');
    END IF;
    -- Completa apenas campos vazios; não corrige nem sobrescreve cadastro legado.
    IF v_pac.data_nascimento IS NULL THEN v_completados := array_append(v_completados, 'data_nascimento'); END IF;
    IF nullif(btrim(v_pac.telefone), '') IS NULL THEN v_completados := array_append(v_completados, 'telefone'); END IF;
    IF cardinality(v_completados) > 0 THEN
      UPDATE public.pacientes SET
        data_nascimento = coalesce(data_nascimento, _data_nascimento),
        telefone = coalesce(nullif(btrim(telefone), ''), v_tel)
        WHERE id = v_id AND clinica_id = _clinica_id;
    END IF;
  ELSE
    INSERT INTO public.pacientes (clinica_id, nome, data_nascimento, telefone, cpf, sexo, ativo)
      VALUES (_clinica_id, v_nome, _data_nascimento, v_tel, v_cpf, 'nao_informar', true)
      RETURNING id INTO v_id;
    v_criado := true;
  END IF;

  UPDATE public.atend_conversas SET contato_paciente_id = v_id, identidade_confirmada = true
    WHERE id = _conversa_id AND clinica_id = _clinica_id;
  INSERT INTO public.audit_log (clinica_id, table_name, record_id, action, dados_depois)
    VALUES (_clinica_id, 'pacientes', v_id, 'NINA_CADASTRO_RESOLVIDO',
      jsonb_build_object('conversa_id', _conversa_id, 'criado', v_criado,
        'campos_completados', v_completados, 'origem', 'nina_whatsapp'));
  RETURN jsonb_build_object('ok', true, 'paciente_id', v_id, 'criado', v_criado,
    'campos_completados', v_completados);
END;
$function$;
REVOKE ALL ON FUNCTION public.nina_resolver_cadastro(uuid, uuid, text, date, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nina_resolver_cadastro(uuid, uuid, text, date, text, text) TO service_role;

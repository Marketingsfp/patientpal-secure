CREATE OR REPLACE FUNCTION public.nina_alterar_telefone_paciente(
  _clinica_id uuid, _conversa_id uuid, _paciente_id uuid,
  _nome text, _data_nascimento date, _telefone_anterior text,
  _telefone_novo text, _solicitacao text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_conv public.atend_conversas%ROWTYPE;
  v_pac public.pacientes%ROWTYPE;
  v_tel text := public.normalizar_telefone(_telefone_novo);
BEGIN
  IF coalesce(_telefone_novo, '') !~ '^[0-9]{10,11}$'
    OR nullif(btrim(_solicitacao), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'VALIDATION_ERROR');
  END IF;
  SELECT * INTO v_conv FROM public.atend_conversas
    WHERE id = _conversa_id AND clinica_id = _clinica_id FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(v_conv.identidade_confirmada, false)
    OR v_conv.contato_paciente_id IS DISTINCT FROM _paciente_id THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'PATIENT_NOT_VERIFIED');
  END IF;
  SELECT * INTO v_pac FROM public.pacientes
    WHERE id = _paciente_id AND clinica_id = _clinica_id
      AND is_mock_data = coalesce(v_conv.is_teste, false)
      AND teste = coalesce(v_conv.is_teste, false) FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(v_pac.ativo, false)
    OR upper(public.strip_accents(btrim(v_pac.nome))) IS DISTINCT FROM upper(public.strip_accents(btrim(_nome)))
    OR v_pac.data_nascimento IS DISTINCT FROM _data_nascimento THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'PATIENT_DATA_MISMATCH');
  END IF;
  -- Repetição da mesma operação não escreve nem duplica auditoria.
  IF public.normalizar_telefone(v_pac.telefone) = v_tel THEN
    RETURN jsonb_build_object('ok', true, 'paciente_id', _paciente_id, 'telefone', v_tel);
  END IF;
  IF public.normalizar_telefone(v_pac.telefone) IS DISTINCT FROM public.normalizar_telefone(_telefone_anterior) THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'PATIENT_DATA_MISMATCH');
  END IF;
  UPDATE public.pacientes SET telefone = v_tel
    WHERE id = _paciente_id AND clinica_id = _clinica_id;
  INSERT INTO public.audit_log(clinica_id, table_name, record_id, action, dados_antes, dados_depois)
    VALUES (_clinica_id, 'pacientes', _paciente_id, 'NINA_TELEFONE_ALTERADO',
      jsonb_build_object('telefone', v_pac.telefone),
      jsonb_build_object('telefone', v_tel, 'conversa_id', _conversa_id,
        'solicitacao', _solicitacao, 'origem', CASE WHEN v_conv.is_teste THEN 'nina_homologacao' ELSE 'nina_whatsapp' END));
  RETURN jsonb_build_object('ok', true, 'paciente_id', _paciente_id, 'telefone', v_tel);
END;
$function$;
REVOKE ALL ON FUNCTION public.nina_alterar_telefone_paciente(uuid,uuid,uuid,text,date,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.nina_alterar_telefone_paciente(uuid,uuid,uuid,text,date,text,text,text) TO service_role;
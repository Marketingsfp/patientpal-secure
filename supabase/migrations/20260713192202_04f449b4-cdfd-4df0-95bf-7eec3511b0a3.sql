CREATE OR REPLACE FUNCTION public.medico_dados_sensiveis(_medico_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _row record;
BEGIN
  SELECT m.id, m.clinica_id, m.user_id, m.cpf, m.rg, m.data_nascimento,
         m.banco, m.agencia, m.conta, m.pix_chave,
         m.tipo_repasse, m.percentual_repasse_padrao, m.valor_repasse_padrao,
         m.aceita_cartao_beneficios,
         m.cb_tipo_repasse, m.cb_percentual_repasse, m.cb_valor_repasse
    INTO _row
    FROM public.medicos m
   WHERE m.id = _medico_id;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Médico não encontrado';
  END IF;

  IF NOT (
    public.can_manage_clinica(auth.uid(), _row.clinica_id)
    OR _row.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Sem permissão para ler dados sensíveis';
  END IF;

  RETURN jsonb_build_object(
    'cpf', _row.cpf,
    'rg', _row.rg,
    'data_nascimento', _row.data_nascimento,
    'banco', _row.banco,
    'agencia', _row.agencia,
    'conta', _row.conta,
    'pix_chave', _row.pix_chave,
    'tipo_repasse', _row.tipo_repasse,
    'percentual_repasse_padrao', _row.percentual_repasse_padrao,
    'valor_repasse_padrao', _row.valor_repasse_padrao,
    'aceita_cartao_beneficios', _row.aceita_cartao_beneficios,
    'cb_tipo_repasse', _row.cb_tipo_repasse,
    'cb_percentual_repasse', _row.cb_percentual_repasse,
    'cb_valor_repasse', _row.cb_valor_repasse
  );
END;
$function$;
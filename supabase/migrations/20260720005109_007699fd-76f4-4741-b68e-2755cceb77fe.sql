-- Termina a limpeza de "recursos de enfermagem", removida de propósito na
-- migration 20260717002953 (DROP das 4 tabelas + coluna agendamentos.
-- enfermagem_recurso_id). Duas funções não foram atualizadas naquele
-- momento e ainda referenciam a coluna removida, quebrando com o erro
-- "record NEW has no field enfermagem_recurso_id" sempre que:
--   (a) um agendamento com orcamento_item_id vinculado é inserido/atualizado
--       (gatilho fn_agendamento_valida_destino), ou
--   (b) a tela de Conversão de Orçamento tenta agendar um item
--       (função converter_item_agendamento).
-- Mesmo espírito de limpeza já aplicado a salvar_agendamento_e_vincular_
-- orcamento e salvar_agendamento_multi_imagem na migration 20260717003323.

CREATE OR REPLACE FUNCTION public.fn_agendamento_valida_destino()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo_destino text;
  v_tipo_recurso_proc text;
  v_requer_medico boolean;
  v_requer_sala boolean;
  v_tipo_recurso_agenda text;
BEGIN
  IF NEW.orcamento_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.tipo_destino, p.tipo_recurso, p.requer_medico, p.requer_sala
    INTO v_tipo_destino, v_tipo_recurso_proc, v_requer_medico, v_requer_sala
  FROM public.orcamento_itens oi
  LEFT JOIN public.procedimentos p ON p.id = oi.procedimento_id
  WHERE oi.id = NEW.orcamento_item_id;

  IF v_tipo_destino IS NULL THEN
    RAISE EXCEPTION 'Procedimento não classificado. Classifique o tipo de destino em Configurações → Procedimentos antes de agendar.';
  END IF;

  IF v_tipo_destino IN ('consulta','procedimento_medico') AND NEW.medico_id IS NULL THEN
    RAISE EXCEPTION 'Este procedimento (%) exige um médico.', v_tipo_destino;
  END IF;

  IF v_tipo_destino = 'exame_equipamento' AND NEW.agenda_id IS NULL THEN
    RAISE EXCEPTION 'Este exame exige uma agenda de equipamento ou recurso.';
  END IF;

  IF v_requer_sala AND NEW.agenda_id IS NULL THEN
    RAISE EXCEPTION 'Este procedimento exige sala/equipamento.';
  END IF;

  IF v_tipo_destino = 'exame_equipamento' AND NEW.agenda_id IS NOT NULL AND v_tipo_recurso_proc IS NOT NULL THEN
    SELECT tipo_recurso INTO v_tipo_recurso_agenda FROM public.medico_agendas WHERE id = NEW.agenda_id;
    IF v_tipo_recurso_agenda IS DISTINCT FROM v_tipo_recurso_proc THEN
      RAISE EXCEPTION 'Agenda incompatível: o procedimento requer recurso "%", mas a agenda escolhida é "%".',
        v_tipo_recurso_proc, COALESCE(v_tipo_recurso_agenda,'consulta');
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.converter_item_agendamento(p_item_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item record;
  v_orc record;
  v_regras jsonb;
  v_agenda_obrig boolean;
  v_medico_obrig boolean;
  v_sala_obrig boolean;
  v_equip_obrig boolean;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_medico_id uuid;
  v_recurso_id uuid;
  v_sala text;
  v_agend_id uuid;
  v_tempo int;
BEGIN
  SELECT i.*, o.clinica_id AS orc_clinica_id, o.paciente_id AS orc_paciente_id, o.paciente_nome AS orc_paciente_nome
    INTO v_item
  FROM public.orcamento_itens i
  JOIN public.orcamentos o ON o.id = i.orcamento_id
  WHERE i.id = p_item_id
  FOR UPDATE OF i;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'codigo', 'ITEM_NAO_ENCONTRADO'); END IF;
  IF NOT public.is_member(auth.uid(), v_item.orc_clinica_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SEM_ACESSO');
  END IF;
  IF v_item.status_operacional = 'agendado' OR v_item.agendamento_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ITEM_JA_AGENDADO', 'agendamento_id', v_item.agendamento_id);
  END IF;
  IF v_item.status_operacional IN ('cancelado','concluido','em_atendimento') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ITEM_INVALIDO');
  END IF;
  IF v_item.procedimento_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'REGRA_INVALIDA', 'mensagem','Item sem procedimento vinculado');
  END IF;

  v_regras := public.fn_regras_procedimento(v_item.procedimento_id, NULL);
  IF (v_regras->>'fluxo_atendimento') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'REGRA_INVALIDA',
      'mensagem','Procedimento sem fluxo_atendimento configurado. Ajuste em Regras do procedimento.');
  END IF;

  v_agenda_obrig := COALESCE((v_regras->>'agenda_obrigatoria')::bool, true);
  v_medico_obrig := COALESCE((v_regras->>'medico_obrigatorio')::bool, false);
  v_sala_obrig   := COALESCE((v_regras->>'sala_obrigatoria')::bool, false);
  v_equip_obrig  := COALESCE((v_regras->>'equipamento_obrigatorio')::bool, false);
  v_tempo        := COALESCE((v_regras->>'tempo_padrao_min')::int, 30);

  -- Sem agenda real: só marca aguardando_agendamento (fila)
  IF NOT v_agenda_obrig THEN
    UPDATE public.orcamento_itens
       SET status_operacional = 'aguardando_agendamento',
           agendado_em = now(),
           status_op_em = now()
     WHERE id = p_item_id;

    PERFORM public.log_action('orcamento_itens', p_item_id::text, 'UPDATE', v_item.orc_clinica_id,
      to_jsonb(v_item), jsonb_build_object('acao','converter_item_sem_agenda','regras',v_regras));

    RETURN jsonb_build_object('ok', true, 'codigo', 'OK', 'sem_agendamento_real', true,
      'fluxo_atendimento', v_regras->>'fluxo_atendimento');
  END IF;

  -- Com agenda real
  v_inicio    := (p_payload->>'inicio')::timestamptz;
  v_fim       := COALESCE((p_payload->>'fim')::timestamptz, v_inicio + make_interval(mins => v_tempo));
  v_medico_id := NULLIF(p_payload->>'medico_id','')::uuid;
  v_recurso_id:= NULLIF(p_payload->>'enfermagem_recurso_id','')::uuid;
  v_sala      := NULLIF(p_payload->>'sala','');

  IF v_inicio IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'INICIO_OBRIGATORIO');
  END IF;
  IF v_medico_obrig AND v_medico_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'MEDICO_OBRIGATORIO');
  END IF;
  IF v_equip_obrig AND v_recurso_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'EQUIPAMENTO_OBRIGATORIO');
  END IF;
  IF v_sala_obrig AND v_sala IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SALA_OBRIGATORIA');
  END IF;
  IF v_medico_id IS NULL AND v_recurso_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'RECURSO_INCOMPATIVEL',
      'mensagem','Informe médico ou recurso de enfermagem');
  END IF;

  INSERT INTO public.agendamentos(
    clinica_id, paciente_id, paciente_nome, medico_id,
    inicio, fim, procedimento, status, tipo_atendimento,
    observacoes, orcamento_id, orcamento_item_id, criado_por
  ) VALUES (
    v_item.orc_clinica_id, v_item.orc_paciente_id, v_item.orc_paciente_nome,
    v_medico_id,
    v_inicio, v_fim, v_item.descricao, 'agendado',
    COALESCE(NULLIF(p_payload->>'tipo_atendimento',''), 'particular'),
    COALESCE(p_payload->>'observacoes','') || CASE WHEN v_sala IS NOT NULL THEN E'\nSala: '||v_sala ELSE '' END,
    v_item.orcamento_id, p_item_id, auth.uid()
  ) RETURNING id INTO v_agend_id;

  UPDATE public.orcamento_itens
     SET agendamento_id = v_agend_id,
         status_operacional = 'agendado',
         agendado_em = now(),
         status_op_em = now()
   WHERE id = p_item_id;

  PERFORM public.log_action('orcamento_itens', p_item_id::text, 'UPDATE', v_item.orc_clinica_id,
    to_jsonb(v_item), jsonb_build_object('acao','converter_item_agendamento','agendamento_id',v_agend_id,'regras',v_regras));

  RETURN jsonb_build_object('ok', true, 'codigo', 'OK', 'agendamento_id', v_agend_id,
    'sem_agendamento_real', false, 'fluxo_atendimento', v_regras->>'fluxo_atendimento');
END;
$function$;

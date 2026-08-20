-- ============================================================================
-- Atendimento de paciente com Cartão Benefícios deixa de nascer "Particular"
-- ============================================================================
--
-- `agendamentos.tipo_atendimento` tem DEFAULT 'particular'. Quem insere sem
-- preencher a coluna grava "Particular" mesmo para paciente com contrato ativo
-- e em dia. A tela principal da Agenda já resolvia isso no frontend, mas três
-- portas de entrada não: Atendimento múltiplo (corrigido no frontend), a
-- conversão de item de orçamento e o agendamento online/público — estas duas
-- inserem direto do banco e são corrigidas aqui.
--
-- Levantamento de 20/08/2026: de 1.600 agendamentos de paciente com contrato
-- ativo, 1.457 estavam marcados "Particular", dos quais 772 com o contrato em
-- dia (321 pacientes). O valor cobrado estava correto — o caixa aplica o
-- desconto do cartão mesmo com o atendimento marcado "Particular" —, o que
-- quebrava era a classificação e os relatórios.
--
-- Esta migração NÃO altera nenhuma linha existente: só cria a função de regra
-- e passa a usá-la nas inserções novas. A correção dos 772 registros antigos é
-- assunto separado, para ser feita por tela com revisão da clínica.

-- ---------------------------------------------------------------------------
-- Regra única: o paciente deve ser atendido como convênio?
-- ---------------------------------------------------------------------------
-- Espelha exatamente a regra já usada no frontend
-- (src/lib/convenio/tipo-atendimento-padrao.ts):
--
--   1. contrato ATIVO na clínica, como titular ou como dependente ativo;
--   2. nenhuma mensalidade vencida há mais de 5 dias corridos (tolerância);
--   3. contrato sem `convenio_id` preenchido TAMBÉM conta como convênio — o
--      paciente pagou o cartão, o que falta é vincular o convênio no cadastro.
--      São 245 contratos hoje, responsáveis por 100 dos 772 registros errados.
--
-- STABLE: só lê. SECURITY DEFINER porque `agendar_publico` roda sem sessão e
-- não teria acesso a contratos_assinatura pelas políticas de RLS.
CREATE OR REPLACE FUNCTION public.tipo_atendimento_padrao(
  p_clinica_id uuid,
  p_paciente_id uuid
)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contrato_id uuid;
  v_atrasadas   int;
  -- Dias corridos de tolerância após o vencimento. Mesmo número de
  -- `obterInfoConvenioPaciente` e da tela da Agenda.
  c_tolerancia  constant int := 5;
BEGIN
  IF p_clinica_id IS NULL OR p_paciente_id IS NULL THEN
    RETURN 'particular';
  END IF;

  -- Titular. Preferência pelo contrato com convênio vinculado quando há mais
  -- de um, para que o cadastro completo prevaleça.
  SELECT c.id INTO v_contrato_id
  FROM public.contratos_assinatura c
  WHERE c.clinica_id = p_clinica_id
    AND c.status = 'ativo'
    AND c.paciente_id = p_paciente_id
  ORDER BY (c.convenio_id IS NULL), c.created_at
  LIMIT 1;

  -- Dependente ativo.
  IF v_contrato_id IS NULL THEN
    SELECT c.id INTO v_contrato_id
    FROM public.contrato_dependentes d
    JOIN public.contratos_assinatura c ON c.id = d.contrato_id
    WHERE d.paciente_id = p_paciente_id
      AND d.ativo
      AND c.clinica_id = p_clinica_id
      AND c.status = 'ativo'
    ORDER BY (c.convenio_id IS NULL), c.created_at
    LIMIT 1;
  END IF;

  IF v_contrato_id IS NULL THEN
    RETURN 'particular';
  END IF;

  SELECT count(*) INTO v_atrasadas
  FROM public.contrato_mensalidades m
  WHERE m.contrato_id = v_contrato_id
    AND m.status IN ('pendente', 'aberto', 'atrasado')
    AND m.vencimento < (CURRENT_DATE - c_tolerancia);

  RETURN CASE WHEN v_atrasadas = 0 THEN 'convenio' ELSE 'particular' END;
END;
$function$;

COMMENT ON FUNCTION public.tipo_atendimento_padrao(uuid, uuid) IS
  'Decide se o atendimento do paciente nasce "convenio" ou "particular", a partir do contrato ativo do Cartão Benefícios e da tolerância de 5 dias de mensalidade vencida.';

-- Sem GRANT para `anon`: a função diz se um paciente tem convênio ativo, e essa
-- resposta não deve ficar disponível para quem não está autenticado.
-- `agendar_publico` roda como SECURITY DEFINER e chama esta função por dentro,
-- com os privilégios do dono — então o agendamento pelo site continua
-- funcionando sem precisar abrir a função para o público.
REVOKE ALL ON FUNCTION public.tipo_atendimento_padrao(uuid, uuid) FROM PUBLIC;
-- O REVOKE de PUBLIC acima NÃO tira a permissão de `anon`: neste projeto `anon`
-- é um papel próprio e recebe EXECUTE por privilégio padrão no momento em que a
-- função é criada. Sem esta linha explícita a função nasce aberta para visitante
-- não autenticado — foi o que aconteceu ao aplicar em 20/08/2026, corrigido em
-- seguida. Mantenha as duas linhas.
REVOKE EXECUTE ON FUNCTION public.tipo_atendimento_padrao(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.tipo_atendimento_padrao(uuid, uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Porta 1: Orçamento -> Agendamento
-- ---------------------------------------------------------------------------
-- Só muda o COALESCE final do INSERT: o payload continua tendo prioridade
-- (a tela pode mandar o tipo explicitamente), mas quando ele vem vazio a
-- decisão passa a ser a regra do contrato em vez do literal 'particular'.
-- O restante da função é idêntico ao que já está em produção.
CREATE OR REPLACE FUNCTION public.converter_item_agendamento(p_item_id uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item record;
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
    -- ANTES: COALESCE(NULLIF(p_payload->>'tipo_atendimento',''), 'particular')
    COALESCE(
      NULLIF(p_payload->>'tipo_atendimento',''),
      public.tipo_atendimento_padrao(v_item.orc_clinica_id, v_item.orc_paciente_id)
    ),
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

-- ---------------------------------------------------------------------------
-- Porta 2: Agendamento online (paciente logado no portal)
-- ---------------------------------------------------------------------------
-- Única mudança: a coluna tipo_atendimento passa a ser preenchida no INSERT.
CREATE OR REPLACE FUNCTION public.agendar_online(_clinica_id uuid, _medico_id uuid, _inicio timestamp with time zone, _fim timestamp with time zone, _agenda_id uuid DEFAULT NULL::uuid, _especialidade_id uuid DEFAULT NULL::uuid, _procedimento text DEFAULT NULL::text, _observacoes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pac  public.pacientes%ROWTYPE;
  v_cap  int;
  v_ocup int;
  v_id   uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Faça login para agendar';
  END IF;

  SELECT * INTO v_pac FROM public.pacientes p
  WHERE p.clinica_id = _clinica_id AND p.email IS NOT NULL
    AND lower(p.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  LIMIT 1;

  IF v_pac.id IS NULL THEN
    RAISE EXCEPTION 'Cadastro de paciente não encontrado nesta clínica';
  END IF;

  IF _inicio <= now() THEN
    RAISE EXCEPTION 'Escolha um horário futuro';
  END IF;

  IF _inicio > now() + interval '60 days' THEN
    RAISE EXCEPTION 'Só é possível agendar com até 60 dias de antecedência';
  END IF;

  SELECT COALESCE(MAX(COALESCE(md.limite_pacientes, 1)), 1) INTO v_cap
  FROM public.medico_disponibilidades md
  WHERE md.clinica_id = _clinica_id AND md.medico_id = _medico_id AND md.ativo;

  SELECT COUNT(*) INTO v_ocup
  FROM public.agendamentos a
  WHERE a.clinica_id = _clinica_id AND a.medico_id = _medico_id
    AND a.status <> 'cancelado'
    AND a.inicio < _fim AND a.fim > _inicio;

  IF v_ocup >= v_cap THEN
    RAISE EXCEPTION 'Este horário acabou de ser preenchido. Escolha outro.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.paciente_id = v_pac.id AND a.status <> 'cancelado'
      AND a.inicio < _fim AND a.fim > _inicio
  ) THEN
    RAISE EXCEPTION 'Você já possui um agendamento neste horário';
  END IF;

  INSERT INTO public.agendamentos (
    clinica_id, paciente_id, paciente_nome, medico_id, agenda_id, especialidade_id,
    inicio, fim, procedimento, observacoes, status, tipo_atendimento
  ) VALUES (
    _clinica_id, v_pac.id, v_pac.nome, _medico_id, _agenda_id, _especialidade_id,
    _inicio, _fim, _procedimento, _observacoes, 'agendado',
    public.tipo_atendimento_padrao(_clinica_id, v_pac.id)
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Porta 3: Agendamento público (sem login, pelo site)
-- ---------------------------------------------------------------------------
-- Mesma mudança. Paciente criado na hora nunca tem contrato, então a função
-- devolve 'particular' — igual ao comportamento atual, sem consulta extra útil,
-- mas a chamada fica pelo caminho comum para não haver uma quarta regra.
CREATE OR REPLACE FUNCTION public.agendar_publico(_clinica_id uuid, _medico_id uuid, _inicio timestamp with time zone, _fim timestamp with time zone, _nome text, _telefone text DEFAULT NULL::text, _cpf text DEFAULT NULL::text, _email text DEFAULT NULL::text, _agenda_id uuid DEFAULT NULL::uuid, _especialidade_id uuid DEFAULT NULL::uuid, _procedimento text DEFAULT NULL::text, _observacoes text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_pac   public.pacientes%ROWTYPE;
  v_cpf   text := nullif(regexp_replace(coalesce(_cpf, ''), '\D', '', 'g'), '');
  v_tel   text := nullif(regexp_replace(coalesce(_telefone, ''), '\D', '', 'g'), '');
  v_email text := nullif(lower(trim(coalesce(_email, ''))), '');
  v_nome  text := nullif(trim(coalesce(_nome, '')), '');
  v_cap   int;
  v_ocup  int;
  v_id    uuid;
BEGIN
  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Informe o nome do paciente';
  END IF;
  IF v_cpf IS NULL AND v_tel IS NULL THEN
    RAISE EXCEPTION 'Informe CPF ou telefone para contato';
  END IF;
  IF _inicio <= now() THEN
    RAISE EXCEPTION 'Escolha um horário futuro';
  END IF;
  IF _inicio > now() + interval '60 days' THEN
    RAISE EXCEPTION 'Só é possível agendar com até 60 dias de antecedência';
  END IF;

  SELECT * INTO v_pac FROM public.pacientes p
  WHERE p.clinica_id = _clinica_id
    AND (
      (v_cpf IS NOT NULL AND regexp_replace(coalesce(p.cpf, ''), '\D', '', 'g') = v_cpf)
      OR (v_tel IS NOT NULL AND regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g') = v_tel)
      OR (v_email IS NOT NULL AND lower(coalesce(p.email, '')) = v_email)
    )
  ORDER BY p.created_at
  LIMIT 1;

  IF v_pac.id IS NULL THEN
    INSERT INTO public.pacientes (clinica_id, nome, cpf, telefone, email)
    VALUES (_clinica_id, v_nome, v_cpf, v_tel, v_email)
    RETURNING * INTO v_pac;
  END IF;

  SELECT COALESCE(MAX(COALESCE(md.limite_pacientes, 1)), 1) INTO v_cap
  FROM public.medico_disponibilidades md
  WHERE md.clinica_id = _clinica_id AND md.medico_id = _medico_id AND md.ativo;

  SELECT COUNT(*) INTO v_ocup
  FROM public.agendamentos a
  WHERE a.clinica_id = _clinica_id AND a.medico_id = _medico_id
    AND a.status <> 'cancelado'
    AND a.inicio < _fim AND a.fim > _inicio;

  IF v_ocup >= v_cap THEN
    RAISE EXCEPTION 'Este horário acabou de ser preenchido. Escolha outro.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.paciente_id = v_pac.id AND a.status <> 'cancelado'
      AND a.inicio < _fim AND a.fim > _inicio
  ) THEN
    RAISE EXCEPTION 'Já existe um agendamento para este paciente neste horário';
  END IF;

  INSERT INTO public.agendamentos (
    clinica_id, paciente_id, paciente_nome, medico_id, agenda_id, especialidade_id,
    inicio, fim, procedimento, observacoes, status, tipo_atendimento
  ) VALUES (
    _clinica_id, v_pac.id, v_pac.nome, _medico_id, _agenda_id, _especialidade_id,
    _inicio, _fim, _procedimento,
    COALESCE(_observacoes, 'Agendamento pelo portal online'), 'agendado',
    public.tipo_atendimento_padrao(_clinica_id, v_pac.id)
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

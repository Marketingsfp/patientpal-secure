-- ============================================================================
-- Revisão assistida: atendimentos classificados errado e contratos incompletos
-- ============================================================================
--
-- Continuação da correção de 20/08/2026. A migração anterior
-- (20260820180000_tipo_atendimento_padrao.sql) fechou as portas de entrada para
-- que nenhum atendimento NOVO nasça "Particular" indevidamente. Sobraram os
-- registros que já existiam:
--
--   - 772 atendimentos de 321 pacientes com contrato ativo e EM DIA, gravados
--     como "Particular";
--   - 245 contratos ativos sem convênio vinculado (`convenio_id` nulo).
--
-- Nada disso é corrigido automaticamente. São registros de produção de uma
-- clínica em operação, e a decisão é da clínica: estas funções servem a uma
-- tela de revisão onde alguém vê a lista, escolhe o que ajustar e confirma.
--
-- Os 1.195 titulares com mensalidade vencida ficam de fora de propósito. Para
-- eles "Particular" é o resultado correto da regra de negócio (cartão em
-- atraso não dá desconto) — é assunto de cobrança, não de correção de dados.
--
-- Auditoria: `agendamentos` e `contratos_assinatura` já têm o gatilho
-- `fn_audit_trigger`, que grava antes/depois em `audit_log` a cada UPDATE.
-- Por isso nenhuma função aqui chama `log_action` — seria registro duplicado.

-- ---------------------------------------------------------------------------
-- 1) Lista os atendimentos que a regra classificaria como convênio
-- ---------------------------------------------------------------------------
-- Só devolve o que está marcado "particular" E que a regra
-- `tipo_atendimento_padrao` diz que deveria ser "convenio" — ou seja, contrato
-- ativo e sem mensalidade vencida além da tolerância. Quem está em atraso não
-- aparece na lista.
--
-- O filtro por data existe porque relabelar um atendimento antigo muda os
-- relatórios de um mês que a clínica talvez já tenha fechado. A tela começa
-- por um período curto e quem revisa decide se quer ir mais para trás.
CREATE OR REPLACE FUNCTION public.listar_atendimentos_convenio_pendentes(
  _clinica_ids uuid[],
  _de date DEFAULT NULL,
  _ate date DEFAULT NULL,
  _limite int DEFAULT 500
)
RETURNS TABLE (
  id uuid,
  clinica_id uuid,
  paciente_id uuid,
  paciente_nome text,
  inicio timestamptz,
  procedimento text,
  status text,
  medico_nome text,
  convenio_nome text,
  contrato_numero int,
  ja_pago boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH permitidas AS (
    -- Só as clínicas pedidas em que quem chamou tem leitura no módulo.
    SELECT c.id
    FROM public.clinicas c
    WHERE c.id = ANY(_clinica_ids)
      AND public.has_module_access(auth.uid(), c.id, 'revisao-convenio', 'read')
  ),
  cobertos AS (
    -- Pacientes com contrato ativo, como titular ou como dependente ativo.
    -- Serve só para reduzir o conjunto antes de chamar a regra linha a linha.
    SELECT c.paciente_id AS pid, c.clinica_id, c.id AS contrato_id
    FROM public.contratos_assinatura c
    WHERE c.status = 'ativo' AND c.clinica_id IN (SELECT id FROM permitidas)
    UNION
    SELECT d.paciente_id, c.clinica_id, c.id
    FROM public.contrato_dependentes d
    JOIN public.contratos_assinatura c ON c.id = d.contrato_id
    WHERE d.ativo AND d.paciente_id IS NOT NULL
      AND c.status = 'ativo' AND c.clinica_id IN (SELECT id FROM permitidas)
  )
  SELECT
    a.id,
    a.clinica_id,
    a.paciente_id,
    a.paciente_nome,
    a.inicio,
    a.procedimento,
    a.status::text,
    m.nome,
    COALESCE(cv.nome, 'Sem convênio vinculado'),
    ct.numero,
    (a.data_pagamento IS NOT NULL)
  FROM public.agendamentos a
  JOIN cobertos k ON k.pid = a.paciente_id AND k.clinica_id = a.clinica_id
  JOIN public.contratos_assinatura ct ON ct.id = k.contrato_id
  LEFT JOIN public.cb_convenios cv ON cv.id = ct.convenio_id
  LEFT JOIN public.medicos m ON m.id = a.medico_id
  WHERE a.tipo_atendimento = 'particular'
    AND a.paciente_id IS NOT NULL
    AND upper(a.paciente_nome) <> 'DISPONIVEL'
    AND a.status <> 'cancelado'
    AND (_de IS NULL OR a.inicio >= _de::timestamptz)
    AND (_ate IS NULL OR a.inicio < (_ate + 1)::timestamptz)
    -- A regra é a autoridade: contrato em atraso não entra na lista.
    AND public.tipo_atendimento_padrao(a.clinica_id, a.paciente_id) = 'convenio'
  ORDER BY a.inicio DESC
  LIMIT GREATEST(1, LEAST(COALESCE(_limite, 500), 2000));
$function$;

REVOKE ALL ON FUNCTION public.listar_atendimentos_convenio_pendentes(uuid[], date, date, int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.listar_atendimentos_convenio_pendentes(uuid[], date, date, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.listar_atendimentos_convenio_pendentes(uuid[], date, date, int) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2) Aplica "Convênio" nos atendimentos escolhidos
-- ---------------------------------------------------------------------------
-- Revalida CADA id no servidor antes de gravar. A lista que a tela tem em mãos
-- pode estar velha — o paciente pode ter ficado inadimplente, o contrato pode
-- ter sido cancelado, outro atendente pode já ter corrigido. Ids que não
-- passam na regra são ignorados em silêncio e contabilizados no retorno, em
-- vez de derrubar o lote inteiro.
--
-- Não usa `tipo_atendimento_padrao` como valor: só grava 'convenio' quando a
-- regra confirma 'convenio'. Nunca reclassifica de convênio para particular —
-- esta tela existe para corrigir num sentido só.
CREATE OR REPLACE FUNCTION public.aplicar_tipo_convenio_lote(_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_atualizados int := 0;
  v_ignorados   int := 0;
  v_sem_acesso  int := 0;
  v_ag          record;
BEGIN
  IF _ids IS NULL OR array_length(_ids, 1) IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'atualizados', 0, 'ignorados', 0, 'sem_acesso', 0);
  END IF;

  -- Teto por chamada: mantém a transação curta e o retorno legível na tela.
  IF array_length(_ids, 1) > 500 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'LOTE_MUITO_GRANDE',
      'mensagem', 'Selecione no máximo 500 atendimentos por vez.');
  END IF;

  FOR v_ag IN
    SELECT a.id, a.clinica_id, a.paciente_id, a.tipo_atendimento
    FROM public.agendamentos a
    WHERE a.id = ANY(_ids)
    FOR UPDATE
  LOOP
    IF NOT public.has_module_access(auth.uid(), v_ag.clinica_id, 'revisao-convenio', 'write') THEN
      v_sem_acesso := v_sem_acesso + 1;
      CONTINUE;
    END IF;

    IF v_ag.tipo_atendimento <> 'particular'
       OR v_ag.paciente_id IS NULL
       OR public.tipo_atendimento_padrao(v_ag.clinica_id, v_ag.paciente_id) <> 'convenio' THEN
      v_ignorados := v_ignorados + 1;
      CONTINUE;
    END IF;

    UPDATE public.agendamentos
       SET tipo_atendimento = 'convenio'
     WHERE id = v_ag.id;

    v_atualizados := v_atualizados + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true,
    'atualizados', v_atualizados, 'ignorados', v_ignorados, 'sem_acesso', v_sem_acesso);
END;
$function$;

REVOKE ALL ON FUNCTION public.aplicar_tipo_convenio_lote(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.aplicar_tipo_convenio_lote(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.aplicar_tipo_convenio_lote(uuid[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3) Lista os contratos ativos sem convênio vinculado
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_contratos_sem_convenio(_clinica_ids uuid[])
RETURNS TABLE (
  id uuid,
  clinica_id uuid,
  numero int,
  paciente_id uuid,
  paciente_nome text,
  data_inicio date,
  valor_mensal numeric,
  qtd_dependentes bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT c.id, c.clinica_id, c.numero, c.paciente_id, c.paciente_nome,
         c.data_inicio, c.valor_mensal,
         (SELECT count(*) FROM public.contrato_dependentes d
           WHERE d.contrato_id = c.id AND d.ativo)
  FROM public.contratos_assinatura c
  WHERE c.clinica_id = ANY(_clinica_ids)
    AND c.status = 'ativo'
    AND c.convenio_id IS NULL
    AND public.has_module_access(auth.uid(), c.clinica_id, 'revisao-convenio', 'read')
  ORDER BY c.data_inicio DESC, c.numero DESC;
$function$;

REVOKE ALL ON FUNCTION public.listar_contratos_sem_convenio(uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.listar_contratos_sem_convenio(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.listar_contratos_sem_convenio(uuid[]) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4) Vincula o convênio a um contrato
-- ---------------------------------------------------------------------------
-- Só preenche quando está vazio. Trocar o convênio de um contrato que já tem um
-- muda preço e repasse retroativamente, e não é o que esta tela se propõe a
-- fazer — para isso existe a tela de Contratos.
--
-- NÃO confundir com `trocar_convenio_contrato`, que já existe e faz coisa
-- MUITO diferente: aquela CANCELA o contrato atual, cria um contrato novo com
-- outro número, cancela as mensalidades pendentes, regera 12 parcelas pelo
-- valor padrão do convênio, remigra os dependentes e grava uma linha em
-- `contrato_renovacoes` como 'troca_convenio'. Aplicá-la aos 245 contratos
-- incompletos destruiria contratos válidos de clientes pagantes e poderia
-- alterar a mensalidade acordada com cada um.
--
-- Aqui o contrato está correto — só falta um campo de cadastro. Por isso esta
-- função faz um UPDATE de uma coluna e nada mais, e recusa qualquer contrato
-- que já tenha convênio, justamente para não virar um atalho para a troca.
CREATE OR REPLACE FUNCTION public.vincular_convenio_contrato(
  _contrato_id uuid,
  _convenio_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contrato record;
  v_conv_clinica uuid;
BEGIN
  SELECT c.id, c.clinica_id, c.convenio_id, c.status
    INTO v_contrato
  FROM public.contratos_assinatura c
  WHERE c.id = _contrato_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CONTRATO_NAO_ENCONTRADO');
  END IF;

  IF NOT public.has_module_access(auth.uid(), v_contrato.clinica_id, 'revisao-convenio', 'write') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SEM_ACESSO');
  END IF;

  IF v_contrato.convenio_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'JA_VINCULADO',
      'mensagem', 'Este contrato já tem convênio. Para trocar, use a tela de Contratos.');
  END IF;

  IF v_contrato.status <> 'ativo' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CONTRATO_INATIVO');
  END IF;

  SELECT cv.clinica_id INTO v_conv_clinica
  FROM public.cb_convenios cv
  WHERE cv.id = _convenio_id AND cv.ativo;

  IF v_conv_clinica IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CONVENIO_INVALIDO');
  END IF;

  -- Convênio de outra clínica no contrato produziria preço e repasse errados.
  IF v_conv_clinica <> v_contrato.clinica_id THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CONVENIO_DE_OUTRA_CLINICA');
  END IF;

  UPDATE public.contratos_assinatura
     SET convenio_id = _convenio_id
   WHERE id = _contrato_id;

  RETURN jsonb_build_object('ok', true, 'codigo', 'OK');
END;
$function$;

REVOKE ALL ON FUNCTION public.vincular_convenio_contrato(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.vincular_convenio_contrato(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.vincular_convenio_contrato(uuid, uuid) TO authenticated, service_role;

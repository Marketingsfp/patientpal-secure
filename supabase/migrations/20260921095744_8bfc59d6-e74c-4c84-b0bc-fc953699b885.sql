-- ============================================================================
-- Cartão Terapêutico: separação de VISÃO e PERMISSÃO do Cartão Benefícios.
-- Não cria tabelas, não altera contratos, parcelas, preços nem regras.
-- ============================================================================

-- 1) Marca do produto no convênio ------------------------------------------
ALTER TABLE public.cb_convenios
  ADD COLUMN IF NOT EXISTS produto text NOT NULL DEFAULT 'beneficios';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.cb_convenios'::regclass AND conname = 'cb_convenios_produto_check'
  ) THEN
    ALTER TABLE public.cb_convenios
      ADD CONSTRAINT cb_convenios_produto_check CHECK (produto IN ('beneficios','terapeutico'));
  END IF;
END $$;

UPDATE public.cb_convenios SET produto = 'terapeutico'
 WHERE nome ILIKE '%terap%' AND produto <> 'terapeutico';

-- 2) Permissão nova espelhando a do Cartão Benefícios -----------------------
INSERT INTO public.perfil_permissoes (perfil_id, modulo, acesso)
SELECT pp.perfil_id, 'cartao-terapeutico', pp.acesso
  FROM public.perfil_permissoes pp
 WHERE pp.modulo = 'cartao-beneficios'
ON CONFLICT DO NOTHING;

INSERT INTO public.usuario_permissoes (user_id, clinica_id, modulo, acesso)
SELECT up.user_id, up.clinica_id, 'cartao-terapeutico', up.acesso
  FROM public.usuario_permissoes up
 WHERE up.modulo = 'cartao-beneficios'
ON CONFLICT DO NOTHING;

-- 3) RLS de escrita: mesmo corpo de hoje, array com o módulo novo -----------
DROP POLICY IF EXISTS contratos_assinatura_insert_roles ON public.contratos_assinatura;
CREATE POLICY contratos_assinatura_insert_roles
  ON public.contratos_assinatura FOR INSERT TO authenticated
  WITH CHECK (public.pode_escrever_modulo(auth.uid(), clinica_id,
    ARRAY['cartao-beneficios','cartao-terapeutico','contratos']));

DROP POLICY IF EXISTS contratos_assinatura_update_roles ON public.contratos_assinatura;
CREATE POLICY contratos_assinatura_update_roles
  ON public.contratos_assinatura FOR UPDATE TO authenticated
  USING (public.pode_escrever_modulo(auth.uid(), clinica_id,
    ARRAY['cartao-beneficios','cartao-terapeutico','contratos']))
  WITH CHECK (public.pode_escrever_modulo(auth.uid(), clinica_id,
    ARRAY['cartao-beneficios','cartao-terapeutico','contratos']));

DROP POLICY IF EXISTS ca_delete ON public.contratos_assinatura;
CREATE POLICY ca_delete
  ON public.contratos_assinatura FOR DELETE TO authenticated
  USING (public.pode_escrever_modulo(auth.uid(), clinica_id,
    ARRAY['cartao-beneficios','cartao-terapeutico','contratos']));

DROP POLICY IF EXISTS contrato_mensalidades_insert_roles ON public.contrato_mensalidades;
CREATE POLICY contrato_mensalidades_insert_roles
  ON public.contrato_mensalidades FOR INSERT TO authenticated
  WITH CHECK (public.pode_escrever_modulo(auth.uid(), clinica_id,
    ARRAY['cartao-beneficios','cartao-terapeutico','contratos']));

DROP POLICY IF EXISTS contrato_mensalidades_update_roles ON public.contrato_mensalidades;
CREATE POLICY contrato_mensalidades_update_roles
  ON public.contrato_mensalidades FOR UPDATE TO authenticated
  USING (public.pode_escrever_modulo(auth.uid(), clinica_id,
    ARRAY['cartao-beneficios','cartao-terapeutico','contratos']))
  WITH CHECK (public.pode_escrever_modulo(auth.uid(), clinica_id,
    ARRAY['cartao-beneficios','cartao-terapeutico','contratos']));

DROP POLICY IF EXISTS cm_delete ON public.contrato_mensalidades;
CREATE POLICY cm_delete
  ON public.contrato_mensalidades FOR DELETE TO authenticated
  USING (public.pode_escrever_modulo(auth.uid(), clinica_id,
    ARRAY['cartao-beneficios','cartao-terapeutico','contratos']));

DROP POLICY IF EXISTS "Perfis com edicao criam convenios" ON public.cb_convenios;
CREATE POLICY "Perfis com edicao criam convenios"
  ON public.cb_convenios FOR INSERT TO authenticated
  WITH CHECK (public.pode_escrever_modulo(auth.uid(), clinica_id,
    ARRAY['cartao-beneficios','cartao-terapeutico']));

DROP POLICY IF EXISTS "Perfis com edicao atualizam convenios" ON public.cb_convenios;
CREATE POLICY "Perfis com edicao atualizam convenios"
  ON public.cb_convenios FOR UPDATE TO authenticated
  USING (public.pode_escrever_modulo(auth.uid(), clinica_id,
    ARRAY['cartao-beneficios','cartao-terapeutico']))
  WITH CHECK (public.pode_escrever_modulo(auth.uid(), clinica_id,
    ARRAY['cartao-beneficios','cartao-terapeutico']));

DROP POLICY IF EXISTS "Perfis com edicao excluem convenios" ON public.cb_convenios;
CREATE POLICY "Perfis com edicao excluem convenios"
  ON public.cb_convenios FOR DELETE TO authenticated
  USING (public.pode_escrever_modulo(auth.uid(), clinica_id,
    ARRAY['cartao-beneficios','cartao-terapeutico']));

DROP POLICY IF EXISTS "Perfis com edicao inserem faixas" ON public.cb_convenio_faixas;
CREATE POLICY "Perfis com edicao inserem faixas"
  ON public.cb_convenio_faixas FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.cb_convenios c
     WHERE c.id = cb_convenio_faixas.convenio_id
       AND public.pode_escrever_modulo(auth.uid(), c.clinica_id,
             ARRAY['cartao-beneficios','cartao-terapeutico'])));

DROP POLICY IF EXISTS "Perfis com edicao atualizam faixas" ON public.cb_convenio_faixas;
CREATE POLICY "Perfis com edicao atualizam faixas"
  ON public.cb_convenio_faixas FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cb_convenios c
     WHERE c.id = cb_convenio_faixas.convenio_id
       AND public.pode_escrever_modulo(auth.uid(), c.clinica_id,
             ARRAY['cartao-beneficios','cartao-terapeutico'])))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.cb_convenios c
     WHERE c.id = cb_convenio_faixas.convenio_id
       AND public.pode_escrever_modulo(auth.uid(), c.clinica_id,
             ARRAY['cartao-beneficios','cartao-terapeutico'])));

DROP POLICY IF EXISTS "Perfis com edicao excluem faixas" ON public.cb_convenio_faixas;
CREATE POLICY "Perfis com edicao excluem faixas"
  ON public.cb_convenio_faixas FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.cb_convenios c
     WHERE c.id = cb_convenio_faixas.convenio_id
       AND public.pode_escrever_modulo(auth.uid(), c.clinica_id,
             ARRAY['cartao-beneficios','cartao-terapeutico'])));

-- 4) Funções de estorno / troca de parcela: corpo idêntico, array novo ------
CREATE OR REPLACE FUNCTION public.estornar_lancamento_receita(_lancamento_id uuid, _clinica_id uuid, _devolucao_agora boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_lanc record; v_atd_repasse_pago boolean; v_ag_id uuid; v_mens_id uuid;
  v_uid uuid := auth.uid();
  v_dev boolean := coalesce(_devolucao_agora, false);
  v_autorizado boolean;
  v_e_mensalidade boolean;
  v_sem_destino boolean;
  v_usou_devolvedor boolean;
  v_usou_registro boolean;
  v_nome_devolvedor text;
  v_aviso text := null;
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.contrato_mensalidades where lancamento_id = _lancamento_id
  ) into v_e_mensalidade;

  v_autorizado := public.pode_escrever_modulo(
    v_uid,
    _clinica_id,
    case when v_e_mensalidade
      then ARRAY['cartao-beneficios', 'cartao-terapeutico', 'contratos', 'financeiro', 'financeiro-estorno']
      else ARRAY['financeiro', 'financeiro-estorno']
    end
  );

  if not v_autorizado then
    raise exception 'Sem permissão para estornar nesta clínica' using errcode = '42501';
  end if;

  select id, agendamento_id, valor, descricao, repasse_pago, clinica_id into v_lanc
  from fin_lancamentos where id = _lancamento_id for update;
  if v_lanc.id is null then
    return jsonb_build_object('ok', true, 'motivo', 'nao_encontrado');
  end if;

  if v_lanc.clinica_id is distinct from _clinica_id then
    raise exception 'Lançamento não pertence à clínica informada' using errcode = '42501';
  end if;

  select repasse_pago into v_atd_repasse_pago from fin_atendimentos where lancamento_id = _lancamento_id limit 1;

  if coalesce(v_atd_repasse_pago, false) or coalesce(v_lanc.repasse_pago, false) then
    return jsonb_build_object('ok', false, 'motivo', 'repasse_pago',
      'mensagem', 'Repasse já pago — estorne o pagamento do repasse primeiro.');
  end if;

  select coalesce(bool_or(d.origem = 'sem_destino'), false),
         coalesce(bool_or(d.origem = 'caixa_de_quem_devolveu'), false),
         coalesce(bool_or(d.tipo_mov = 'registro'), false)
    into v_sem_destino, v_usou_devolvedor, v_usou_registro
    from public.estorno_receita_destinos(v_lanc.id, v_uid, v_dev) d;

  if v_sem_destino then
    select p.nome into v_nome_devolvedor
      from profiles p
     where p.id = coalesce(
       (select es.solicitado_por from estorno_solicitacoes es
         where es.lancamento_id = v_lanc.id and es.status = 'pendente'
         order by es.solicitado_em desc limit 1),
       v_uid);
    return jsonb_build_object('ok', false, 'motivo', 'sem_sessao_aberta',
      'mensagem', 'O caixa deste pagamento já foi fechado. Para registrar a devolução ao paciente, '
        || coalesce(v_nome_devolvedor, 'quem vai devolver o valor')
        || ' precisa estar com o caixa aberto — a saída sai da gaveta de quem devolve.');
  end if;

  if v_usou_devolvedor then
    v_aviso := 'lancado_no_caixa_de_quem_devolveu';
  elsif v_usou_registro then
    v_aviso := 'registrado_sem_mexer_na_gaveta';
  end if;

  update fin_lancamentos set status = 'cancelado' where id = v_lanc.id;

  insert into caixa_movimentos (sessao_id, clinica_id, user_id, tipo, valor, descricao, forma_pagamento, lancamento_id)
  select d.sessao_destino, d.clinica_id, d.dono_destino, d.tipo_mov::public.caixa_mov_tipo, d.valor,
         case when d.tipo_mov = 'registro'
              then trim('Estorno — ' || coalesce(d.descricao, '')
                        || ' — pagamento de dia já fechado, sem devolução (não entra na gaveta)')
              else trim('Estorno — ' || coalesce(d.descricao, '')) end,
         d.forma_pagamento, d.lancamento_id
    from public.estorno_receita_destinos(v_lanc.id, v_uid, v_dev) d
   where d.sessao_destino is not null;

  v_ag_id := v_lanc.agendamento_id;
  if v_ag_id is not null then
    update agendamentos set status = 'agendado', fluxo_etapa = 'aguardando_recepcao', fluxo_atualizado_em = now()
    where id = v_ag_id;
  else
    select id into v_mens_id from contrato_mensalidades where lancamento_id = v_lanc.id limit 1;
    if v_mens_id is not null then
      update contrato_mensalidades set status = 'pendente', pago_em = null, forma_pagamento = null,
        valor_pago = null, lancamento_id = null where id = v_mens_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'agendamento_id', v_ag_id, 'mensalidade_id', v_mens_id,
    'valor', v_lanc.valor, 'aviso', v_aviso);
end; $function$;

CREATE OR REPLACE FUNCTION public.mover_pagamento_mensalidade(_de uuid, _para uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_de   public.contrato_mensalidades%ROWTYPE;
  v_para public.contrato_mensalidades%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING errcode = '42501';
  END IF;
  IF _de = _para THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'Escolha uma parcela diferente.');
  END IF;

  SELECT * INTO v_de   FROM public.contrato_mensalidades WHERE id = _de   FOR UPDATE;
  SELECT * INTO v_para FROM public.contrato_mensalidades WHERE id = _para FOR UPDATE;
  IF v_de.id IS NULL OR v_para.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'Parcela não encontrada.');
  END IF;
  IF v_de.contrato_id IS DISTINCT FROM v_para.contrato_id THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'As duas parcelas precisam ser do mesmo contrato.');
  END IF;
  IF NOT public.pode_escrever_modulo(v_uid, v_de.clinica_id,
       ARRAY['cartao-beneficios', 'cartao-terapeutico', 'contratos', 'financeiro']) THEN
    RAISE EXCEPTION 'Sem permissão para alterar parcelas nesta clínica' USING errcode = '42501';
  END IF;
  IF v_de.status <> 'pago' THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'A parcela de origem não está paga.');
  END IF;
  IF v_para.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'A parcela de destino precisa estar em aberto.');
  END IF;

  UPDATE public.contrato_mensalidades
     SET status = 'pendente', pago_em = NULL, forma_pagamento = NULL,
         valor_pago = NULL, lancamento_id = NULL
   WHERE id = v_de.id;

  UPDATE public.contrato_mensalidades
     SET status = 'pago', pago_em = v_de.pago_em, forma_pagamento = v_de.forma_pagamento,
         valor_pago = v_de.valor_pago, lancamento_id = v_de.lancamento_id
   WHERE id = v_para.id;

  RETURN jsonb_build_object('ok', true,
    'parcela_origem', v_de.numero_parcela, 'parcela_destino', v_para.numero_parcela);
END;
$function$;

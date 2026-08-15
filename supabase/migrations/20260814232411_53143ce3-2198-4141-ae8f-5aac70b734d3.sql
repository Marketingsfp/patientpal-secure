-- 1) Helper de papéis
CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid, _clinica_id uuid, _roles app_role[])
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinica_memberships
    WHERE user_id = _user_id AND clinica_id = _clinica_id AND ativo = true
      AND role = ANY(_roles)
  )
$$;

-- 2) Financeiro
DROP POLICY IF EXISTS fin_lanc_insert ON public.fin_lancamentos;
CREATE POLICY fin_lanc_insert ON public.fin_lancamentos FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','financeiro','caixa']::app_role[]));
DROP POLICY IF EXISTS fin_lanc_update ON public.fin_lancamentos;
CREATE POLICY fin_lanc_update ON public.fin_lancamentos FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','financeiro','caixa']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','financeiro','caixa']::app_role[]));

-- 3) Pagamentos
DROP POLICY IF EXISTS pag_insert ON public.pagamentos;
CREATE POLICY pag_insert ON public.pagamentos FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','financeiro','caixa','recepcao']::app_role[]));
DROP POLICY IF EXISTS pag_update ON public.pagamentos;
CREATE POLICY pag_update ON public.pagamentos FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','financeiro','caixa','recepcao']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','financeiro','caixa','recepcao']::app_role[]));

-- 4) Prontuários
DROP POLICY IF EXISTS pron_insert ON public.prontuarios;
CREATE POLICY pron_insert ON public.prontuarios FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','medico','enfermeiro']::app_role[]));
DROP POLICY IF EXISTS pron_update ON public.prontuarios;
CREATE POLICY pron_update ON public.prontuarios FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','medico','enfermeiro']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','medico','enfermeiro']::app_role[]));

-- 5) Biometria de pacientes
DROP POLICY IF EXISTS biometria_member_insert ON public.paciente_biometria;
CREATE POLICY biometria_member_insert ON public.paciente_biometria FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','supervisor','recepcao','enfermeiro']::app_role[]));
DROP POLICY IF EXISTS biometria_member_update ON public.paciente_biometria;
CREATE POLICY biometria_member_update ON public.paciente_biometria FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','supervisor','recepcao','enfermeiro']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','supervisor','recepcao','enfermeiro']::app_role[]));

-- 6) Agendamentos (escrita limitada às funções operacionais)
DROP POLICY IF EXISTS agend_insert ON public.agendamentos;
CREATE POLICY agend_insert ON public.agendamentos FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','supervisor','recepcao','caixa','medico','enfermeiro']::app_role[]));
DROP POLICY IF EXISTS agend_update ON public.agendamentos;
CREATE POLICY agend_update ON public.agendamentos FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','supervisor','recepcao','caixa','medico','enfermeiro']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor','supervisor','recepcao','caixa','medico','enfermeiro']::app_role[]));

-- 7) RH: contratos (salário/CPF) explicitamente admin/gestor
DROP POLICY IF EXISTS hr_contr_mutate ON public.hr_contratos;
CREATE POLICY hr_contr_mutate ON public.hr_contratos FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), clinica_id, ARRAY['admin','gestor']::app_role[]));

-- 8) Totem público: não expor médico/procedimento nem nome completo
CREATE OR REPLACE FUNCTION public.totem_checkin_cpf(_clinica_id uuid, _cpf text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_cpf text := regexp_replace(coalesce(_cpf, ''), '\D', '', 'g');
  v_pac record;
  v_ag record;
  v_moveu boolean := false;
begin
  if _clinica_id is null then
    return jsonb_build_object('ok', false, 'erro', 'Clínica não informada');
  end if;
  if length(v_cpf) <> 11 then
    return jsonb_build_object('ok', false, 'erro', 'CPF inválido');
  end if;

  select id, nome into v_pac
    from pacientes
   where clinica_id = _clinica_id
     and (cpf_digits = v_cpf or regexp_replace(coalesce(cpf, ''), '\D', '', 'g') = v_cpf)
   limit 1;
  if v_pac is null then
    return jsonb_build_object('ok', false, 'erro', 'Paciente não encontrado. Procure a recepção.');
  end if;

  select a.id, a.inicio, a.fluxo_etapa
    into v_ag
    from agendamentos a
   where a.clinica_id = _clinica_id
     and a.paciente_id = v_pac.id
     and (a.inicio at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date
     and a.status <> 'cancelado'
   order by a.inicio
   limit 1;
  if v_ag is null then
    return jsonb_build_object('ok', false, 'erro', 'Sem agendamento para hoje. Procure a recepção.');
  end if;

  if v_ag.fluxo_etapa is distinct from 'triagem' and v_ag.fluxo_etapa is distinct from 'atendimento' then
    update agendamentos
       set fluxo_etapa = 'recepcao', fluxo_atualizado_em = now()
     where id = v_ag.id;
    v_moveu := true;
  end if;

  if v_moveu then
    begin
      insert into public.agendamento_historico_notas
        (clinica_id, agendamento_id, user_email, user_nome, texto)
      values
        (_clinica_id, v_ag.id, null, 'Totem',
         'Check-in realizado pelo Totem (CPF)');
    exception when others then null;
    end;
  end if;

  -- Privacidade: devolve apenas o primeiro nome e o horário. Médico e
  -- procedimento (dado de saúde) não são expostos no totem público.
  return jsonb_build_object(
    'ok', true,
    'paciente_nome', split_part(trim(v_pac.nome), ' ', 1),
    'inicio', v_ag.inicio,
    'medico', null,
    'procedimento', null
  );
end;
$function$;
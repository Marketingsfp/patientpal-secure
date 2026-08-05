
CREATE OR REPLACE FUNCTION public.checkin_agendamento(_token text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_ag record; v_moveu boolean := false;
BEGIN
  SELECT id, clinica_id, paciente_nome, inicio, procedimento, status, fluxo_etapa
    INTO v_ag FROM public.agendamentos
   WHERE token_publico = _token LIMIT 1;
  IF v_ag IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Token invalido');
  END IF;
  IF v_ag.fluxo_etapa IS DISTINCT FROM 'recepcao'
     AND v_ag.fluxo_etapa IS DISTINCT FROM 'triagem'
     AND v_ag.fluxo_etapa IS DISTINCT FROM 'atendimento' THEN
    UPDATE public.agendamentos
       SET fluxo_etapa = 'recepcao', fluxo_atualizado_em = now()
     WHERE id = v_ag.id;
    v_moveu := true;
  END IF;
  IF v_moveu THEN
    BEGIN
      INSERT INTO public.agendamento_historico_notas
        (clinica_id, agendamento_id, user_email, user_nome, texto)
      VALUES
        (v_ag.clinica_id, v_ag.id, NULL, 'Autoatendimento',
         'Check-in realizado pelo link do comprovante');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN jsonb_build_object('ok', true, 'paciente', v_ag.paciente_nome,
                            'inicio', v_ag.inicio, 'procedimento', v_ag.procedimento);
END; $function$;

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

  select a.id, a.inicio, a.procedimento, a.fluxo_etapa, m.nome as medico_nome
    into v_ag
    from agendamentos a
    left join medicos m on m.id = a.medico_id
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

  return jsonb_build_object(
    'ok', true,
    'paciente_nome', v_pac.nome,
    'inicio', v_ag.inicio,
    'medico', v_ag.medico_nome,
    'procedimento', v_ag.procedimento
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.totem_checkin_paciente(_clinica_id uuid, _paciente_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_pac record;
  v_ag record;
  v_moveu boolean := false;
begin
  if _clinica_id is null or _paciente_id is null then
    return jsonb_build_object('ok', false, 'erro', 'Dados incompletos');
  end if;

  select id, nome into v_pac
    from pacientes
   where clinica_id = _clinica_id and id = _paciente_id
   limit 1;
  if v_pac is null then
    return jsonb_build_object('ok', false, 'erro', 'Paciente não encontrado. Procure a recepção.');
  end if;

  select a.id, a.inicio, a.procedimento, a.fluxo_etapa, m.nome as medico_nome
    into v_ag
    from agendamentos a
    left join medicos m on m.id = a.medico_id
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
         'Check-in realizado pelo Totem (reconhecimento facial)');
    exception when others then null;
    end;
  end if;

  return jsonb_build_object(
    'ok', true,
    'paciente_nome', v_pac.nome,
    'inicio', v_ag.inicio,
    'medico', v_ag.medico_nome,
    'procedimento', v_ag.procedimento
  );
end;
$function$;

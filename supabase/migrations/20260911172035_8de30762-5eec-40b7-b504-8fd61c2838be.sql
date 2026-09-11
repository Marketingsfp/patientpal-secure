-- Painel público: deixa de devolver o id interno do paciente.
DROP FUNCTION IF EXISTS public.painel_senhas_publicas(uuid);
CREATE FUNCTION public.painel_senhas_publicas(_clinica_id uuid)
 RETURNS TABLE(id uuid, codigo text, tipo text, status text, guiche text, chamada_em timestamp with time zone, paciente_nome text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.id,
    s.codigo,
    s.tipo::text,
    s.status::text,
    s.guiche,
    s.chamada_em,
    -- Nome completo, sem abreviação (regra oficial da clínica).
    -- O id do paciente NÃO sai daqui: esta função é pública (sem login) e o
    -- id permitiria consultar dado de saúde pela função do totem.
    NULLIF(btrim(p.nome), '') AS paciente_nome
  FROM public.senhas s
  LEFT JOIN public.pacientes p ON p.id = s.paciente_id
  WHERE s.clinica_id = _clinica_id
    AND s.data_dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date
    AND s.status::text IN ('chamada','atendida')
  ORDER BY s.chamada_em DESC NULLS LAST
  LIMIT 6;
$function$;
REVOKE ALL ON FUNCTION public.painel_senhas_publicas(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.painel_senhas_publicas(uuid) TO anon, authenticated, service_role;

-- Totem por reconhecimento facial: mesma regra do totem por CPF.
-- Devolve só o primeiro nome e nunca médico/procedimento (dado de saúde).
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
         'Check-in realizado pelo Totem (reconhecimento facial)');
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
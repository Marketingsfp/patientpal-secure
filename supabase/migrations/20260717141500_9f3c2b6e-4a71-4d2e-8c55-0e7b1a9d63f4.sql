-- Totem: check-in por reconhecimento facial. O fluxo facial identifica o
-- paciente via totem_match_biometria (que retorna paciente_id) — faltava um
-- jeito de concluir o check-in a partir desse id. Este RPC espelha o
-- totem_checkin_cpf (mesma regra: agendamento de hoje, não cancelado, avança
-- fluxo_etapa para 'recepcao' sem regredir triagem/atendimento), mas chaveado
-- por paciente_id. SECURITY DEFINER + grant para anon porque o totem também
-- roda nas rotas públicas (/totem/$clinicaId e /totem/t/$token), onde o RLS
-- bloquearia consultas diretas.
create or replace function public.totem_checkin_paciente(_clinica_id uuid, _paciente_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_pac record;
  v_ag record;
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

revoke all on function public.totem_checkin_paciente(uuid, uuid) from public;
grant execute on function public.totem_checkin_paciente(uuid, uuid) to anon, authenticated;

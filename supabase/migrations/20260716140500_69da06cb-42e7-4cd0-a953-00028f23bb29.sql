-- Totem: check-in por CPF direto na tela do totem.
-- O totem roda também em rotas públicas (/totem/$clinicaId e /totem/t/$token)
-- sem sessão — o RLS bloqueia consultas diretas a pacientes/agendamentos, então
-- o check-in entra por RPC SECURITY DEFINER (mesmo padrão de emitir_senha,
-- totem_match_biometria e totem_upsert_paciente). Retorna apenas os campos
-- necessários para a tela de confirmação (nome, horário, profissional,
-- procedimento) — nada além do que o próprio paciente informou/verá.
create or replace function public.totem_checkin_cpf(_clinica_id uuid, _cpf text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cpf text := regexp_replace(coalesce(_cpf, ''), '\D', '', 'g');
  v_pac record;
  v_ag record;
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

  -- Mesma regra do autoatendimento logado: check-in não regride quem já
  -- avançou para triagem/atendimento.
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
$$;

revoke all on function public.totem_checkin_cpf(uuid, text) from public;
grant execute on function public.totem_checkin_cpf(uuid, text) to anon, authenticated;

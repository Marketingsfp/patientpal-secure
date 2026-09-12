create or replace function public.fin_pacientes_primeiro_atendimento(_clinica_id uuid, _ids uuid[])
returns table(paciente_id uuid, primeiro date)
language sql
stable
set search_path = public
as $$
  select a.paciente_id, min((a.inicio at time zone 'America/Sao_Paulo')::date) as primeiro
  from public.agendamentos a
  where a.clinica_id = _clinica_id
    and a.paciente_id = any(_ids)
    and coalesce(a.status::text, '') <> 'cancelado'
  group by a.paciente_id
$$;

grant execute on function public.fin_pacientes_primeiro_atendimento(uuid, uuid[]) to authenticated;
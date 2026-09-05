create or replace function public.atend_espera_por_conversa(
  _clinica_id uuid,
  _is_teste boolean default false
)
returns table (conversa_id uuid, aguardando_desde timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  with m as (
    select
      w.conversa_id,
      w.direction,
      coalesce(w.recebida_em, w.created_at) as at,
      max(case when w.direction = 'out' then coalesce(w.recebida_em, w.created_at) end)
        over (partition by w.conversa_id) as ultima_saida
    from public.whatsapp_mensagens w
    join public.atend_conversas c on c.id = w.conversa_id
    where c.clinica_id = _clinica_id
      and coalesce(c.is_teste, false) = _is_teste
      and coalesce(c.status, '') not in ('closed', 'finished')
      and coalesce(w.recebida_em, w.created_at) > now() - interval '7 days'
  )
  select m.conversa_id, min(m.at) as aguardando_desde
  from m
  where m.direction = 'in'
    and (m.ultima_saida is null or m.at > m.ultima_saida)
  group by m.conversa_id;
$$;

grant execute on function public.atend_espera_por_conversa(uuid, boolean) to authenticated;
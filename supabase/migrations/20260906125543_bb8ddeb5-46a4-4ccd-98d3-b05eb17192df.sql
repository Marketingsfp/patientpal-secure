create or replace function public.nina_metricas_operacionais(
  p_clinica uuid,
  p_inicios timestamptz[],
  p_fins timestamptz[],
  p_fuso text default 'America/Sao_Paulo',
  p_granularidade text default 'dia',
  p_incluir_teste boolean default false,
  p_status text default null,
  p_categoria text default null,
  p_root_cause text default null,
  p_prioridade text default null,
  p_unidade uuid default null,
  p_assunto text default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with j as (
  select t.i as inicio, u.f as fim
  from unnest(p_inicios) with ordinality t(i, ord)
  join unnest(p_fins) with ordinality u(f, ord2) on t.ord = u.ord2
),
lim as (select min(inicio) as mi, max(fim) as mf from j),
gran as (
  select case p_granularidade when 'mes' then 'month' when 'semana' then 'week' else 'day' end as g
),
m as (
  select w.id, w.direction, w.enviada_por, w.execucao_id, w.created_at
  from whatsapp_mensagens w, lim
  where w.clinica_id = p_clinica
    and w.created_at >= lim.mi and w.created_at < lim.mf
    and exists (select 1 from j where w.created_at >= j.inicio and w.created_at < j.fim)
    and w.status in ('sent', 'received', 'system')
    and (p_incluir_teste or coalesce(w.is_teste, false) = false)
    and (
      p_incluir_teste
      or not exists (
        select 1 from atend_conversas c
        where c.id = w.conversa_id and coalesce(c.is_teste, false)
      )
    )
),
e as (
  select f.id, wm.created_at as msg_em
  from nina_feedback_erros f
  join whatsapp_mensagens wm on wm.id = f.mensagem_id
  cross join lim
  where f.clinica_id = p_clinica
    and coalesce(f.status, '') <> 'rejected'
    and wm.created_at >= lim.mi and wm.created_at < lim.mf
    and exists (select 1 from j where wm.created_at >= j.inicio and wm.created_at < j.fim)
    and (p_incluir_teste or coalesce(wm.is_teste, false) = false)
    and (p_status is null or f.status = p_status)
    and (p_categoria is null or f.categoria = p_categoria)
    and (p_root_cause is null or f.root_cause = p_root_cause)
    and (p_prioridade is null or f.prioridade = p_prioridade)
    and (p_unidade is null or f.unidade_id = p_unidade)
    and (p_assunto is null or f.grupo_titulo ilike '%' || p_assunto || '%')
),
sem_vinculo as (
  select count(*) as n
  from nina_feedback_erros f, lim
  where f.clinica_id = p_clinica
    and f.mensagem_id is null
    and coalesce(f.status, '') <> 'rejected'
    and f.created_at >= lim.mi and f.created_at < lim.mf
    and exists (select 1 from j where f.created_at >= j.inicio and f.created_at < j.fim)
),
ag as (
  select count(*) as n
  from agendamentos a, lim
  where a.clinica_id = p_clinica
    and a.origem_integracao = any (
      case when p_incluir_teste
        then array['nina_whatsapp', 'nina_chat_interno', 'nina_homologacao']
        else array['nina_whatsapp', 'nina_chat_interno'] end
    )
    and (p_incluir_teste or coalesce(a.is_mock_data, false) = false)
    and a.created_at >= lim.mi and a.created_at < lim.mf
    and exists (select 1 from j where a.created_at >= j.inicio and a.created_at < j.fim)
),
hf as (
  select count(*) as n
  from atend_conversa_eventos ev, lim
  where ev.clinica_id = p_clinica
    and ev.evento = 'HANDOFF_SOLICITADO'
    and coalesce(ev.detalhes ->> 'solicitado_por', 'IA') = 'IA'
    and ev.created_at >= lim.mi and ev.created_at < lim.mf
    and exists (select 1 from j where ev.created_at >= j.inicio and ev.created_at < j.fim)
    and (
      p_incluir_teste
      or not exists (
        select 1 from atend_conversas c
        where c.id = ev.conversa_id and coalesce(c.is_teste, false)
      )
    )
),
cobertura as (
  select min(w.created_at) as desde
  from whatsapp_mensagens w
  where w.clinica_id = p_clinica and w.direction = 'in' and w.execucao_id is not null
),
serie as (
  select to_char(date_trunc((select g from gran), x.em at time zone p_fuso), 'YYYY-MM-DD') as periodo,
         sum(x.msgs) as mensagens,
         sum(x.erros) as erros
  from (
    select m.created_at as em, 1 as msgs, 0 as erros from m
    union all
    select e.msg_em, 0, 1 from e
  ) x
  group by 1
)
select jsonb_build_object(
  'mensagensTotais', (select count(*) from m),
  'msgsPaciente', (select count(*) from m where direction = 'in'),
  'msgsNina', (select count(*) from m where direction = 'out' and enviada_por = 'nina'),
  'msgsHumano', (select count(*) from m where direction = 'out' and enviada_por = 'humano'),
  'msgsAutomaticas', (select count(*) from m where direction = 'out' and coalesce(enviada_por, '') not in ('nina', 'humano')),
  'ninaEntrada', (select count(*) from m where direction = 'in' and execucao_id is not null),
  'ninaSaida', (select count(*) from m where direction = 'out' and enviada_por = 'nina'),
  'errosReportados', (select count(*) from e),
  'errosSemVinculo', (select n from sem_vinculo),
  'agendamentosNina', (select n from ag),
  'encaminhamentos', (select n from hf),
  'entradaMedidaDesde', (select desde from cobertura),
  'serie', coalesce((
    select jsonb_agg(jsonb_build_object('periodo', periodo, 'mensagens', mensagens, 'erros', erros) order by periodo)
    from serie
  ), '[]'::jsonb)
);
$$;

grant execute on function public.nina_metricas_operacionais(uuid, timestamptz[], timestamptz[], text, text, boolean, text, text, text, text, uuid, text) to authenticated;
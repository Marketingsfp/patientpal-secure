create table if not exists public.nina_calendario_atendimento (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  unidade_id uuid references public.unidades(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fim time not null,
  vigencia_inicio date not null default current_date,
  vigencia_fim date,
  ativo boolean not null default true,
  observacao text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nina_cal_intervalo_chk check (hora_fim > hora_inicio),
  constraint nina_cal_vigencia_chk check (vigencia_fim is null or vigencia_fim >= vigencia_inicio)
);
create index if not exists idx_nina_cal_clinica on public.nina_calendario_atendimento (clinica_id, dia_semana, vigencia_inicio);

create table if not exists public.nina_calendario_excecoes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  unidade_id uuid references public.unidades(id) on delete cascade,
  data date not null,
  tipo text not null check (tipo in ('fechado', 'especial')),
  hora_inicio time,
  hora_fim time,
  descricao text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nina_exc_especial_chk check (
    tipo = 'fechado'
    or (hora_inicio is not null and hora_fim is not null and hora_fim > hora_inicio)
  )
);
create index if not exists idx_nina_exc_clinica on public.nina_calendario_excecoes (clinica_id, data);

create table if not exists public.nina_faixas_horarias (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  chave text not null,
  nome text not null,
  hora_inicio time not null,
  hora_fim time not null,
  ordem smallint not null default 0,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nina_faixa_intervalo_chk check (hora_fim > hora_inicio),
  unique (clinica_id, chave)
);

grant select, insert, update, delete on public.nina_calendario_atendimento to authenticated;
grant all on public.nina_calendario_atendimento to service_role;
grant select, insert, update, delete on public.nina_calendario_excecoes to authenticated;
grant all on public.nina_calendario_excecoes to service_role;
grant select, insert, update, delete on public.nina_faixas_horarias to authenticated;
grant all on public.nina_faixas_horarias to service_role;

alter table public.nina_calendario_atendimento enable row level security;
alter table public.nina_calendario_excecoes enable row level security;
alter table public.nina_faixas_horarias enable row level security;

create policy "nina_cal_select" on public.nina_calendario_atendimento
  for select to authenticated using (clinica_id = any (public.clinicas_do_usuario()));
create policy "nina_cal_write" on public.nina_calendario_atendimento
  for all to authenticated using (public.can_manage_clinica(auth.uid(), clinica_id))
  with check (public.can_manage_clinica(auth.uid(), clinica_id));

create policy "nina_exc_select" on public.nina_calendario_excecoes
  for select to authenticated using (clinica_id = any (public.clinicas_do_usuario()));
create policy "nina_exc_write" on public.nina_calendario_excecoes
  for all to authenticated using (public.can_manage_clinica(auth.uid(), clinica_id))
  with check (public.can_manage_clinica(auth.uid(), clinica_id));

create policy "nina_faixa_select" on public.nina_faixas_horarias
  for select to authenticated using (clinica_id = any (public.clinicas_do_usuario()));
create policy "nina_faixa_write" on public.nina_faixas_horarias
  for all to authenticated using (public.can_manage_clinica(auth.uid(), clinica_id))
  with check (public.can_manage_clinica(auth.uid(), clinica_id));

create trigger trg_nina_cal_updated before update on public.nina_calendario_atendimento
  for each row execute function public._touch_updated_at();
create trigger trg_nina_exc_updated before update on public.nina_calendario_excecoes
  for each row execute function public._touch_updated_at();
create trigger trg_nina_faixa_updated before update on public.nina_faixas_horarias
  for each row execute function public._touch_updated_at();

create or replace function public.nina_classificar_atendimento(
  p_clinica uuid,
  p_unidade uuid,
  p_em timestamptz,
  p_fuso text default 'America/Sao_Paulo'
)
returns text
language sql
stable
security invoker
set search_path = public
as $$
with loc as (
  select (p_em at time zone p_fuso) as ts
),
d as (select ts::date as dia, ts::time as hora, extract(dow from ts)::int as dow from loc),
exc as (
  select e.* from nina_calendario_excecoes e, d
  where e.clinica_id = p_clinica
    and e.data = d.dia
    and (e.unidade_id is null or p_unidade is null or e.unidade_id = p_unidade)
),
vig as (
  select c.* from nina_calendario_atendimento c, d
  where c.clinica_id = p_clinica
    and c.ativo
    and c.vigencia_inicio <= d.dia
    and (c.vigencia_fim is null or c.vigencia_fim >= d.dia)
    and (c.unidade_id is null or p_unidade is null or c.unidade_id = p_unidade)
)
select case
  when exists (select 1 from exc where tipo = 'fechado') then 'fora'
  when exists (select 1 from exc where tipo = 'especial') then (
    case when exists (
      select 1 from exc, d
      where exc.tipo = 'especial' and d.hora >= exc.hora_inicio and d.hora < exc.hora_fim
    ) then 'dentro' else 'fora' end
  )
  when not exists (select 1 from vig) then 'nao_classificavel'
  when exists (
    select 1 from vig, d
    where vig.dia_semana = d.dow and d.hora >= vig.hora_inicio and d.hora < vig.hora_fim
  ) then 'dentro'
  else 'fora'
end;
$$;

grant execute on function public.nina_classificar_atendimento(uuid, uuid, timestamptz, text) to authenticated;

create or replace function public.nina_metricas_analise(
  p_clinica uuid,
  p_inicios timestamptz[],
  p_fins timestamptz[],
  p_fuso text default 'America/Sao_Paulo',
  p_granularidade text default 'dia',
  p_incluir_teste boolean default false,
  p_dias_semana int[] default null,
  p_calendario text default 'todos',
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
m0 as (
  select w.id, w.direction, w.enviada_por, w.execucao_id, w.created_at,
         public.nina_classificar_atendimento(p_clinica, p_unidade, w.created_at, p_fuso) as cal
  from whatsapp_mensagens w, lim
  where w.clinica_id = p_clinica
    and w.created_at >= lim.mi and w.created_at < lim.mf
    and exists (select 1 from j where w.created_at >= j.inicio and w.created_at < j.fim)
    and w.status in ('sent', 'received', 'system')
    and (p_dias_semana is null or extract(dow from (w.created_at at time zone p_fuso))::int = any (p_dias_semana))
    and (p_incluir_teste or coalesce(w.is_teste, false) = false)
    and (
      p_incluir_teste
      or not exists (
        select 1 from atend_conversas c
        where c.id = w.conversa_id and coalesce(c.is_teste, false)
      )
    )
),
m as (select * from m0 where p_calendario = 'todos' or cal = p_calendario),
et as (
  select f.id, f.status, f.validacao_status, wm.created_at as msg_em,
         public.nina_classificar_atendimento(p_clinica, coalesce(f.unidade_id, p_unidade), wm.created_at, p_fuso) as cal
  from nina_feedback_erros f
  join whatsapp_mensagens wm on wm.id = f.mensagem_id
  cross join lim
  where f.clinica_id = p_clinica
    and wm.created_at >= lim.mi and wm.created_at < lim.mf
    and exists (select 1 from j where wm.created_at >= j.inicio and wm.created_at < j.fim)
    and (p_dias_semana is null or extract(dow from (wm.created_at at time zone p_fuso))::int = any (p_dias_semana))
    and (p_incluir_teste or coalesce(wm.is_teste, false) = false)
    and (p_status is null or f.status = p_status)
    and (p_categoria is null or f.categoria = p_categoria)
    and (p_root_cause is null or f.root_cause = p_root_cause)
    and (p_prioridade is null or f.prioridade = p_prioridade)
    and (p_unidade is null or f.unidade_id = p_unidade)
    and (p_assunto is null or f.grupo_titulo ilike '%' || p_assunto || '%')
),
ef as (select * from et where p_calendario = 'todos' or cal = p_calendario),
e as (select * from ef where coalesce(status, '') <> 'rejected'),
sem_vinculo as (
  select count(*) as n
  from nina_feedback_erros f, lim
  where f.clinica_id = p_clinica
    and f.mensagem_id is null
    and coalesce(f.status, '') <> 'rejected'
    and f.created_at >= lim.mi and f.created_at < lim.mf
    and exists (select 1 from j where f.created_at >= j.inicio and f.created_at < j.fim)
),
ag0 as (
  select a.id, a.created_at,
         public.nina_classificar_atendimento(p_clinica, p_unidade, a.created_at, p_fuso) as cal
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
    and (p_dias_semana is null or extract(dow from (a.created_at at time zone p_fuso))::int = any (p_dias_semana))
),
ag as (select * from ag0 where p_calendario = 'todos' or cal = p_calendario),
hf0 as (
  select ev.id, ev.created_at,
         public.nina_classificar_atendimento(p_clinica, p_unidade, ev.created_at, p_fuso) as cal
  from atend_conversa_eventos ev, lim
  where ev.clinica_id = p_clinica
    and ev.evento = 'HANDOFF_SOLICITADO'
    and coalesce(ev.detalhes ->> 'solicitado_por', 'IA') = 'IA'
    and ev.created_at >= lim.mi and ev.created_at < lim.mf
    and exists (select 1 from j where ev.created_at >= j.inicio and ev.created_at < j.fim)
    and (p_dias_semana is null or extract(dow from (ev.created_at at time zone p_fuso))::int = any (p_dias_semana))
    and (
      p_incluir_teste
      or not exists (
        select 1 from atend_conversas c
        where c.id = ev.conversa_id and coalesce(c.is_teste, false)
      )
    )
),
hf as (select * from hf0 where p_calendario = 'todos' or cal = p_calendario),
cobertura as (
  select min(w.created_at) as desde
  from whatsapp_mensagens w
  where w.clinica_id = p_clinica and w.direction = 'in' and w.execucao_id is not null
),
calver as (
  select max(greatest(c.updated_at, c.created_at)) as em, count(*) as regras
  from nina_calendario_atendimento c
  where c.clinica_id = p_clinica and c.ativo
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
),
tot as (
  select (select count(*) from m) as msgs, (select count(*) from e) as erros
)
select jsonb_build_object(
  'consultaId', gen_random_uuid(),
  'geradoEm', now(),
  'versaoRegras', 'fase7.1',
  'indicadores', jsonb_build_object(
    'mensagensTotais', (select msgs from tot),
    'msgsPaciente', (select count(*) from m where direction = 'in'),
    'msgsNina', (select count(*) from m where direction = 'out' and enviada_por = 'nina'),
    'msgsHumano', (select count(*) from m where direction = 'out' and enviada_por = 'humano'),
    'msgsAutomaticas', (select count(*) from m where direction = 'out' and coalesce(enviada_por, '') not in ('nina', 'humano')),
    'ninaEntrada', (select count(*) from m where direction = 'in' and execucao_id is not null),
    'ninaSaida', (select count(*) from m where direction = 'out' and enviada_por = 'nina'),
    'ninaParticipacao', (select count(*) from m where (direction = 'in' and execucao_id is not null) or (direction = 'out' and enviada_por = 'nina')),
    'errosReportados', (select erros from tot),
    'errosConfirmados', (select count(*) from e where status in ('approved', 'applied', 'reverted')),
    'errosPendentes', (select count(*) from e where status = 'pending'),
    'errosRejeitados', (select count(*) from ef where status = 'rejected'),
    'correcoesAplicadas', (select count(*) from e where status = 'applied'),
    'correcoesValidadas', (select count(*) from e where validacao_status = 'validado'),
    'correcoesRevertidas', (select count(*) from e where status = 'reverted'),
    'errosSemVinculo', (select n from sem_vinculo),
    'agendamentosNina', (select count(*) from ag),
    'encaminhamentos', (select count(*) from hf)
  ),
  'taxaErro', jsonb_build_object(
    'numerador', (select erros from tot),
    'denominador', (select msgs from tot),
    'valor', case when (select msgs from tot) > 0
                  then round(((select erros from tot)::numeric * 100) / (select msgs from tot), 4)
                  else null end,
    'formula', 'erros reportados da Nina ÷ mensagens totais do sistema × 100',
    'observacao', 'Não representa acurácia da Nina; 100 menos esta taxa não é índice de acerto.'
  ),
  'calendario', jsonb_build_object(
    'modo', p_calendario,
    'regrasVigentes', (select regras from calver),
    'versao', (select em from calver),
    'naoClassificavel', jsonb_build_object(
      'mensagens', (select count(*) from m0 where cal = 'nao_classificavel'),
      'erros', (select count(*) from et where cal = 'nao_classificavel'),
      'agendamentos', (select count(*) from ag0 where cal = 'nao_classificavel'),
      'encaminhamentos', (select count(*) from hf0 where cal = 'nao_classificavel')
    )
  ),
  'filtros', jsonb_build_object(
    'clinicaId', p_clinica,
    'fuso', p_fuso,
    'janelas', (select count(*) from j),
    'inicio', (select mi from lim),
    'fim', (select mf from lim),
    'granularidade', p_granularidade,
    'diasSemana', to_jsonb(p_dias_semana),
    'ambiente', case when p_incluir_teste then 'todos' else 'producao' end,
    'unidadeId', p_unidade,
    'status', p_status,
    'categoria', p_categoria,
    'rootCause', p_root_cause,
    'prioridade', p_prioridade,
    'assunto', p_assunto
  ),
  'cobertura', jsonb_build_object(
    'entradaMedidaDesde', (select desde from cobertura),
    'limitacoes', jsonb_build_array(
      'Mensagens recebidas e processadas pela Nina só são contadas a partir da data de entradaMedidaDesde.',
      'Unidade só existe nos erros reportados; mensagens, agendamentos e encaminhamentos não têm unidade registrada.',
      'Sem calendário vigente na data, o trecho é contado como não classificável e nunca como fora do horário.'
    )
  ),
  'serie', coalesce((
    select jsonb_agg(jsonb_build_object('periodo', periodo, 'mensagens', mensagens, 'erros', erros) order by periodo)
    from serie
  ), '[]'::jsonb)
);
$$;

grant execute on function public.nina_metricas_analise(uuid, timestamptz[], timestamptz[], text, text, boolean, int[], text, text, text, text, text, uuid, text) to authenticated;
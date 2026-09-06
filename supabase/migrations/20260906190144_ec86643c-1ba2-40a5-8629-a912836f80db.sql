create table if not exists public.nina_calendario_versoes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  unidade_id uuid references public.unidades(id) on delete cascade,
  versao integer not null,
  status text not null default 'rascunho' check (status in ('rascunho','publicado','substituido')),
  fuso text not null default 'America/Sao_Paulo',
  vigencia_inicio date not null,
  vigencia_fim date,
  publicado_em timestamptz,
  publicado_por uuid,
  retroativa boolean not null default false,
  motivo_retroativo text,
  observacao text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nina_ver_vigencia_chk check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  constraint nina_ver_publicado_chk check (
    status = 'rascunho' or (publicado_em is not null and publicado_por is not null)
  ),
  constraint nina_ver_retro_chk check (
    retroativa = false or (motivo_retroativo is not null and length(btrim(motivo_retroativo)) >= 5)
  )
);

create unique index if not exists uq_nina_ver_num
  on public.nina_calendario_versoes (clinica_id, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid), versao);
create index if not exists idx_nina_ver_escopo
  on public.nina_calendario_versoes (clinica_id, unidade_id, status, vigencia_inicio);

grant select, insert, update, delete on public.nina_calendario_versoes to authenticated;
grant all on public.nina_calendario_versoes to service_role;

alter table public.nina_calendario_versoes enable row level security;

create policy "nina_ver_select" on public.nina_calendario_versoes
  for select to authenticated using (clinica_id = any (public.clinicas_do_usuario()));
create policy "nina_ver_write" on public.nina_calendario_versoes
  for all to authenticated using (public.can_manage_clinica(auth.uid(), clinica_id))
  with check (public.can_manage_clinica(auth.uid(), clinica_id));

create trigger trg_nina_ver_updated before update on public.nina_calendario_versoes
  for each row execute function public._touch_updated_at();

-- Vínculo dos dias e exceções com a versão
alter table public.nina_calendario_atendimento
  add column if not exists versao_id uuid references public.nina_calendario_versoes(id) on delete cascade;
alter table public.nina_calendario_excecoes
  add column if not exists versao_id uuid references public.nina_calendario_versoes(id) on delete cascade;

create index if not exists idx_nina_cal_versao on public.nina_calendario_atendimento (versao_id);
create index if not exists idx_nina_exc_versao on public.nina_calendario_excecoes (versao_id);

-- Validação de faixas: agora dentro da própria versão (rascunho isolado)
create or replace function public.nina_cal_validar()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.fechado then
    if exists (
      select 1 from public.nina_calendario_atendimento c
       where c.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
         and c.clinica_id = new.clinica_id
         and c.dia_semana = new.dia_semana
         and c.ativo and new.ativo
         and c.unidade_id is not distinct from new.unidade_id
         and c.versao_id is not distinct from new.versao_id
    ) then
      raise exception 'Este dia já tem faixas cadastradas nesta versão. Remova as faixas antes de marcar o dia como fechado.';
    end if;
    return new;
  end if;

  if new.hora_fim <= new.hora_inicio then
    raise exception 'A faixa deve terminar depois de começar. Faixas que passam da meia-noite não são aceitas: cadastre duas faixas (uma até 23:59 e outra a partir de 00:00).';
  end if;

  if exists (
    select 1 from public.nina_calendario_atendimento c
     where c.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
       and c.clinica_id = new.clinica_id
       and c.dia_semana = new.dia_semana
       and c.ativo and new.ativo
       and c.unidade_id is not distinct from new.unidade_id
       and c.versao_id is not distinct from new.versao_id
       and (c.fechado or (c.hora_inicio < new.hora_fim and new.hora_inicio < c.hora_fim))
  ) then
    raise exception 'Esta faixa se sobrepõe a outra já cadastrada (ou ao dia marcado como fechado) nesta versão.';
  end if;

  return new;
end;
$$;

-- Exceção duplicada agora é por versão
drop index if exists public.uq_nina_exc_data;
create unique index if not exists uq_nina_exc_data
  on public.nina_calendario_excecoes (
    coalesce(versao_id, '00000000-0000-0000-0000-000000000000'::uuid),
    clinica_id,
    coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid),
    data
  );

-- Versão publicada é imutável
create or replace function public.nina_cal_bloquear_publicado()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_status text;
  v_id uuid;
begin
  v_id := coalesce(new.versao_id, old.versao_id);
  if v_id is null then return coalesce(new, old); end if;
  select status into v_status from public.nina_calendario_versoes where id = v_id;
  if v_status is not null and v_status <> 'rascunho' then
    raise exception 'Esta versão do horário já foi publicada e não pode ser alterada. Crie uma nova versão.';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_nina_cal_bloq on public.nina_calendario_atendimento;
create trigger trg_nina_cal_bloq before insert or update or delete on public.nina_calendario_atendimento
  for each row execute function public.nina_cal_bloquear_publicado();
drop trigger if exists trg_nina_exc_bloq on public.nina_calendario_excecoes;
create trigger trg_nina_exc_bloq before insert or update or delete on public.nina_calendario_excecoes
  for each row execute function public.nina_cal_bloquear_publicado();

create or replace function public.nina_ver_bloquear_publicada()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'rascunho' then
      raise exception 'Uma versão publicada do horário não pode ser excluída — ela é o histórico oficial.';
    end if;
    return old;
  end if;
  if old.status <> 'rascunho' then
    -- Só é permitido encerrar a vigência (substituição) e mudar o status para substituido.
    if new.clinica_id is distinct from old.clinica_id
       or new.unidade_id is distinct from old.unidade_id
       or new.versao is distinct from old.versao
       or new.vigencia_inicio is distinct from old.vigencia_inicio
       or new.fuso is distinct from old.fuso
       or new.publicado_em is distinct from old.publicado_em
       or new.publicado_por is distinct from old.publicado_por then
      raise exception 'Uma versão publicada do horário não pode ser editada. Crie uma nova versão.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_nina_ver_bloq on public.nina_calendario_versoes;
create trigger trg_nina_ver_bloq before update or delete on public.nina_calendario_versoes
  for each row execute function public.nina_ver_bloquear_publicada();

-- Publicação: encerra a versão anterior e impede conflitos
create or replace function public.nina_calendario_publicar(
  p_versao_id uuid,
  p_confirmar_conflito boolean default false,
  p_motivo_retroativo text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  v_hoje date;
  v_conflitos jsonb;
  v_role text;
begin
  select * into v from public.nina_calendario_versoes where id = p_versao_id;
  if v.id is null then raise exception 'Versão não encontrada.'; end if;
  if not public.can_manage_clinica(auth.uid(), v.clinica_id) then
    raise exception 'Apenas administradores e gestores podem publicar o horário de funcionamento.';
  end if;
  if v.status <> 'rascunho' then raise exception 'Esta versão já foi publicada.'; end if;

  if not exists (select 1 from public.nina_calendario_atendimento where versao_id = v.id) then
    raise exception 'Configure pelo menos um dia (aberto ou fechado) antes de publicar.';
  end if;

  v_hoje := (now() at time zone coalesce(v.fuso, 'America/Sao_Paulo'))::date;

  if v.vigencia_inicio < v_hoje then
    select role into v_role from public.clinica_memberships
      where user_id = auth.uid() and clinica_id = v.clinica_id and ativo = true;
    if coalesce(v_role, '') <> 'admin' then
      raise exception 'Publicação com validade em data passada é permitida apenas para administradores.';
    end if;
    if p_motivo_retroativo is null or length(btrim(p_motivo_retroativo)) < 5 then
      raise exception 'Informe a justificativa da publicação retroativa.';
    end if;
  end if;

  select jsonb_agg(jsonb_build_object('id', o.id, 'versao', o.versao,
                                      'vigencia_inicio', o.vigencia_inicio, 'vigencia_fim', o.vigencia_fim))
    into v_conflitos
  from public.nina_calendario_versoes o
  where o.status = 'publicado'
    and o.clinica_id = v.clinica_id
    and o.unidade_id is not distinct from v.unidade_id
    and o.id <> v.id
    and coalesce(o.vigencia_fim, 'infinity'::date) >= v.vigencia_inicio
    and o.vigencia_inicio <= coalesce(v.vigencia_fim, 'infinity'::date);

  if v_conflitos is not null and not coalesce(p_confirmar_conflito, false) then
    return jsonb_build_object('ok', false, 'conflitos', v_conflitos);
  end if;

  if v_conflitos is not null then
    -- Versão anterior que começou antes: encerra no dia anterior ao início da nova.
    update public.nina_calendario_versoes o
       set vigencia_fim = v.vigencia_inicio - 1,
           status = case when v.vigencia_inicio - 1 < o.vigencia_inicio then 'substituido' else o.status end
     where o.status = 'publicado'
       and o.clinica_id = v.clinica_id
       and o.unidade_id is not distinct from v.unidade_id
       and o.id <> v.id
       and o.vigencia_inicio < v.vigencia_inicio
       and coalesce(o.vigencia_fim, 'infinity'::date) >= v.vigencia_inicio;

    -- Versão publicada que começa depois: passa a valer como substituída pela nova apenas se
    -- estiver totalmente contida no período da nova; caso contrário, a nova é encerrada antes dela.
    update public.nina_calendario_versoes o
       set status = 'substituido'
     where o.status = 'publicado'
       and o.clinica_id = v.clinica_id
       and o.unidade_id is not distinct from v.unidade_id
       and o.id <> v.id
       and o.vigencia_inicio >= v.vigencia_inicio
       and coalesce(o.vigencia_fim, 'infinity'::date) <= coalesce(v.vigencia_fim, 'infinity'::date);
  end if;

  update public.nina_calendario_versoes
     set status = 'publicado',
         publicado_em = now(),
         publicado_por = auth.uid(),
         retroativa = (v.vigencia_inicio < v_hoje),
         motivo_retroativo = case when v.vigencia_inicio < v_hoje then p_motivo_retroativo else null end
   where id = v.id;

  return jsonb_build_object('ok', true, 'versao', v.versao, 'conflitos_encerrados', coalesce(v_conflitos, '[]'::jsonb));
end;
$$;

revoke all on function public.nina_calendario_publicar(uuid, boolean, text) from public, anon;
grant execute on function public.nina_calendario_publicar(uuid, boolean, text) to authenticated;

-- Classificação usa só versões publicadas, sempre a que valia na data do evento
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
ver as (
  select v.* from public.nina_calendario_versoes v, d
   where v.clinica_id = p_clinica
     and v.status in ('publicado','substituido')
     and v.publicado_em is not null
     and v.vigencia_inicio <= d.dia
     and (v.vigencia_fim is null or v.vigencia_fim >= d.dia)
     and (v.unidade_id is null or p_unidade is null or v.unidade_id = p_unidade)
   order by v.vigencia_inicio desc, v.versao desc
   limit 1
),
exc as (
  select e.* from public.nina_calendario_excecoes e, d, ver
  where e.versao_id = ver.id and e.data = d.dia
),
vig as (
  select c.* from public.nina_calendario_atendimento c, ver
  where c.versao_id = ver.id and c.ativo
)
select case
  when not exists (select 1 from ver) then 'nao_classificavel'
  when exists (select 1 from exc where tipo = 'fechado') then 'fora'
  when exists (select 1 from exc where tipo = 'especial') then (
    case when exists (
      select 1 from exc, d
      where exc.tipo = 'especial' and d.hora >= exc.hora_inicio and d.hora < exc.hora_fim
    ) then 'dentro' else 'fora' end
  )
  when not exists (select 1 from vig where dia_semana = (select dow from d)) then 'nao_classificavel'
  when exists (
    select 1 from vig, d
    where vig.dia_semana = d.dow and not vig.fechado
      and d.hora >= vig.hora_inicio and d.hora < vig.hora_fim
  ) then 'dentro'
  else 'fora'
end;
$$;

grant execute on function public.nina_classificar_atendimento(uuid, uuid, timestamptz, text) to authenticated;
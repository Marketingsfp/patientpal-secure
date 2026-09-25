create extension if not exists pg_net;

create table public.lumen_tv_config (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas(id) on delete cascade,
  url text not null default 'https://display-mate.lovable.app/api/public/calls',
  token text not null,
  pair_codes text[] null,
  enviar_nome boolean not null default false,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index lumen_tv_config_clinica_uidx on public.lumen_tv_config(clinica_id);
grant select, insert, update, delete on public.lumen_tv_config to authenticated;
grant all on public.lumen_tv_config to service_role;
alter table public.lumen_tv_config enable row level security;
create policy lumen_tv_config_managers on public.lumen_tv_config for all to authenticated
  using (public.can_manage_clinica(auth.uid(), clinica_id))
  with check (public.can_manage_clinica(auth.uid(), clinica_id));

create table public.lumen_tv_envios (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null,
  senha_id uuid,
  codigo text,
  enviado_em timestamptz not null default now(),
  request_id bigint null
);
create index lumen_tv_envios_clinica_idx on public.lumen_tv_envios(clinica_id, enviado_em desc);
grant select on public.lumen_tv_envios to authenticated;
grant all on public.lumen_tv_envios to service_role;
alter table public.lumen_tv_envios enable row level security;
create policy lumen_tv_envios_select_managers on public.lumen_tv_envios for select to authenticated
  using (public.can_manage_clinica(auth.uid(), clinica_id));

create or replace function public.tg_lumen_tv_chamada()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  cfg public.lumen_tv_config%rowtype;
  corpo jsonb;
  nome text;
  rid bigint;
begin
  begin
    select * into cfg from public.lumen_tv_config where clinica_id = NEW.clinica_id and ativo limit 1;
    if not found then return NEW; end if;
    corpo := jsonb_build_object('code', NEW.codigo, 'desk', NEW.guiche);
    if cfg.enviar_nome and NEW.paciente_id is not null then
      select p.nome into nome from public.pacientes p where p.id = NEW.paciente_id;
      if nome is not null then corpo := corpo || jsonb_build_object('patientName', nome); end if;
    end if;
    if cfg.pair_codes is not null and array_length(cfg.pair_codes,1) > 0 then
      corpo := corpo || jsonb_build_object('screenPairCodes', to_jsonb(cfg.pair_codes));
    end if;
    select net.http_post(
      url := cfg.url, body := corpo,
      headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||cfg.token),
      timeout_milliseconds := 5000) into rid;
    insert into public.lumen_tv_envios(clinica_id, senha_id, codigo, request_id)
      values (NEW.clinica_id, NEW.id, NEW.codigo, rid);
  exception when others then null;
  end;
  return NEW;
end $$;
revoke all on function public.tg_lumen_tv_chamada() from public, anon, authenticated;

create trigger tg_lumen_tv_chamada after update of status on public.senhas
  for each row when (OLD.status is distinct from NEW.status and NEW.status = 'chamada')
  execute function public.tg_lumen_tv_chamada();

select cron.schedule('lumen-tv-envios-limpeza', '15 4 * * *',
  $$delete from public.lumen_tv_envios where enviado_em < now() - interval '30 days'$$);
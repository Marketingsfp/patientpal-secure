-- Dia explicitamente FECHADO x dia SEM CONFIGURAÇÃO
alter table public.nina_calendario_atendimento
  add column if not exists fechado boolean not null default false;

alter table public.nina_calendario_atendimento alter column hora_inicio drop not null;
alter table public.nina_calendario_atendimento alter column hora_fim drop not null;
alter table public.nina_calendario_atendimento drop constraint if exists nina_cal_intervalo_chk;
alter table public.nina_calendario_atendimento
  add constraint nina_cal_intervalo_chk check (
    (fechado and hora_inicio is null and hora_fim is null)
    or (not fechado and hora_inicio is not null and hora_fim is not null and hora_fim > hora_inicio)
  );

-- Validação de sobreposição e de faixa que atravessa a meia-noite.
create or replace function public.nina_cal_validar()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.fechado then
    -- Dia fechado é único: não convive com faixas na mesma vigência.
    if exists (
      select 1 from public.nina_calendario_atendimento c
       where c.id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid)
         and c.clinica_id = new.clinica_id
         and c.dia_semana = new.dia_semana
         and c.ativo and new.ativo
         and c.unidade_id is not distinct from new.unidade_id
         and c.vigencia_inicio <= coalesce(new.vigencia_fim, 'infinity'::date)
         and coalesce(c.vigencia_fim, 'infinity'::date) >= new.vigencia_inicio
    ) then
      raise exception 'Este dia já tem faixas cadastradas nesta vigência. Remova as faixas antes de marcar o dia como fechado.';
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
       and c.vigencia_inicio <= coalesce(new.vigencia_fim, 'infinity'::date)
       and coalesce(c.vigencia_fim, 'infinity'::date) >= new.vigencia_inicio
       and (c.fechado
            or (c.hora_inicio < new.hora_fim and new.hora_inicio < c.hora_fim))
  ) then
    raise exception 'Esta faixa se sobrepõe a outra já cadastrada (ou ao dia marcado como fechado) para o mesmo dia e período de vigência.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_nina_cal_validar on public.nina_calendario_atendimento;
create trigger trg_nina_cal_validar
  before insert or update on public.nina_calendario_atendimento
  for each row execute function public.nina_cal_validar();

-- Exceções por data: uma regra por data/escopo, com horário obrigatório no funcionamento especial.
create unique index if not exists uq_nina_exc_data
  on public.nina_calendario_excecoes (clinica_id, coalesce(unidade_id, '00000000-0000-0000-0000-000000000000'::uuid), data, coalesce(hora_inicio, '00:00'::time));

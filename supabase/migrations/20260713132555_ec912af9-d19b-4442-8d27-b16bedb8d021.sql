-- Três telas paralelas inseriam direto em contrato_dependentes, cada uma com
-- sua própria (ou nenhuma) validação: contratos-page.tsx (confirmarIncluir)
-- checava limite/duplicidade/titular no client, mas
-- paciente-cartoes-beneficios.tsx e app.cartao-beneficios.dependentes.tsx
-- não checavam nada — a regra do plano podia ser burlada por essas rotas.
--
-- Em vez de confiar só em validação client-side (fácil de esquecer numa 4ª
-- tela futura), este trigger bloqueia no banco QUALQUER insert de
-- dependente ativo que viole: contrato cancelado, titular incluído como
-- próprio dependente, duplicidade (mesmo paciente já ativo no contrato) ou
-- limite de dependentes do convênio/plano.
create or replace function public.contrato_dependentes_validar()
returns trigger
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_contrato record;
  v_max integer := 0;
  v_ativos integer;
begin
  if NEW.ativo is distinct from true then
    return NEW;
  end if;

  select id, paciente_id, status, convenio_id, plano_id
  into v_contrato
  from contratos_assinatura
  where id = NEW.contrato_id;

  if v_contrato.id is null then
    raise exception 'Contrato não encontrado.';
  end if;
  if v_contrato.status = 'cancelado' then
    raise exception 'Este contrato está cancelado — não é possível incluir dependentes.';
  end if;
  if v_contrato.paciente_id = NEW.paciente_id then
    raise exception 'O titular não pode ser dependente do próprio contrato.';
  end if;

  select count(*) into v_ativos
  from contrato_dependentes
  where contrato_id = NEW.contrato_id
    and ativo = true
    and paciente_id = NEW.paciente_id
    and id is distinct from NEW.id;
  if v_ativos > 0 then
    raise exception 'Esse paciente já é dependente ativo deste contrato.' using errcode = '23505';
  end if;

  if v_contrato.convenio_id is not null then
    select max_dependentes into v_max from cb_convenios where id = v_contrato.convenio_id;
  elsif v_contrato.plano_id is not null then
    select max_dependentes into v_max from planos_assinatura where id = v_contrato.plano_id;
  end if;
  v_max := coalesce(v_max, 0);

  select count(*) into v_ativos
  from contrato_dependentes
  where contrato_id = NEW.contrato_id
    and ativo = true
    and id is distinct from NEW.id;
  if v_ativos >= v_max then
    raise exception 'Limite de % dependente(s) deste contrato foi atingido.', v_max;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_contrato_dependentes_validar on public.contrato_dependentes;
create trigger trg_contrato_dependentes_validar
  before insert or update on public.contrato_dependentes
  for each row execute function public.contrato_dependentes_validar();

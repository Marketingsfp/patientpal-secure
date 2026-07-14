-- ALTA-08: paciente_cartao_inadimplente é SECURITY DEFINER (ignora RLS) e
-- não verificava se o usuário chamando realmente pertence à clínica
-- informada em _clinica_id — qualquer usuário autenticado, de qualquer
-- clínica, podia passar o clinica_id de OUTRA clínica e ver a situação
-- financeira (mensalidades em aberto, valores) de um paciente que não é
-- dela. _clinica_id nulo também pulava o filtro por completo, agregando
-- dívidas de TODAS as clínicas. Nenhum caller legítimo depende desse
-- bypass — os 3 pontos de chamada no app sempre passam
-- clinicaAtual.clinica_id.
create or replace function public.paciente_cartao_inadimplente(_paciente_id uuid, _clinica_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  _hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  _mens jsonb;
  _total numeric;
begin
  if _paciente_id is null then
    return jsonb_build_object('bloqueado', false);
  end if;

  if _clinica_id is null then
    raise exception 'clinica_id é obrigatório.';
  end if;
  if not exists (
    select 1 from public.clinica_memberships
    where user_id = auth.uid() and clinica_id = _clinica_id and ativo = true
  ) then
    raise exception 'Sem acesso a esta clínica.' using errcode = '42501';
  end if;

  with mens as (
    select m.id, m.numero_parcela, m.vencimento, m.valor, m.status,
           c.numero as contrato_numero, c.id as contrato_id,
           cv.nome as convenio_nome,
           greatest(0, _hoje - m.vencimento) as dias_atraso
    from public.contrato_mensalidades m
    join public.contratos_assinatura c on c.id = m.contrato_id
    left join public.cb_convenios cv on cv.id = c.convenio_id
    where m.status in ('pendente','aberto','atrasado','vencida','vencido')
      and m.vencimento < _hoje
      and c.status = 'ativo'
      and c.clinica_id = _clinica_id
      and (
        c.paciente_id = _paciente_id
        or exists (
          select 1 from public.contrato_dependentes d
          where d.contrato_id = c.id and d.paciente_id = _paciente_id and d.ativo
        )
      )
  )
  select
    coalesce(jsonb_agg(to_jsonb(m) order by m.vencimento), '[]'::jsonb),
    coalesce(sum(valor), 0)
  into _mens, _total
  from mens m;

  return jsonb_build_object(
    'bloqueado', jsonb_array_length(_mens) > 0,
    'total_aberto', _total,
    'mensalidades', _mens
  );
end;
$$;

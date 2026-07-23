
-- Constante: dias corridos de tolerância após o vencimento (sem juros e com uso restrito do convênio).
CREATE OR REPLACE FUNCTION public.contrato_dias_tolerancia()
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT 5;
$$;

GRANT EXECUTE ON FUNCTION public.contrato_dias_tolerancia() TO authenticated, service_role;

-- Atualiza paciente_cartao_inadimplente: só considera bloqueado quando existe
-- parcela com dias_atraso > tolerância. Também retorna em_carencia + parcelas
-- em carência (0..tolerância dias de atraso) para uso no fluxo de agenda.
CREATE OR REPLACE FUNCTION public.paciente_cartao_inadimplente(_paciente_id uuid, _clinica_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
declare
  _hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  _tol integer := public.contrato_dias_tolerancia();
  _bloq jsonb;
  _carencia jsonb;
  _total_bloq numeric;
  _total_carencia numeric;
  _dias_carencia_restantes integer;
begin
  if _paciente_id is null then
    return jsonb_build_object('bloqueado', false, 'em_carencia', false);
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
  ),
  bloq as (
    select * from mens where dias_atraso > _tol
  ),
  carencia as (
    select * from mens where dias_atraso <= _tol
  )
  select
    coalesce((select jsonb_agg(to_jsonb(b) order by b.vencimento) from bloq b), '[]'::jsonb),
    coalesce((select sum(valor) from bloq), 0),
    coalesce((select jsonb_agg(to_jsonb(c) order by c.vencimento) from carencia c), '[]'::jsonb),
    coalesce((select sum(valor) from carencia), 0),
    (select min(_tol - dias_atraso) from carencia)
  into _bloq, _total_bloq, _carencia, _total_carencia, _dias_carencia_restantes;

  return jsonb_build_object(
    'bloqueado',           jsonb_array_length(_bloq) > 0,
    'total_aberto',        _total_bloq,
    'mensalidades',        _bloq,           -- compat: continua sendo as bloqueadas
    'em_carencia',         jsonb_array_length(_carencia) > 0 and jsonb_array_length(_bloq) = 0,
    'mensalidades_carencia', _carencia,
    'total_carencia',      _total_carencia,
    'dias_carencia_restantes', _dias_carencia_restantes,
    'dias_tolerancia',     _tol
  );
end;
$function$;

-- Novo helper compacto para uso no fluxo de agenda.
CREATE OR REPLACE FUNCTION public.paciente_cartao_status(_paciente_id uuid, _clinica_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
declare
  _info jsonb;
  _estado text;
begin
  _info := public.paciente_cartao_inadimplente(_paciente_id, _clinica_id);
  if coalesce((_info->>'bloqueado')::boolean, false) then
    _estado := 'bloqueado';
  elsif coalesce((_info->>'em_carencia')::boolean, false) then
    _estado := 'em_carencia';
  else
    _estado := 'ok';
  end if;
  return _info || jsonb_build_object('estado', _estado);
end;
$function$;

GRANT EXECUTE ON FUNCTION public.paciente_cartao_inadimplente(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.paciente_cartao_status(uuid, uuid) TO authenticated, service_role;

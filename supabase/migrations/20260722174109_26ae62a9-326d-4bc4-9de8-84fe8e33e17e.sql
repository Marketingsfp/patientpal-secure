CREATE OR REPLACE FUNCTION public.criar_contrato_assinatura(
  _clinica_id uuid, _convenio_id uuid, _paciente_id uuid, _paciente_nome text,
  _data_inicio date, _data_fim date, _dia_vencimento integer, _valor_mensal numeric,
  _taxa_adesao numeric, _num_parcelas integer, _forma_pagamento text, _observacoes text,
  _criado_por uuid, _dependentes jsonb, _mensalidades jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare
  v_contrato_id uuid;
  v_numero integer;
  v_dup_numero integer;
  v_venc_adesao date;
begin
  if auth.uid() is null or not is_member(auth.uid(), _clinica_id) then
    raise exception 'Sem permissão para criar contrato nesta clínica.'
      using errcode = '42501';
  end if;

  -- Lock por (clinica_id, paciente_id) contra duplo clique.
  -- Usa a variante de 1 argumento (bigint) — a de 2 argumentos exige int4/int4,
  -- e hashtextextended retorna bigint, o que causava
  -- "pg_advisory_xact_lock(bigint, bigint) does not exist" (42883).
  perform pg_advisory_xact_lock(
    hashtextextended(_clinica_id::text || ':' || _paciente_id::text, 0)
  );

  select numero into v_dup_numero
  from contratos_assinatura
  where clinica_id = _clinica_id and paciente_id = _paciente_id and status = 'ativo'
  limit 1;
  if v_dup_numero is not null then
    raise exception 'Este titular já possui um contrato ativo (#%). Cancele o contrato anterior antes de criar um novo.', v_dup_numero
      using errcode = '23505';
  end if;

  insert into contratos_assinatura (
    clinica_id, convenio_id, paciente_id, paciente_nome, data_inicio, data_fim,
    dia_vencimento, valor_mensal, taxa_adesao, num_parcelas, forma_pagamento,
    observacoes, criado_por
  ) values (
    _clinica_id, _convenio_id, _paciente_id, _paciente_nome, _data_inicio, _data_fim,
    _dia_vencimento, _valor_mensal, _taxa_adesao, _num_parcelas, _forma_pagamento,
    _observacoes, _criado_por
  )
  returning id, numero into v_contrato_id, v_numero;

  if _dependentes is not null and jsonb_array_length(_dependentes) > 0 then
    insert into contrato_dependentes (contrato_id, paciente_id, paciente_nome, parentesco, tipo)
    select v_contrato_id, (d->>'paciente_id')::uuid, d->>'paciente_nome',
           d->>'parentesco', coalesce(d->>'tipo', 'dependente')
    from jsonb_array_elements(_dependentes) as d;
  end if;

  if _mensalidades is not null and jsonb_array_length(_mensalidades) > 0 then
    insert into contrato_mensalidades (
      contrato_id, clinica_id, numero_parcela, vencimento, valor, taxa_adesao,
      status, pago_em, valor_pago, observacoes
    )
    select v_contrato_id, _clinica_id,
      (m->>'numero_parcela')::integer, (m->>'vencimento')::date, (m->>'valor')::numeric,
      coalesce((m->>'taxa_adesao')::numeric, 0),
      coalesce(m->>'status', 'pendente'),
      (m->>'pago_em')::date, (m->>'valor_pago')::numeric, m->>'observacoes'
    from jsonb_array_elements(_mensalidades) as m;
  end if;

  if coalesce(_taxa_adesao, 0) > 0 then
    select (m->>'vencimento')::date into v_venc_adesao
    from jsonb_array_elements(coalesce(_mensalidades, '[]'::jsonb)) as m
    where (m->>'numero_parcela')::integer = 1
    limit 1;
    if v_venc_adesao is null then
      v_venc_adesao := _data_inicio;
    end if;
    insert into contrato_mensalidades (
      contrato_id, clinica_id, numero_parcela, vencimento, valor, status, observacoes
    ) values (
      v_contrato_id, _clinica_id, 0, v_venc_adesao, _taxa_adesao, 'pendente', 'Taxa de adesão'
    );
  end if;

  return jsonb_build_object('id', v_contrato_id, 'numero', v_numero);
end;
$function$;
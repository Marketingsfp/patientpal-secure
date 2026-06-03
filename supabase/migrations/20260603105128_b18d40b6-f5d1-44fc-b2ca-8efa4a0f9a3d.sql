CREATE OR REPLACE FUNCTION public.cubo_bi_financeiro_agregado(
  _clinica_id uuid,
  _ini date,
  _fim date,
  _row_key text,
  _sub_row_key text DEFAULT NULL,
  _sub_sub_row_key text DEFAULT NULL,
  _col_key text DEFAULT NULL,
  _measure_field text DEFAULT NULL,
  _measure_agg text DEFAULT 'count'
)
RETURNS TABLE (
  row_value text,
  sub_row_value text,
  sub_sub_row_value text,
  col_value text,
  valor numeric
)
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  row_expr text;
  sub_row_expr text;
  sub_sub_row_expr text;
  col_expr text;
  measure_expr text;
  group_parts text[] := ARRAY[]::text[];
  group_sql text;
BEGIN
  IF _clinica_id IS NULL THEN
    RAISE EXCEPTION 'clinica_id é obrigatório';
  END IF;

  IF _ini IS NULL OR _fim IS NULL THEN
    RAISE EXCEPTION 'período é obrigatório';
  END IF;

  IF _fim < _ini THEN
    RAISE EXCEPTION 'período inválido';
  END IF;

  row_expr := CASE _row_key
    WHEN 'tipo' THEN 'coalesce(fl.tipo::text, ''—'')'
    WHEN 'categoria' THEN 'coalesce(fc.nome, ''Sem categoria'')'
    WHEN 'conta' THEN 'coalesce(fco.nome, ''—'')'
    WHEN 'forma_pagamento' THEN 'coalesce(fl.forma_pagamento, ''—'')'
    WHEN 'status' THEN 'coalesce(fl.status::text, ''—'')'
    WHEN 'medico' THEN 'coalesce(m.nome, ''—'')'
    WHEN 'especialidade' THEN 'coalesce(e.nome, ''—'')'
    WHEN 'paciente' THEN 'coalesce(p.nome, ''—'')'
    WHEN 'dia' THEN 'to_char(fl.data, ''YYYY-MM-DD'')'
    WHEN 'mes' THEN 'to_char(fl.data, ''MM'') || ''-'' || initcap(to_char(fl.data, ''TMMon''))'
    WHEN 'mes_ano' THEN 'to_char(fl.data, ''YYYY-MM'')'
    WHEN 'ano' THEN 'to_char(fl.data, ''YYYY'')'
    WHEN 'mes_nome' THEN 'to_char(fl.data, ''MM'') || ''-'' || initcap(to_char(fl.data, ''TMMon''))'
    ELSE NULL
  END;

  IF row_expr IS NULL THEN
    RAISE EXCEPTION 'dimensão de linha inválida';
  END IF;

  sub_row_expr := CASE _sub_row_key
    WHEN NULL THEN NULL
    WHEN 'tipo' THEN 'coalesce(fl.tipo::text, ''—'')'
    WHEN 'categoria' THEN 'coalesce(fc.nome, ''Sem categoria'')'
    WHEN 'conta' THEN 'coalesce(fco.nome, ''—'')'
    WHEN 'forma_pagamento' THEN 'coalesce(fl.forma_pagamento, ''—'')'
    WHEN 'status' THEN 'coalesce(fl.status::text, ''—'')'
    WHEN 'medico' THEN 'coalesce(m.nome, ''—'')'
    WHEN 'especialidade' THEN 'coalesce(e.nome, ''—'')'
    WHEN 'paciente' THEN 'coalesce(p.nome, ''—'')'
    WHEN 'dia' THEN 'to_char(fl.data, ''YYYY-MM-DD'')'
    WHEN 'mes' THEN 'to_char(fl.data, ''MM'') || ''-'' || initcap(to_char(fl.data, ''TMMon''))'
    WHEN 'mes_ano' THEN 'to_char(fl.data, ''YYYY-MM'')'
    WHEN 'ano' THEN 'to_char(fl.data, ''YYYY'')'
    WHEN 'mes_nome' THEN 'to_char(fl.data, ''MM'') || ''-'' || initcap(to_char(fl.data, ''TMMon''))'
    ELSE NULL
  END;

  IF _sub_row_key IS NOT NULL AND sub_row_expr IS NULL THEN
    RAISE EXCEPTION 'dimensão de detalhe inválida';
  END IF;

  sub_sub_row_expr := CASE _sub_sub_row_key
    WHEN NULL THEN NULL
    WHEN 'tipo' THEN 'coalesce(fl.tipo::text, ''—'')'
    WHEN 'categoria' THEN 'coalesce(fc.nome, ''Sem categoria'')'
    WHEN 'conta' THEN 'coalesce(fco.nome, ''—'')'
    WHEN 'forma_pagamento' THEN 'coalesce(fl.forma_pagamento, ''—'')'
    WHEN 'status' THEN 'coalesce(fl.status::text, ''—'')'
    WHEN 'medico' THEN 'coalesce(m.nome, ''—'')'
    WHEN 'especialidade' THEN 'coalesce(e.nome, ''—'')'
    WHEN 'paciente' THEN 'coalesce(p.nome, ''—'')'
    WHEN 'dia' THEN 'to_char(fl.data, ''YYYY-MM-DD'')'
    WHEN 'mes' THEN 'to_char(fl.data, ''MM'') || ''-'' || initcap(to_char(fl.data, ''TMMon''))'
    WHEN 'mes_ano' THEN 'to_char(fl.data, ''YYYY-MM'')'
    WHEN 'ano' THEN 'to_char(fl.data, ''YYYY'')'
    WHEN 'mes_nome' THEN 'to_char(fl.data, ''MM'') || ''-'' || initcap(to_char(fl.data, ''TMMon''))'
    ELSE NULL
  END;

  IF _sub_sub_row_key IS NOT NULL AND sub_sub_row_expr IS NULL THEN
    RAISE EXCEPTION 'segunda dimensão de detalhe inválida';
  END IF;

  col_expr := CASE _col_key
    WHEN NULL THEN NULL
    WHEN 'tipo' THEN 'coalesce(fl.tipo::text, ''—'')'
    WHEN 'categoria' THEN 'coalesce(fc.nome, ''Sem categoria'')'
    WHEN 'conta' THEN 'coalesce(fco.nome, ''—'')'
    WHEN 'forma_pagamento' THEN 'coalesce(fl.forma_pagamento, ''—'')'
    WHEN 'status' THEN 'coalesce(fl.status::text, ''—'')'
    WHEN 'medico' THEN 'coalesce(m.nome, ''—'')'
    WHEN 'especialidade' THEN 'coalesce(e.nome, ''—'')'
    WHEN 'paciente' THEN 'coalesce(p.nome, ''—'')'
    WHEN 'dia' THEN 'to_char(fl.data, ''YYYY-MM-DD'')'
    WHEN 'mes' THEN 'to_char(fl.data, ''MM'') || ''-'' || initcap(to_char(fl.data, ''TMMon''))'
    WHEN 'mes_ano' THEN 'to_char(fl.data, ''YYYY-MM'')'
    WHEN 'ano' THEN 'to_char(fl.data, ''YYYY'')'
    WHEN 'mes_nome' THEN 'to_char(fl.data, ''MM'') || ''-'' || initcap(to_char(fl.data, ''TMMon''))'
    ELSE NULL
  END;

  IF _col_key IS NOT NULL AND col_expr IS NULL THEN
    RAISE EXCEPTION 'dimensão de coluna inválida';
  END IF;

  measure_expr := CASE
    WHEN coalesce(_measure_agg, 'count') = 'count' THEN 'count(*)::numeric'
    WHEN _measure_field IN ('valor') AND _measure_agg = 'sum' THEN 'coalesce(sum(fl.valor), 0)'
    WHEN _measure_field IN ('valor') AND _measure_agg = 'avg' THEN 'coalesce(avg(fl.valor), 0)'
    WHEN _measure_field IN ('valor') AND _measure_agg = 'min' THEN 'coalesce(min(fl.valor), 0)'
    WHEN _measure_field IN ('valor') AND _measure_agg = 'max' THEN 'coalesce(max(fl.valor), 0)'
    ELSE NULL
  END;

  IF measure_expr IS NULL THEN
    RAISE EXCEPTION 'métrica inválida';
  END IF;

  group_parts := array_append(group_parts, row_expr);
  IF sub_row_expr IS NOT NULL THEN group_parts := array_append(group_parts, sub_row_expr); END IF;
  IF sub_sub_row_expr IS NOT NULL THEN group_parts := array_append(group_parts, sub_sub_row_expr); END IF;
  IF col_expr IS NOT NULL THEN group_parts := array_append(group_parts, col_expr); END IF;
  group_sql := array_to_string(group_parts, ', ');

  RETURN QUERY EXECUTE format(
    'SELECT %s::text AS row_value,
            %s::text AS sub_row_value,
            %s::text AS sub_sub_row_value,
            %s::text AS col_value,
            %s AS valor
       FROM public.fin_lancamentos fl
       LEFT JOIN public.fin_categorias fc ON fc.id = fl.categoria_id
       LEFT JOIN public.fin_contas fco ON fco.id = fl.conta_id
       LEFT JOIN public.pacientes p ON p.id = fl.paciente_id
       LEFT JOIN public.medicos m ON m.id = fl.medico_id
       LEFT JOIN public.especialidades e ON e.id = m.especialidade_id
      WHERE fl.clinica_id = $1
        AND fl.data >= $2
        AND fl.data <= $3
      GROUP BY %s',
    row_expr,
    coalesce(sub_row_expr, 'NULL'),
    coalesce(sub_sub_row_expr, 'NULL'),
    coalesce(col_expr, 'NULL'),
    measure_expr,
    group_sql
  ) USING _clinica_id, _ini, _fim;
END;
$$;

GRANT EXECUTE ON FUNCTION public.cubo_bi_financeiro_agregado(uuid, date, date, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cubo_bi_financeiro_agregado(uuid, date, date, text, text, text, text, text, text) TO service_role;
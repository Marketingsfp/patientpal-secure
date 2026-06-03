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
AS $func$
DECLARE
  used_keys text[];
  k text;
  row_expr text;
  sub_row_expr text;
  sub_sub_row_expr text;
  col_expr text;
  measure_expr text;
  group_parts text[] := ARRAY[]::text[];
  group_sql text;
  joins_sql text := '';
  need_fc boolean := false;
  need_fco boolean := false;
  need_p boolean := false;
  need_m boolean := false;
  need_e boolean := false;
BEGIN
  IF _clinica_id IS NULL THEN RAISE EXCEPTION 'clinica_id é obrigatório'; END IF;
  IF _ini IS NULL OR _fim IS NULL THEN RAISE EXCEPTION 'período é obrigatório'; END IF;
  IF _fim < _ini THEN RAISE EXCEPTION 'período inválido'; END IF;

  used_keys := ARRAY[_row_key, _sub_row_key, _sub_sub_row_key, _col_key];
  FOREACH k IN ARRAY used_keys LOOP
    IF k = 'categoria' THEN need_fc := true;
    ELSIF k = 'conta' THEN need_fco := true;
    ELSIF k = 'paciente' THEN need_p := true;
    ELSIF k = 'medico' THEN need_m := true;
    ELSIF k = 'especialidade' THEN need_m := true; need_e := true;
    END IF;
  END LOOP;

  IF need_fc THEN joins_sql := joins_sql || ' LEFT JOIN public.fin_categorias fc ON fc.id = fl.categoria_id'; END IF;
  IF need_fco THEN joins_sql := joins_sql || ' LEFT JOIN public.fin_contas fco ON fco.id = fl.conta_id'; END IF;
  IF need_p THEN joins_sql := joins_sql || ' LEFT JOIN public.pacientes p ON p.id = fl.paciente_id'; END IF;
  IF need_m THEN joins_sql := joins_sql || ' LEFT JOIN public.medicos m ON m.id = fl.medico_id'; END IF;
  IF need_e THEN joins_sql := joins_sql || ' LEFT JOIN public.especialidades e ON e.id = m.especialidade_id'; END IF;

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
  IF row_expr IS NULL THEN RAISE EXCEPTION 'dimensão de linha inválida'; END IF;

  sub_row_expr := CASE
    WHEN _sub_row_key IS NULL THEN NULL
    WHEN _sub_row_key = 'tipo' THEN 'coalesce(fl.tipo::text, ''—'')'
    WHEN _sub_row_key = 'categoria' THEN 'coalesce(fc.nome, ''Sem categoria'')'
    WHEN _sub_row_key = 'conta' THEN 'coalesce(fco.nome, ''—'')'
    WHEN _sub_row_key = 'forma_pagamento' THEN 'coalesce(fl.forma_pagamento, ''—'')'
    WHEN _sub_row_key = 'status' THEN 'coalesce(fl.status::text, ''—'')'
    WHEN _sub_row_key = 'medico' THEN 'coalesce(m.nome, ''—'')'
    WHEN _sub_row_key = 'especialidade' THEN 'coalesce(e.nome, ''—'')'
    WHEN _sub_row_key = 'paciente' THEN 'coalesce(p.nome, ''—'')'
    WHEN _sub_row_key = 'dia' THEN 'to_char(fl.data, ''YYYY-MM-DD'')'
    WHEN _sub_row_key = 'mes' THEN 'to_char(fl.data, ''MM'') || ''-'' || initcap(to_char(fl.data, ''TMMon''))'
    WHEN _sub_row_key = 'mes_ano' THEN 'to_char(fl.data, ''YYYY-MM'')'
    WHEN _sub_row_key = 'ano' THEN 'to_char(fl.data, ''YYYY'')'
    WHEN _sub_row_key = 'mes_nome' THEN 'to_char(fl.data, ''MM'') || ''-'' || initcap(to_char(fl.data, ''TMMon''))'
    ELSE NULL
  END;
  IF _sub_row_key IS NOT NULL AND sub_row_expr IS NULL THEN RAISE EXCEPTION 'dimensão de detalhe inválida'; END IF;

  sub_sub_row_expr := CASE
    WHEN _sub_sub_row_key IS NULL THEN NULL
    WHEN _sub_sub_row_key = 'tipo' THEN 'coalesce(fl.tipo::text, ''—'')'
    WHEN _sub_sub_row_key = 'categoria' THEN 'coalesce(fc.nome, ''Sem categoria'')'
    WHEN _sub_sub_row_key = 'conta' THEN 'coalesce(fco.nome, ''—'')'
    WHEN _sub_sub_row_key = 'forma_pagamento' THEN 'coalesce(fl.forma_pagamento, ''—'')'
    WHEN _sub_sub_row_key = 'status' THEN 'coalesce(fl.status::text, ''—'')'
    WHEN _sub_sub_row_key = 'medico' THEN 'coalesce(m.nome, ''—'')'
    WHEN _sub_sub_row_key = 'especialidade' THEN 'coalesce(e.nome, ''—'')'
    WHEN _sub_sub_row_key = 'paciente' THEN 'coalesce(p.nome, ''—'')'
    WHEN _sub_sub_row_key = 'dia' THEN 'to_char(fl.data, ''YYYY-MM-DD'')'
    WHEN _sub_sub_row_key = 'mes' THEN 'to_char(fl.data, ''MM'') || ''-'' || initcap(to_char(fl.data, ''TMMon''))'
    WHEN _sub_sub_row_key = 'mes_ano' THEN 'to_char(fl.data, ''YYYY-MM'')'
    WHEN _sub_sub_row_key = 'ano' THEN 'to_char(fl.data, ''YYYY'')'
    WHEN _sub_sub_row_key = 'mes_nome' THEN 'to_char(fl.data, ''MM'') || ''-'' || initcap(to_char(fl.data, ''TMMon''))'
    ELSE NULL
  END;
  IF _sub_sub_row_key IS NOT NULL AND sub_sub_row_expr IS NULL THEN RAISE EXCEPTION 'segunda dimensão de detalhe inválida'; END IF;

  col_expr := CASE
    WHEN _col_key IS NULL THEN NULL
    WHEN _col_key = 'tipo' THEN 'coalesce(fl.tipo::text, ''—'')'
    WHEN _col_key = 'categoria' THEN 'coalesce(fc.nome, ''Sem categoria'')'
    WHEN _col_key = 'conta' THEN 'coalesce(fco.nome, ''—'')'
    WHEN _col_key = 'forma_pagamento' THEN 'coalesce(fl.forma_pagamento, ''—'')'
    WHEN _col_key = 'status' THEN 'coalesce(fl.status::text, ''—'')'
    WHEN _col_key = 'medico' THEN 'coalesce(m.nome, ''—'')'
    WHEN _col_key = 'especialidade' THEN 'coalesce(e.nome, ''—'')'
    WHEN _col_key = 'paciente' THEN 'coalesce(p.nome, ''—'')'
    WHEN _col_key = 'dia' THEN 'to_char(fl.data, ''YYYY-MM-DD'')'
    WHEN _col_key = 'mes' THEN 'to_char(fl.data, ''MM'') || ''-'' || initcap(to_char(fl.data, ''TMMon''))'
    WHEN _col_key = 'mes_ano' THEN 'to_char(fl.data, ''YYYY-MM'')'
    WHEN _col_key = 'ano' THEN 'to_char(fl.data, ''YYYY'')'
    WHEN _col_key = 'mes_nome' THEN 'to_char(fl.data, ''MM'') || ''-'' || initcap(to_char(fl.data, ''TMMon''))'
    ELSE NULL
  END;
  IF _col_key IS NOT NULL AND col_expr IS NULL THEN RAISE EXCEPTION 'dimensão de coluna inválida'; END IF;

  measure_expr := CASE
    WHEN coalesce(_measure_agg, 'count') = 'count' THEN 'count(*)::numeric'
    WHEN _measure_field = 'valor' AND _measure_agg = 'sum' THEN 'coalesce(sum(fl.valor), 0)'
    WHEN _measure_field = 'valor' AND _measure_agg = 'avg' THEN 'coalesce(avg(fl.valor), 0)'
    WHEN _measure_field = 'valor' AND _measure_agg = 'min' THEN 'coalesce(min(fl.valor), 0)'
    WHEN _measure_field = 'valor' AND _measure_agg = 'max' THEN 'coalesce(max(fl.valor), 0)'
    ELSE NULL
  END;
  IF measure_expr IS NULL THEN RAISE EXCEPTION 'métrica inválida'; END IF;

  group_parts := array_append(group_parts, row_expr);
  IF sub_row_expr IS NOT NULL THEN group_parts := array_append(group_parts, sub_row_expr); END IF;
  IF sub_sub_row_expr IS NOT NULL THEN group_parts := array_append(group_parts, sub_sub_row_expr); END IF;
  IF col_expr IS NOT NULL THEN group_parts := array_append(group_parts, col_expr); END IF;
  group_sql := array_to_string(group_parts, ', ');

  RETURN QUERY EXECUTE format(
    'SELECT %s::text, %s::text, %s::text, %s::text, %s
       FROM public.fin_lancamentos fl %s
      WHERE fl.clinica_id = $1 AND fl.data >= $2 AND fl.data <= $3
      GROUP BY %s',
    row_expr,
    coalesce(sub_row_expr, 'NULL'),
    coalesce(sub_sub_row_expr, 'NULL'),
    coalesce(col_expr, 'NULL'),
    measure_expr,
    joins_sql,
    group_sql
  ) USING _clinica_id, _ini, _fim;
END;
$func$;

REVOKE ALL ON FUNCTION public.cubo_bi_financeiro_agregado(uuid, date, date, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cubo_bi_financeiro_agregado(uuid, date, date, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cubo_bi_financeiro_agregado(uuid, date, date, text, text, text, text, text, text) TO service_role;

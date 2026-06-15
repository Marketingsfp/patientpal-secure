CREATE OR REPLACE FUNCTION public.fin_atendimentos_matriz(_clinica uuid)
RETURNS TABLE(ano int, mes int, cartao bigint, particular bigint, exames bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cls AS (
    SELECT
      EXTRACT(YEAR FROM data)::int AS ano,
      EXTRACT(MONTH FROM data)::int - 1 AS mes,
      CASE
        WHEN UPPER(descricao) LIKE '%ADESAO%' OR UPPER(descricao) LIKE '%ADESÃO%' THEN NULL
        WHEN UPPER(descricao) LIKE '%CARTAO CONSULTA + SEGUROS%' OR UPPER(descricao) LIKE '%CARTÃO CONSULTA%' THEN NULL
        WHEN UPPER(descricao) LIKE '%CARTAO BENEFICIOS%' OR UPPER(descricao) LIKE '%CARTÃO BENEFÍCIOS%' THEN NULL
        WHEN UPPER(descricao) LIKE '%CONSULTA CARTAO%' OR UPPER(descricao) LIKE '%CONSULTA CARTÃO%' THEN 'cartao'
        WHEN UPPER(descricao) LIKE '%EXAME CARTAO%' OR UPPER(descricao) LIKE '%EXAME CARTÃO%' THEN 'exame'
        WHEN UPPER(descricao) LIKE '%CONTRATO%' THEN 'particular'
        WHEN UPPER(descricao) LIKE '%CONSULTA%' THEN 'particular'
        ELSE 'exame'
      END AS cat
    FROM public.fin_lancamentos
    WHERE clinica_id = _clinica
      AND tipo = 'receita'
      AND status <> 'cancelado'
      AND data IS NOT NULL
  )
  SELECT ano, mes,
    COUNT(*) FILTER (WHERE cat = 'cartao')::bigint AS cartao,
    COUNT(*) FILTER (WHERE cat = 'particular')::bigint AS particular,
    COUNT(*) FILTER (WHERE cat = 'exame')::bigint AS exames
  FROM cls
  WHERE cat IS NOT NULL
  GROUP BY ano, mes
  ORDER BY ano, mes;
$$;

GRANT EXECUTE ON FUNCTION public.fin_atendimentos_matriz(uuid) TO authenticated, service_role;
CREATE OR REPLACE FUNCTION public.kpis_clientes_v2(_clinica_id uuid)
RETURNS TABLE(
  total bigint,
  ativos bigint,
  inativos bigint,
  novos30d bigint,
  sem_telefone bigint,
  sem_cpf bigint,
  aniversariantes bigint,
  associados bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    count(*)::bigint AS total,
    count(*) FILTER (WHERE ativo)::bigint AS ativos,
    count(*) FILTER (WHERE NOT ativo)::bigint AS inativos,
    count(*) FILTER (WHERE created_at >= now() - interval '30 days')::bigint AS novos30d,
    count(*) FILTER (WHERE telefone IS NULL AND telefone2 IS NULL)::bigint AS sem_telefone,
    count(*) FILTER (WHERE cpf IS NULL OR length(regexp_replace(coalesce(cpf,''),'\D','','g')) <> 11)::bigint AS sem_cpf,
    count(*) FILTER (
      WHERE data_nascimento IS NOT NULL
        AND to_char(data_nascimento,'MM-DD') = to_char(current_date,'MM-DD')
    )::bigint AS aniversariantes,
    (
      SELECT count(DISTINCT paciente_id)::bigint
      FROM public.contratos_assinatura
      WHERE clinica_id = _clinica_id AND status = 'ativo'
    ) AS associados
  FROM public.pacientes
  WHERE clinica_id = _clinica_id;
$$;

GRANT EXECUTE ON FUNCTION public.kpis_clientes_v2(uuid) TO authenticated;
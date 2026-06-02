CREATE OR REPLACE FUNCTION public.fin_resumo_periodo(
  p_clinica uuid, p_ini date, p_fim date
)
RETURNS TABLE(tipo text, status text, qtd bigint, total numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.tipo::text, l.status::text, COUNT(*)::bigint, COALESCE(SUM(l.valor),0)::numeric
  FROM public.fin_lancamentos l
  WHERE l.clinica_id = p_clinica
    AND l.data >= p_ini AND l.data <= p_fim
    AND public.is_member(auth.uid(), p_clinica)
  GROUP BY l.tipo, l.status;
$$;

CREATE OR REPLACE FUNCTION public.fin_serie_diaria(
  p_clinica uuid, p_ini date, p_fim date, p_status text DEFAULT NULL
)
RETURNS TABLE(data date, tipo text, total numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.data, l.tipo::text, COALESCE(SUM(l.valor),0)::numeric
  FROM public.fin_lancamentos l
  WHERE l.clinica_id = p_clinica
    AND l.data >= p_ini AND l.data <= p_fim
    AND (p_status IS NULL OR l.status::text = p_status)
    AND public.is_member(auth.uid(), p_clinica)
  GROUP BY l.data, l.tipo
  ORDER BY l.data;
$$;

CREATE OR REPLACE FUNCTION public.fin_resumo_categoria(
  p_clinica uuid, p_ini date, p_fim date, p_status text DEFAULT NULL
)
RETURNS TABLE(categoria_id uuid, tipo text, total numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT l.categoria_id, l.tipo::text, COALESCE(SUM(l.valor),0)::numeric
  FROM public.fin_lancamentos l
  WHERE l.clinica_id = p_clinica
    AND l.data >= p_ini AND l.data <= p_fim
    AND (p_status IS NULL OR l.status::text = p_status)
    AND public.is_member(auth.uid(), p_clinica)
  GROUP BY l.categoria_id, l.tipo;
$$;

GRANT EXECUTE ON FUNCTION public.fin_resumo_periodo(uuid, date, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_serie_diaria(uuid, date, date, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_resumo_categoria(uuid, date, date, text) TO authenticated, service_role;
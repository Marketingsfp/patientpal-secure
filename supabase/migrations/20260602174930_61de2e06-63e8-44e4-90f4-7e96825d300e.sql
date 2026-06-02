CREATE OR REPLACE FUNCTION public.fin_resumo_periodo(p_clinica uuid, p_ini date, p_fim date)
 RETURNS TABLE(tipo text, status text, qtd bigint, total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
BEGIN
  IF NOT public.is_member(auth.uid(), p_clinica) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT l.tipo::text, l.status::text, COUNT(*)::bigint, COALESCE(SUM(l.valor),0)::numeric
    FROM public.fin_lancamentos l
    WHERE l.clinica_id = p_clinica
      AND l.data >= p_ini AND l.data <= p_fim
    GROUP BY l.tipo, l.status;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fin_serie_diaria(p_clinica uuid, p_ini date, p_fim date, p_status text DEFAULT NULL::text)
 RETURNS TABLE(data date, tipo text, total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
BEGIN
  IF NOT public.is_member(auth.uid(), p_clinica) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT l.data, l.tipo::text, COALESCE(SUM(l.valor),0)::numeric
    FROM public.fin_lancamentos l
    WHERE l.clinica_id = p_clinica
      AND l.data >= p_ini AND l.data <= p_fim
      AND (p_status IS NULL OR l.status::text = p_status)
    GROUP BY l.data, l.tipo
    ORDER BY l.data;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fin_resumo_categoria(p_clinica uuid, p_ini date, p_fim date, p_status text DEFAULT NULL::text)
 RETURNS TABLE(categoria_id uuid, tipo text, total numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
BEGIN
  IF NOT public.is_member(auth.uid(), p_clinica) THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT l.categoria_id, l.tipo::text, COALESCE(SUM(l.valor),0)::numeric
    FROM public.fin_lancamentos l
    WHERE l.clinica_id = p_clinica
      AND l.data >= p_ini AND l.data <= p_fim
      AND (p_status IS NULL OR l.status::text = p_status)
    GROUP BY l.categoria_id, l.tipo;
END;
$function$;
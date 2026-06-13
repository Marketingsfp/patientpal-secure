CREATE OR REPLACE FUNCTION public._mj_apply_batch(p_limit int DEFAULT 5000)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE v_count int;
BEGIN
  WITH batch AS (
    SELECT lanc_id, pid
    FROM public._mj_match_plan p
    WHERE EXISTS (
      SELECT 1 FROM public.fin_lancamentos l
      WHERE l.id = p.lanc_id AND l.paciente_id IS NULL
    )
    LIMIT p_limit
  ), upd AS (
    UPDATE public.fin_lancamentos l
    SET paciente_id = b.pid
    FROM batch b
    WHERE l.id = b.lanc_id AND l.paciente_id IS NULL
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_count FROM upd;
  RETURN v_count;
END;
$$;
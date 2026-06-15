DROP FUNCTION IF EXISTS public._mj_apply_batch(int);
CREATE OR REPLACE FUNCTION public._mj_apply_batch(_limit int DEFAULT 5000)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='120s' AS $$
DECLARE _n int;
BEGIN
  WITH lote AS (
    SELECT pid, chave FROM public._mj_match_plan
     WHERE processed=false AND pid IS NOT NULL
     ORDER BY chave LIMIT _limit
  ), s1 AS (
    UPDATE public.pacientes p SET codigo_prontuario = NULL
      FROM lote WHERE p.id = lote.pid RETURNING p.id
  ), s2 AS (
    UPDATE public.pacientes p SET codigo_prontuario = l.chave::text
      FROM lote l WHERE p.id = l.pid AND EXISTS(SELECT 1 FROM s1 WHERE s1.id = p.id) RETURNING p.id
  ), s3 AS (
    UPDATE public._mj_match_plan m SET processed = true
      FROM lote l WHERE m.pid = l.pid AND EXISTS(SELECT 1 FROM s2 WHERE s2.id = l.pid) RETURNING m.pid
  )
  SELECT COUNT(*) INTO _n FROM s3;
  RETURN _n;
END $$;

CREATE EXTENSION IF NOT EXISTS pg_cron;

DROP FUNCTION IF EXISTS public._mj_apply_batch(integer);

CREATE FUNCTION public._mj_apply_batch(_limite int DEFAULT 2000)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '110s'
AS $$
DECLARE
  _aplicados int := 0;
BEGIN
  WITH batch AS (
    DELETE FROM public._mj_match_plan
    WHERE ctid IN (SELECT ctid FROM public._mj_match_plan LIMIT _limite)
    RETURNING lanc_id, pid
  ),
  upd AS (
    UPDATE public.fin_lancamentos l
       SET paciente_id = b.pid
      FROM batch b
     WHERE l.id = b.lanc_id
       AND l.paciente_id IS NULL
    RETURNING 1
  )
  SELECT COUNT(*) INTO _aplicados FROM upd;
  RETURN _aplicados;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('mj-apply-match-plan');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'mj-apply-match-plan',
  '* * * * *',
  $$ SELECT public._mj_apply_batch(2000); $$
);

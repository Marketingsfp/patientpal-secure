CREATE OR REPLACE FUNCTION public._mj_null_all()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='540s' AS $$
DECLARE _n int;
BEGIN
  UPDATE public.pacientes p SET codigo_prontuario = NULL
   WHERE p.id IN (SELECT pid FROM public._mj_match_plan WHERE pid IS NOT NULL AND processed=false)
     AND p.codigo_prontuario IS NOT NULL;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public._mj_apply_batch(_limit int DEFAULT 5000)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='180s' AS $$
DECLARE _n int;
BEGIN
  CREATE TEMP TABLE _mj_lote ON COMMIT DROP AS
    SELECT pid, chave FROM public._mj_match_plan
     WHERE processed=false AND pid IS NOT NULL
     ORDER BY chave LIMIT _limit;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n = 0 THEN RETURN 0; END IF;

  UPDATE public.pacientes p SET codigo_prontuario = l.chave::text
    FROM _mj_lote l WHERE p.id = l.pid;

  UPDATE public._mj_match_plan m SET processed = true
    FROM _mj_lote l WHERE m.pid = l.pid;

  RETURN _n;
END $$;
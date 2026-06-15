CREATE OR REPLACE FUNCTION public._mj_tmp_batch(_limit int DEFAULT 10000)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='55s' AS $$
DECLARE _n int;
BEGIN
  WITH lote AS (
    SELECT mp.pid FROM public._mj_match_plan mp
    JOIN public.pacientes p ON p.id = mp.pid
    WHERE mp.pid IS NOT NULL
      AND (p.codigo_prontuario IS NULL OR p.codigo_prontuario NOT LIKE '\_TMP\_%')
    LIMIT _limit
  )
  UPDATE public.pacientes p SET codigo_prontuario = '_TMP_'||p.id::text
   FROM lote WHERE p.id = lote.pid;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;

CREATE OR REPLACE FUNCTION public._mj_set_batch(_limit int DEFAULT 10000)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='55s' AS $$
DECLARE _n int;
BEGIN
  WITH lote AS (
    SELECT mp.pid, mp.chave FROM public._mj_match_plan mp
    WHERE mp.processed=false AND mp.pid IS NOT NULL
    ORDER BY mp.chave LIMIT _limit
  ), upd AS (
    UPDATE public.pacientes p SET codigo_prontuario = lote.chave::text
      FROM lote WHERE p.id = lote.pid RETURNING p.id
  )
  UPDATE public._mj_match_plan m SET processed=true
    FROM upd WHERE m.pid = upd.id;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END $$;
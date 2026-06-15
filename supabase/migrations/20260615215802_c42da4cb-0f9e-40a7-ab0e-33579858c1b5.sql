CREATE OR REPLACE FUNCTION public._mj_apply_batch(_limit int DEFAULT 2000)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='55s' AS $$
DECLARE _n int;
BEGIN
  CREATE TEMP TABLE _mj_lote ON COMMIT DROP AS
    SELECT pid, chave FROM public._mj_match_plan
     WHERE processed=false AND pid IS NOT NULL
     ORDER BY chave LIMIT _limit;
  GET DIAGNOSTICS _n = ROW_COUNT;
  IF _n = 0 THEN RETURN 0; END IF;

  -- Passo 1: prefixo temporário (evita conflito com chaves de outros lotes)
  UPDATE public.pacientes p SET codigo_prontuario = '_TMP_'||p.id::text
    FROM _mj_lote l WHERE p.id = l.pid;

  -- Passo 2: aplica o número definitivo
  UPDATE public.pacientes p SET codigo_prontuario = l.chave::text
    FROM _mj_lote l WHERE p.id = l.pid;

  UPDATE public._mj_match_plan m SET processed = true
    FROM _mj_lote l WHERE m.pid = l.pid;

  RETURN _n;
END $$;
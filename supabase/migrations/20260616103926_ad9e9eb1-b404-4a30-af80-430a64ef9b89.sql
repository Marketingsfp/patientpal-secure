CREATE OR REPLACE FUNCTION public._mj_apply_batch(p_limit integer DEFAULT 1500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  -- evita execuções sobrepostas do cron
  IF NOT pg_try_advisory_xact_lock(74823001) THEN
    RETURN 0;
  END IF;

  PERFORM set_config('statement_timeout', '55s', true);

  -- 1) seleciona o lote em tabela temporária
  CREATE TEMP TABLE _mj_lote ON COMMIT DROP AS
  SELECT mp.pid, mp.chave
  FROM public._mj_match_plan mp
  WHERE mp.processed = false AND mp.pid IS NOT NULL
  ORDER BY mp.chave
  LIMIT p_limit;

  -- 2) resolve alvos (apenas pids existentes)
  CREATE TEMP TABLE _mj_alvos ON COMMIT DROP AS
  SELECT p.id AS target_id, p.clinica_id, l.chave, l.pid
  FROM _mj_lote l
  JOIN public.pacientes p ON p.id = l.pid;

  -- 3) DESLOCA os ocupantes para um valor temporário (statement separado: fica visível)
  UPDATE public.pacientes p
  SET codigo_prontuario = '_TMP_' || p.id::text
  FROM _mj_alvos a
  WHERE p.clinica_id = a.clinica_id
    AND p.codigo_prontuario = a.chave::text
    AND p.id <> a.target_id;

  -- 4) GRAVA a chave correta no alvo
  UPDATE public.pacientes p
  SET codigo_prontuario = a.chave::text
  FROM _mj_alvos a
  WHERE p.id = a.pid
    AND p.codigo_prontuario IS DISTINCT FROM a.chave::text;

  -- 5) marca como processado (inclui pids órfãos do lote para não travar a fila)
  WITH mark AS (
    UPDATE public._mj_match_plan mp
    SET processed = true
    FROM _mj_lote l
    WHERE mp.chave = l.chave
    RETURNING mp.chave
  )
  SELECT count(*) INTO v_count FROM mark;

  RETURN v_count;
END;
$$;
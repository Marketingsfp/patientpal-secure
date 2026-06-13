
CREATE OR REPLACE PROCEDURE public._mj_apply_match_plan()
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_total int := 0;
BEGIN
  LOOP
    WITH chunk AS (
      SELECT lanc_id, pid FROM public._mj_match_plan LIMIT 3000 FOR UPDATE SKIP LOCKED
    ),
    upd AS (
      UPDATE public.fin_lancamentos f SET paciente_id = c.pid
      FROM chunk c WHERE f.id = c.lanc_id AND f.paciente_id IS NULL
      RETURNING f.id
    ),
    del AS (
      DELETE FROM public._mj_match_plan p
      USING chunk c WHERE p.lanc_id = c.lanc_id
      RETURNING p.lanc_id
    )
    SELECT COUNT(*) INTO v_count FROM del;

    EXIT WHEN v_count = 0;
    v_total := v_total + v_count;
    COMMIT;
  END LOOP;
  RAISE NOTICE 'Total processado: %', v_total;
END;
$$;
REVOKE EXECUTE ON PROCEDURE public._mj_apply_match_plan() FROM PUBLIC, anon, authenticated;

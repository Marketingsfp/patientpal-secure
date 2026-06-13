
REVOKE ALL ON FUNCTION public._mj_apply_batch(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._mj_apply_batch(integer) TO service_role;

-- 1) Rotinas de manutencao/importacao MJ: somente service_role
REVOKE EXECUTE ON FUNCTION public._mj_apply_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._mj_set_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._mj_tmp_batch(integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._mj_null_all() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._do_fix_phones_prontuarios_mj() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._do_fix_prontuario_oldest_mj() FROM PUBLIC, anon, authenticated;

-- 2) Funcoes com PII / financeiro: remover anonimo, manter logado
REVOKE EXECUTE ON FUNCTION public.buscar_paciente_contato(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.buscar_pacientes(uuid, text, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.buscar_pacientes_global(uuid[], text, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.buscar_universal(uuid[], text, text[], integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.paciente_pendencias_cadastro(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_atendimentos_matriz(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.buscar_paciente_contato(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_pacientes(uuid, text, integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_pacientes_global(uuid[], text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_universal(uuid[], text, text[], integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.paciente_pendencias_cadastro(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_atendimentos_matriz(uuid) TO authenticated;
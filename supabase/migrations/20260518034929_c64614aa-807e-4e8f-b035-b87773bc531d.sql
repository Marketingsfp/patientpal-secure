-- Restore only the EXECUTE permissions required by the app and RLS policies.
-- This keeps table protections in place while allowing authenticated policies/RPCs to run.

GRANT USAGE ON SCHEMA public TO anon, authenticated;

-- Helper functions used inside RLS policies and trusted server functions.
GRANT EXECUTE ON FUNCTION public.is_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_clinica(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_any_manager(uuid) TO authenticated;

-- Authenticated RPC functions used by the application.
GRANT EXECUTE ON FUNCTION public.meus_cartoes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.minhas_consultas() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pendencias_paciente(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_clinica_com_admin(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emitir_senha(uuid, public.tipo_senha, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chamar_proxima_senha(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pacientes_face_lista(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.medicos_face_lista(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_prontuario_modelos_padrao(uuid) TO authenticated;

-- Public token-based RPCs: safe to expose because each function validates a private token.
GRANT EXECUTE ON FUNCTION public.consulta_publica(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_anamnese_publica(text, uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contrato_publico(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinar_contrato_publico(text, text, text) TO anon, authenticated;
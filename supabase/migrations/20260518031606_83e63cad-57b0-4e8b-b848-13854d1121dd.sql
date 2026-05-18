-- Helpers usados apenas por políticas RLS: revogar EXECUTE de clientes.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_manage_clinica(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.user_is_any_manager(uuid) FROM PUBLIC, anon, authenticated;

-- Funções de trigger: nunca devem ser chamadas via PostgREST.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.aplicar_movimento_estoque() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.procedimentos_uppercase_nome() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.orcamentos_set_numero() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.contratos_assinatura_set_numero() FROM PUBLIC, anon, authenticated;

-- Funções públicas por design (acessadas por token): manter execução p/ anon+authenticated.
GRANT EXECUTE ON FUNCTION public.consulta_publica(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.contrato_publico(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinar_contrato_publico(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.salvar_anamnese_publica(text, uuid, jsonb) TO anon, authenticated;

-- Funções que exigem usuário logado: garantir somente authenticated.
REVOKE EXECUTE ON FUNCTION public.criar_clinica_com_admin(text, text, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.criar_clinica_com_admin(text, text, text, text, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.emitir_senha(uuid, tipo_senha, uuid, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.emitir_senha(uuid, tipo_senha, uuid, boolean) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.chamar_proxima_senha(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.chamar_proxima_senha(uuid, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.minhas_consultas() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.minhas_consultas() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.meus_cartoes() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.meus_cartoes() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.medicos_face_lista(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.medicos_face_lista(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.pacientes_face_lista(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pacientes_face_lista(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.pendencias_paciente(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.pendencias_paciente(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.seed_prontuario_modelos_padrao(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.seed_prontuario_modelos_padrao(uuid) TO authenticated;

GRANT EXECUTE ON FUNCTION public.can_manage_clinica(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_any_manager(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.criar_clinica_com_admin(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.emitir_senha(uuid, public.tipo_senha, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.chamar_proxima_senha(uuid, text) TO authenticated;
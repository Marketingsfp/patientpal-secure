
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, uuid, public.app_role) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.is_member(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.can_manage_clinica(uuid, uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.user_is_any_manager(uuid) FROM authenticated;

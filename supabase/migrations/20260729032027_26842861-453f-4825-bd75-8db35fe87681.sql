REVOKE EXECUTE ON FUNCTION public.is_admin_ou_gestor(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin_global(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.is_admin_ou_gestor(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin_global(uuid) TO authenticated, service_role;
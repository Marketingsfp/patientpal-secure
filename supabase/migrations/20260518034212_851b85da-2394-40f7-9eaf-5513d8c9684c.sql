-- Restaurar EXECUTE nos helpers usados por policies RLS.
-- Sem isso, usuários authenticated não passam pelas verificações
-- como is_member/can_manage_clinica e leem zero linhas.
GRANT EXECUTE ON FUNCTION public.has_role(uuid, uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_clinica(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_is_any_manager(uuid) TO authenticated;
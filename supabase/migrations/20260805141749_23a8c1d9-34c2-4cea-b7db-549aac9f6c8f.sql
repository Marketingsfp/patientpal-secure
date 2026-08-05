CREATE OR REPLACE FUNCTION public.has_module_access(
  _user_id uuid,
  _clinica_id uuid,
  _modulo text,
  _nivel text DEFAULT 'read'
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH m AS (
    SELECT role::text AS role
    FROM public.clinica_memberships
    WHERE user_id = _user_id
      AND clinica_id = _clinica_id
      AND ativo = true
    LIMIT 1
  )
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM m) THEN false
    WHEN (SELECT role FROM m) = 'admin' THEN true
    ELSE EXISTS (
      SELECT 1
      FROM public.perfis_acesso pa
      JOIN public.perfil_permissoes pp ON pp.perfil_id = pa.id
      WHERE pa.clinica_id = _clinica_id
        AND pa.chave = (SELECT role FROM m)
        AND pp.modulo = _modulo
        AND (
          (_nivel = 'read'  AND pp.acesso::text IN ('read', 'write'))
          OR
          (_nivel = 'write' AND pp.acesso::text = 'write')
        )
    )
  END
$function$;

REVOKE ALL ON FUNCTION public.has_module_access(uuid, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_module_access(uuid, uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_module_access(uuid, uuid, text, text) TO service_role;

COMMENT ON FUNCTION public.has_module_access(uuid, uuid, text, text) IS
  'Autorizacao central por modulo/nivel baseada em perfis_acesso + perfil_permissoes. Admin = acesso total. Fail-closed: perfil sem configuracao retorna false. Nao usada por nenhuma policy ainda (fase 1 do plano de RBAC).';
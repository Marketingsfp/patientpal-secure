-- 1) has_role_global: escopo global exige linha global (clinica_id IS NULL)
CREATE OR REPLACE FUNCTION public.has_role_global(_user_id uuid, _role app_role_global, _clinica_id uuid DEFAULT NULL::uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
      AND (
        clinica_id IS NULL
        OR (_clinica_id IS NOT NULL AND clinica_id = _clinica_id)
      )
  )
$function$;

-- 2) user_roles: impedir escalonamento para 'admin' por quem não é admin global
DROP POLICY IF EXISTS "Admin/gestor gerencia cargos da clínica" ON public.user_roles;
DROP POLICY IF EXISTS "Admin/gestor atualiza cargos da clínica" ON public.user_roles;

CREATE POLICY "Admin/gestor gerencia cargos da clínica"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (
  clinica_id IS NOT NULL
  AND can_manage_clinica(auth.uid(), clinica_id)
  AND (role <> 'admin'::app_role_global OR is_admin_global(auth.uid()))
);

CREATE POLICY "Admin/gestor atualiza cargos da clínica"
ON public.user_roles FOR UPDATE TO authenticated
USING (
  clinica_id IS NOT NULL
  AND can_manage_clinica(auth.uid(), clinica_id)
  AND (role <> 'admin'::app_role_global OR is_admin_global(auth.uid()))
)
WITH CHECK (
  clinica_id IS NOT NULL
  AND can_manage_clinica(auth.uid(), clinica_id)
  AND (role <> 'admin'::app_role_global OR is_admin_global(auth.uid()))
);

-- 3) realtime.messages: validar formato estrito do tópico
DROP POLICY IF EXISTS realtime_clinica_member_select ON realtime.messages;
DROP POLICY IF EXISTS realtime_clinica_member_insert ON realtime.messages;

CREATE POLICY realtime_clinica_member_select
ON realtime.messages FOR SELECT TO authenticated
USING (
  realtime.topic() ~ '^clinica:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND is_member(auth.uid(), substring(realtime.topic() from 9)::uuid)
);

CREATE POLICY realtime_clinica_member_insert
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  realtime.topic() ~ '^clinica:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
  AND is_member(auth.uid(), substring(realtime.topic() from 9)::uuid)
);

-- 4) tabela de backup: escrita explicitamente bloqueada
REVOKE INSERT, UPDATE, DELETE ON public.agendamentos_fim_backup_20260805 FROM authenticated, anon;

CREATE POLICY "Backup de horarios: sem insercao"
ON public.agendamentos_fim_backup_20260805 FOR INSERT TO authenticated
WITH CHECK (false);
CREATE POLICY "Backup de horarios: sem atualizacao"
ON public.agendamentos_fim_backup_20260805 FOR UPDATE TO authenticated
USING (false) WITH CHECK (false);
CREATE POLICY "Backup de horarios: sem exclusao"
ON public.agendamentos_fim_backup_20260805 FOR DELETE TO authenticated
USING (false);
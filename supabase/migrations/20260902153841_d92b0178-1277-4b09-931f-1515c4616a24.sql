-- 1) Papel realmente global: linha em user_roles com role='admin' e SEM clínica.
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'admin'::app_role_global
      AND clinica_id IS NULL
  )
$$;

REVOKE ALL ON FUNCTION public.is_platform_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_admin(uuid) TO authenticated, service_role;

-- 2) Backup de horários (sem clinica_id) -> só admin de plataforma.
DROP POLICY IF EXISTS "Somente admin pode ver backup de horarios" ON public.agendamentos_fim_backup_20260805;
CREATE POLICY "Somente admin de plataforma ve backup de horarios"
  ON public.agendamentos_fim_backup_20260805 FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- 3) lab_allowlist_contatos -> só admin de plataforma.
DROP POLICY IF EXISTS lab_allowlist_admin_select ON public.lab_allowlist_contatos;
DROP POLICY IF EXISTS lab_allowlist_admin_insert ON public.lab_allowlist_contatos;
DROP POLICY IF EXISTS lab_allowlist_admin_update ON public.lab_allowlist_contatos;
DROP POLICY IF EXISTS lab_allowlist_admin_delete ON public.lab_allowlist_contatos;
CREATE POLICY lab_allowlist_platform_select ON public.lab_allowlist_contatos
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY lab_allowlist_platform_insert ON public.lab_allowlist_contatos
  FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY lab_allowlist_platform_update ON public.lab_allowlist_contatos
  FOR UPDATE TO authenticated USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY lab_allowlist_platform_delete ON public.lab_allowlist_contatos
  FOR DELETE TO authenticated USING (public.is_platform_admin(auth.uid()));

-- 4) Tabelas de relatório interno de desenvolvimento (sem clinica_id).
DROP POLICY IF EXISTS dev_rel_entradas_select ON public.dev_relatorio_entradas;
DROP POLICY IF EXISTS dev_rel_entradas_insert ON public.dev_relatorio_entradas;
DROP POLICY IF EXISTS dev_rel_entradas_update ON public.dev_relatorio_entradas;
DROP POLICY IF EXISTS dev_rel_entradas_delete ON public.dev_relatorio_entradas;
CREATE POLICY dev_rel_entradas_select ON public.dev_relatorio_entradas
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY dev_rel_entradas_insert ON public.dev_relatorio_entradas
  FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY dev_rel_entradas_update ON public.dev_relatorio_entradas
  FOR UPDATE TO authenticated USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY dev_rel_entradas_delete ON public.dev_relatorio_entradas
  FOR DELETE TO authenticated USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS dev_rel_dest_select ON public.dev_relatorio_destinatarios;
DROP POLICY IF EXISTS dev_rel_dest_write ON public.dev_relatorio_destinatarios;
CREATE POLICY dev_rel_dest_select ON public.dev_relatorio_destinatarios
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));
CREATE POLICY dev_rel_dest_write ON public.dev_relatorio_destinatarios
  FOR ALL TO authenticated USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS dev_rel_envios_select ON public.dev_relatorio_envios;
CREATE POLICY dev_rel_envios_select ON public.dev_relatorio_envios
  FOR SELECT TO authenticated USING (public.is_platform_admin(auth.uid()));

-- 5) Tabelas de apoio compartilhadas: leitura para todos, escrita só plataforma.
DROP POLICY IF EXISTS especialidades_manager_insert ON public.especialidades;
DROP POLICY IF EXISTS especialidades_manager_update ON public.especialidades;
DROP POLICY IF EXISTS especialidades_manager_delete ON public.especialidades;
CREATE POLICY especialidades_platform_insert ON public.especialidades
  FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY especialidades_platform_update ON public.especialidades
  FOR UPDATE TO authenticated USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY especialidades_platform_delete ON public.especialidades
  FOR DELETE TO authenticated USING (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS tipos_servico_manager_insert ON public.tipos_servico;
DROP POLICY IF EXISTS tipos_servico_manager_update ON public.tipos_servico;
DROP POLICY IF EXISTS tipos_servico_manager_delete ON public.tipos_servico;
CREATE POLICY tipos_servico_platform_insert ON public.tipos_servico
  FOR INSERT TO authenticated WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY tipos_servico_platform_update ON public.tipos_servico
  FOR UPDATE TO authenticated USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));
CREATE POLICY tipos_servico_platform_delete ON public.tipos_servico
  FOR DELETE TO authenticated USING (public.is_platform_admin(auth.uid()));

-- 6) Linter: função sem search_path fixo.
ALTER FUNCTION public.normalizar_termo_busca(text) SET search_path TO 'public', 'pg_temp';
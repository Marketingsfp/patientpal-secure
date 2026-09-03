-- Gestor/admin de QUALQUER clínica ativa. Os catálogos abaixo são globais
-- (não têm clinica_id), por isso a verificação não é por clínica específica.
CREATE OR REPLACE FUNCTION public.is_gestor_de_alguma_clinica(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinica_memberships
    WHERE user_id = _user_id AND ativo = true AND role IN ('admin', 'gestor')
  )
$$;

REVOKE ALL ON FUNCTION public.is_gestor_de_alguma_clinica(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_gestor_de_alguma_clinica(uuid) TO authenticated, service_role;

-- especialidades: criar/editar para gestor de clínica; excluir só plataforma.
DROP POLICY IF EXISTS especialidades_platform_insert ON public.especialidades;
DROP POLICY IF EXISTS especialidades_platform_update ON public.especialidades;
CREATE POLICY especialidades_manager_insert ON public.especialidades
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_gestor_de_alguma_clinica(auth.uid()));
CREATE POLICY especialidades_manager_update ON public.especialidades
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_gestor_de_alguma_clinica(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_gestor_de_alguma_clinica(auth.uid()));

-- tipos_servico: mesma regra.
DROP POLICY IF EXISTS tipos_servico_platform_insert ON public.tipos_servico;
DROP POLICY IF EXISTS tipos_servico_platform_update ON public.tipos_servico;
CREATE POLICY tipos_servico_manager_insert ON public.tipos_servico
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_gestor_de_alguma_clinica(auth.uid()));
CREATE POLICY tipos_servico_manager_update ON public.tipos_servico
  FOR UPDATE TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR public.is_gestor_de_alguma_clinica(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()) OR public.is_gestor_de_alguma_clinica(auth.uid()));

-- Nova função: gestor de médicos = admin/gestor OU perfil com write no módulo "medicos".
CREATE OR REPLACE FUNCTION public.can_manage_medicos(_user_id uuid, _clinica_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    public.can_manage_clinica(_user_id, _clinica_id)
    OR EXISTS (
      SELECT 1
      FROM public.clinica_memberships cm
      JOIN public.perfis_acesso pa
        ON pa.clinica_id = cm.clinica_id
       AND pa.chave = cm.role::text
      JOIN public.perfil_permissoes pp
        ON pp.perfil_id = pa.id
       AND pp.modulo = 'medicos'
       AND pp.acesso = 'write'
      WHERE cm.user_id = _user_id
        AND cm.clinica_id = _clinica_id
        AND cm.ativo = true
    )
$$;

GRANT EXECUTE ON FUNCTION public.can_manage_medicos(uuid, uuid) TO authenticated, service_role;

-- RPC de repasse passa a considerar o novo grupo.
CREATE OR REPLACE FUNCTION public.medicos_repasse_lista(_clinica_id uuid)
RETURNS TABLE(id uuid, tipo_repasse text, percentual_repasse_padrao numeric, valor_repasse_padrao numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT m.id, m.tipo_repasse::text, m.percentual_repasse_padrao, m.valor_repasse_padrao
  FROM public.medicos m
  WHERE m.clinica_id = _clinica_id
    AND public.can_manage_medicos(auth.uid(), _clinica_id);
$$;

-- Policies em medicos: troca can_manage_clinica -> can_manage_medicos.
DROP POLICY IF EXISTS medicos_manager_insert ON public.medicos;
DROP POLICY IF EXISTS medicos_manager_update ON public.medicos;
DROP POLICY IF EXISTS medicos_manager_delete ON public.medicos;

CREATE POLICY medicos_manager_insert ON public.medicos
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_medicos(auth.uid(), clinica_id));

CREATE POLICY medicos_manager_update ON public.medicos
  FOR UPDATE TO authenticated
  USING (public.can_manage_medicos(auth.uid(), clinica_id));

CREATE POLICY medicos_manager_delete ON public.medicos
  FOR DELETE TO authenticated
  USING (public.can_manage_medicos(auth.uid(), clinica_id));

-- Policies em medico_especialidades: idem, via join com medicos.
DROP POLICY IF EXISTS medico_esp_insert ON public.medico_especialidades;
DROP POLICY IF EXISTS medico_esp_delete ON public.medico_especialidades;

CREATE POLICY medico_esp_insert ON public.medico_especialidades
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.medicos m
    WHERE m.id = medico_especialidades.medico_id
      AND public.can_manage_medicos(auth.uid(), m.clinica_id)
  ));

CREATE POLICY medico_esp_delete ON public.medico_especialidades
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.medicos m
    WHERE m.id = medico_especialidades.medico_id
      AND public.can_manage_medicos(auth.uid(), m.clinica_id)
  ));

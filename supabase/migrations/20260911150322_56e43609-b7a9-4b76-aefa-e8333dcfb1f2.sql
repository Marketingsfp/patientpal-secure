ALTER TABLE public.clinica_memberships
  ADD COLUMN IF NOT EXISTS pode_gerir_horarios boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.clinica_memberships.pode_gerir_horarios IS
  'Marcação individual: libera cadastrar/editar/excluir horário semanal de médico (medico_disponibilidades) e gerar vagas. Admin e gestor já têm por perfil.';

CREATE OR REPLACE FUNCTION public.pode_gerir_horarios_medicos(_user_id uuid, _clinica_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clinica_memberships
    WHERE user_id = _user_id AND clinica_id = _clinica_id AND ativo = true
      AND (role IN ('admin', 'gestor') OR pode_gerir_horarios = true)
  )
$$;

REVOKE EXECUTE ON FUNCTION public.pode_gerir_horarios_medicos(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_gerir_horarios_medicos(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS md_insert ON public.medico_disponibilidades;
DROP POLICY IF EXISTS md_update ON public.medico_disponibilidades;
DROP POLICY IF EXISTS md_delete ON public.medico_disponibilidades;

CREATE POLICY md_insert ON public.medico_disponibilidades FOR INSERT TO authenticated
  WITH CHECK (public.pode_gerir_horarios_medicos(auth.uid(), clinica_id));
CREATE POLICY md_update ON public.medico_disponibilidades FOR UPDATE TO authenticated
  USING (public.pode_gerir_horarios_medicos(auth.uid(), clinica_id))
  WITH CHECK (public.pode_gerir_horarios_medicos(auth.uid(), clinica_id));
CREATE POLICY md_delete ON public.medico_disponibilidades FOR DELETE TO authenticated
  USING (public.pode_gerir_horarios_medicos(auth.uid(), clinica_id));

UPDATE public.clinica_memberships
   SET pode_gerir_horarios = true
 WHERE clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
   AND user_id IN ('cf5d4fdd-a9e0-40bb-a4d0-bc32dbec7eee',
                   'e8ca1aed-5f4b-464a-a6f5-57d4fb90cbf7');
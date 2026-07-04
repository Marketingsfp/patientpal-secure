CREATE TABLE public.medico_expediente_encerramento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  medico_id uuid NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  data date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  encerrado_em timestamptz NOT NULL DEFAULT now(),
  encerrado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  motivo text,
  UNIQUE (clinica_id, medico_id, data)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.medico_expediente_encerramento TO authenticated;
GRANT ALL ON public.medico_expediente_encerramento TO service_role;

ALTER TABLE public.medico_expediente_encerramento ENABLE ROW LEVEL SECURITY;

CREATE POLICY mee_select ON public.medico_expediente_encerramento
  FOR SELECT TO authenticated
  USING (is_member(auth.uid(), clinica_id));

CREATE POLICY mee_insert ON public.medico_expediente_encerramento
  FOR INSERT TO authenticated
  WITH CHECK (
    is_member(auth.uid(), clinica_id)
    AND (
      can_manage_clinica(auth.uid(), clinica_id)
      OR EXISTS (
        SELECT 1 FROM public.clinica_memberships cm
        WHERE cm.user_id = auth.uid()
          AND cm.clinica_id = medico_expediente_encerramento.clinica_id
          AND cm.role IN ('recepcao','medico')
      )
    )
  );

CREATE POLICY mee_delete ON public.medico_expediente_encerramento
  FOR DELETE TO authenticated
  USING (
    is_member(auth.uid(), clinica_id)
    AND (
      can_manage_clinica(auth.uid(), clinica_id)
      OR EXISTS (
        SELECT 1 FROM public.clinica_memberships cm
        WHERE cm.user_id = auth.uid()
          AND cm.clinica_id = medico_expediente_encerramento.clinica_id
          AND cm.role IN ('recepcao','medico')
      )
    )
  );

CREATE INDEX idx_mee_clinica_data ON public.medico_expediente_encerramento (clinica_id, data);

CREATE TABLE IF NOT EXISTS public.nfse_agendamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nfse_id uuid NOT NULL REFERENCES public.nfse(id) ON DELETE CASCADE,
  agendamento_id uuid NOT NULL REFERENCES public.agendamentos(id) ON DELETE CASCADE,
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (nfse_id, agendamento_id)
);

CREATE INDEX IF NOT EXISTS idx_nfse_agendamentos_ag ON public.nfse_agendamentos (agendamento_id);
CREATE INDEX IF NOT EXISTS idx_nfse_agendamentos_nfse ON public.nfse_agendamentos (nfse_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfse_agendamentos TO authenticated;
GRANT ALL ON public.nfse_agendamentos TO service_role;

ALTER TABLE public.nfse_agendamentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nfse_agendamentos_select_membros" ON public.nfse_agendamentos
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clinica_memberships cm
    WHERE cm.clinica_id = nfse_agendamentos.clinica_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "nfse_agendamentos_insert_membros" ON public.nfse_agendamentos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.clinica_memberships cm
    WHERE cm.clinica_id = nfse_agendamentos.clinica_id AND cm.user_id = auth.uid()
  ));

CREATE POLICY "nfse_agendamentos_delete_membros" ON public.nfse_agendamentos
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.clinica_memberships cm
    WHERE cm.clinica_id = nfse_agendamentos.clinica_id AND cm.user_id = auth.uid()
  ));

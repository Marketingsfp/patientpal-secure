CREATE TABLE IF NOT EXISTS public.agendamentos_fim_backup_20260805 (
  agendamento_id uuid PRIMARY KEY,
  inicio timestamptz NOT NULL,
  fim_antigo timestamptz,
  criado_em timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.agendamentos_fim_backup_20260805 TO service_role;

ALTER TABLE public.agendamentos_fim_backup_20260805 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Somente admin pode ver backup de horarios" ON public.agendamentos_fim_backup_20260805;

CREATE POLICY "Somente admin pode ver backup de horarios"
  ON public.agendamentos_fim_backup_20260805 FOR SELECT
  TO authenticated
  USING (public.is_admin_global(auth.uid()));
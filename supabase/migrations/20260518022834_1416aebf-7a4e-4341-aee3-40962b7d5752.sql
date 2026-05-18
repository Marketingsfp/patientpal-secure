ALTER TABLE public.orcamentos
  ADD COLUMN IF NOT EXISTS medico_externo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS clinica_solicitante text;

CREATE INDEX IF NOT EXISTS idx_orcamentos_clinica_solicitante
  ON public.orcamentos (clinica_id, clinica_solicitante)
  WHERE clinica_solicitante IS NOT NULL;
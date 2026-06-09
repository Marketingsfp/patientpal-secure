ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS orcamento_id uuid NULL REFERENCES public.orcamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_orcamento_id ON public.agendamentos(orcamento_id);
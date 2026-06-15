ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS pacote_id uuid;
CREATE INDEX IF NOT EXISTS idx_agendamentos_pacote_id ON public.agendamentos(pacote_id);
CREATE INDEX IF NOT EXISTS idx_agendamentos_orcamento_id ON public.agendamentos(orcamento_id);
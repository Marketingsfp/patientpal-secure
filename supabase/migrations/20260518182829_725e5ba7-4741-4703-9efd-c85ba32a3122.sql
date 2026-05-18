ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS agendamento_id uuid
    REFERENCES public.agendamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS fin_lancamentos_agendamento_id_idx
  ON public.fin_lancamentos(agendamento_id);
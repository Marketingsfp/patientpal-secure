ALTER TABLE public.agendamentos
  ADD CONSTRAINT agendamentos_medico_id_fkey
  FOREIGN KEY (medico_id) REFERENCES public.medicos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_medico_id ON public.agendamentos(medico_id);
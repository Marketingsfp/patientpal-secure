ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS especialidade_id uuid NULL REFERENCES public.especialidades(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_especialidade_id
  ON public.agendamentos(especialidade_id);
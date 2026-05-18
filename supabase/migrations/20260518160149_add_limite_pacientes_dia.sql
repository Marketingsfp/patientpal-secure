ALTER TABLE public.medico_disponibilidades
  ADD COLUMN IF NOT EXISTS limite_pacientes integer;

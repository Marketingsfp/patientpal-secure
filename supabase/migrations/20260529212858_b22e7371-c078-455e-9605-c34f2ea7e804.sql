ALTER TABLE public.medico_disponibilidades
  ADD COLUMN IF NOT EXISTS intervalo_min integer;

ALTER TABLE public.enfermagem_recurso_disponibilidades
  ADD COLUMN IF NOT EXISTS intervalo_min integer;
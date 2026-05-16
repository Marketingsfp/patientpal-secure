ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS numero_pasta text;
CREATE INDEX IF NOT EXISTS idx_pacientes_numero_pasta ON public.pacientes(clinica_id, numero_pasta);
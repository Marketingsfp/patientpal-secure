ALTER TABLE public.triagens_enfermagem
  ADD COLUMN IF NOT EXISTS prioridade text DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS motivo_prioridade text;
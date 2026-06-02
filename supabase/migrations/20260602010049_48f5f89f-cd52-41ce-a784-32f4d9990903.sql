ALTER TABLE public.medicos
ADD COLUMN IF NOT EXISTS procedimento_padrao_id uuid REFERENCES public.procedimentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_medicos_procedimento_padrao ON public.medicos(procedimento_padrao_id);
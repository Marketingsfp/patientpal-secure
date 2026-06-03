DROP INDEX IF EXISTS public.uq_procedimentos_clinica_nome;
CREATE INDEX IF NOT EXISTS idx_procedimentos_clinica_nome
  ON public.procedimentos (clinica_id, upper(btrim(nome)));
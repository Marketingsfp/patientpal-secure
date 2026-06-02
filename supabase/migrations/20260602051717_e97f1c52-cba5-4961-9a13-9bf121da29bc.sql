CREATE UNIQUE INDEX IF NOT EXISTS uq_procedimentos_clinica_nome
  ON public.procedimentos (clinica_id, upper(btrim(nome)));
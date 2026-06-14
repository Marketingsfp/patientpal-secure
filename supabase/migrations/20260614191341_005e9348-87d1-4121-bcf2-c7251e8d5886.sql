-- Coluna gerada com CPF apenas em dígitos para permitir busca sem pontos/traços
ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS cpf_digits text
  GENERATED ALWAYS AS (regexp_replace(coalesce(cpf, ''), '\D', '', 'g')) STORED;

CREATE INDEX IF NOT EXISTS idx_pacientes_clinica_cpf_digits
  ON public.pacientes (clinica_id, cpf_digits)
  WHERE cpf_digits <> '';

CREATE INDEX IF NOT EXISTS idx_pacientes_cpf_digits_trgm
  ON public.pacientes USING gin (cpf_digits gin_trgm_ops)
  WHERE cpf_digits <> '';
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_pacientes_nome_trgm
  ON public.pacientes USING gin (nome gin_trgm_ops)
  WHERE ativo;

CREATE INDEX IF NOT EXISTS idx_pacientes_nome_prefix
  ON public.pacientes (clinica_id, nome text_pattern_ops)
  WHERE ativo;
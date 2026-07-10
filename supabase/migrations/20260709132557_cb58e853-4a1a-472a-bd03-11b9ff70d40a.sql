CREATE INDEX IF NOT EXISTS idx_pacientes_nome_raw_trgm ON public.pacientes USING gin (nome gin_trgm_ops) WHERE ativo;
ANALYZE public.pacientes;
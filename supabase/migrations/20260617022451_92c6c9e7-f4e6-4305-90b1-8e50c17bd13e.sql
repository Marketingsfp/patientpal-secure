CREATE INDEX IF NOT EXISTS idx_pacientes_nome_norm_trgm
ON public.pacientes USING gin ((upper(public.strip_accents(nome))) gin_trgm_ops)
WHERE ativo;

REVOKE ALL ON FUNCTION public.buscar_pacientes(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buscar_pacientes(uuid, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_pacientes(uuid, text, integer) TO service_role;

ANALYZE public.pacientes;
CREATE INDEX IF NOT EXISTS idx_fin_lanc_cov_resumo
ON public.fin_lancamentos (clinica_id, data)
INCLUDE (tipo, status, valor);

ANALYZE public.fin_lancamentos;
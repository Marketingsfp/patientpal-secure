
-- 1) Estatísticas atualizadas: o planner passa a escolher os índices trigram existentes
ANALYZE public.pacientes;
ANALYZE public.agendamentos;
ANALYZE public.procedimentos;
ANALYZE public.orcamentos;
ANALYZE public.orcamento_itens;
ANALYZE public.medicos;
ANALYZE public.fin_lancamentos;

-- 2) Índice parcial para a lista "clientes ativos por nome" — cobre o ORDER BY nome + LIMIT
--    que hoje força seq-scan quando combinado com filtros ILIKE (top query, 1.87s média).
CREATE INDEX IF NOT EXISTS idx_pacientes_clinica_ativo_nome_only
  ON public.pacientes (clinica_id, nome)
  WHERE ativo = true;

-- 3) Índice combinado por (clinica_id, ativo, created_at DESC) para listar "recentes"
--    (usado por clientes-v2/clientes-shell.tsx no load inicial).
CREATE INDEX IF NOT EXISTS idx_pacientes_clinica_ativo_created
  ON public.pacientes (clinica_id, ativo, created_at DESC);

-- 4) Índice para a lista de procedimentos ativos (2.841 chamadas, 110ms média).
CREATE INDEX IF NOT EXISTS idx_procedimentos_clinica_ativo_nome
  ON public.procedimentos (clinica_id, nome)
  WHERE ativo = true;

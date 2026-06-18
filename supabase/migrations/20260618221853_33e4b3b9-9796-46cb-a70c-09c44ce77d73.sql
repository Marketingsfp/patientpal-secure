CREATE INDEX IF NOT EXISTS idx_pagamento_splits_pagamento ON public.pagamento_splits (pagamento_id);
CREATE INDEX IF NOT EXISTS idx_pagamento_splits_medico ON public.pagamento_splits (medico_id, clinica_id);
CREATE INDEX IF NOT EXISTS idx_pagamento_splits_clinica ON public.pagamento_splits (clinica_id);
CREATE INDEX IF NOT EXISTS idx_nfse_agendamento ON public.nfse (agendamento_id);
CREATE INDEX IF NOT EXISTS idx_nfse_pagamento ON public.nfse (pagamento_id);
CREATE INDEX IF NOT EXISTS idx_nfse_clinica_emissao ON public.nfse (clinica_id, data_emissao DESC);
CREATE INDEX IF NOT EXISTS idx_audit_record ON public.audit_log (record_id);
CREATE INDEX IF NOT EXISTS idx_psr_proc ON public.procedimento_split_regras (procedimento_id, ativo);
CREATE INDEX IF NOT EXISTS idx_procedimentos_clinica_nome ON public.procedimentos (clinica_id, nome);

-- RPC para popularidade de procedimentos (P4): substitui o loop client-side
-- de 20.000 linhas por um GROUP BY no banco, executando em milissegundos.
CREATE OR REPLACE FUNCTION public.procedimentos_popularidade(p_clinica_id uuid)
RETURNS TABLE(procedimento text, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT procedimento, count(*)::bigint AS total
  FROM public.agendamentos
  WHERE clinica_id = p_clinica_id AND procedimento IS NOT NULL
  GROUP BY procedimento
  ORDER BY total DESC
  LIMIT 500;
$$;
GRANT EXECUTE ON FUNCTION public.procedimentos_popularidade(uuid) TO authenticated;
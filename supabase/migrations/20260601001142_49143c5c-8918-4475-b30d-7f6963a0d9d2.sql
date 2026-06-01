ALTER TABLE public.estorno_solicitacoes
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'erro_caixa',
  ADD COLUMN IF NOT EXISTS data_pagamento_original date,
  ADD COLUMN IF NOT EXISTS data_estorno date;

ALTER TABLE public.estorno_solicitacoes
  DROP CONSTRAINT IF EXISTS estorno_tipo_chk;
ALTER TABLE public.estorno_solicitacoes
  ADD CONSTRAINT estorno_tipo_chk CHECK (tipo IN ('erro_caixa','devolucao'));

CREATE INDEX IF NOT EXISTS idx_estorno_tipo ON public.estorno_solicitacoes (clinica_id, tipo, status);
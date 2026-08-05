ALTER TABLE public.nfse ADD COLUMN IF NOT EXISTS pagamento_ids uuid[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_nfse_pagamento_ids_gin ON public.nfse USING GIN (pagamento_ids);
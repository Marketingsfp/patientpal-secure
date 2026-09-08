CREATE INDEX IF NOT EXISTS integracao_verificacoes_token_hash_idx
  ON public.integracao_verificacoes (token_hash)
  WHERE token_hash IS NOT NULL;

ALTER TABLE public.whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS tratada_internamente boolean NOT NULL DEFAULT false;
ALTER TABLE public.nfse ADD COLUMN IF NOT EXISTS chave_acesso text;
ALTER TABLE public.nfse ADD COLUMN IF NOT EXISTS retorno_conferencia jsonb;
CREATE INDEX IF NOT EXISTS idx_nfse_chave_acesso ON public.nfse (chave_acesso);
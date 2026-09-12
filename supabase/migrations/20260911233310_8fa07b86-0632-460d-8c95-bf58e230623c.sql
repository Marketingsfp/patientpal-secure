ALTER TABLE public.nina_correcao_execucoes
  ADD COLUMN IF NOT EXISTS idempotencia_chave text,
  ADD COLUMN IF NOT EXISTS resultado_final text,
  ADD COLUMN IF NOT EXISTS verificacao jsonb,
  ADD COLUMN IF NOT EXISTS alvo_revisao text,
  ADD COLUMN IF NOT EXISTS tentativas integer NOT NULL DEFAULT 0;

ALTER TABLE public.nina_correcao_execucoes
  DROP CONSTRAINT IF EXISTS nina_correcao_execucoes_resultado_final_check;

ALTER TABLE public.nina_correcao_execucoes
  ADD CONSTRAINT nina_correcao_execucoes_resultado_final_check
  CHECK (resultado_final IS NULL OR resultado_final IN ('preparado','aplicado','aguardando_publicacao','verificado','falhou'));

CREATE UNIQUE INDEX IF NOT EXISTS nina_correcao_execucoes_idem
  ON public.nina_correcao_execucoes (clinica_id, idempotencia_chave)
  WHERE idempotencia_chave IS NOT NULL;
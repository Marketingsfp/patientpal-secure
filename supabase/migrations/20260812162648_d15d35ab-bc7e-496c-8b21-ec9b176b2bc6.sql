ALTER TABLE public.triagens_enfermagem
  ADD COLUMN IF NOT EXISTS classificacao_risco text
  CHECK (classificacao_risco IS NULL OR classificacao_risco IN ('vermelho','laranja','amarelo','verde','azul'));

COMMENT ON COLUMN public.triagens_enfermagem.classificacao_risco IS 'Protocolo de Manchester: vermelho=emergencia, laranja=muito urgente, amarelo=urgente, verde=pouco urgente, azul=nao urgente';
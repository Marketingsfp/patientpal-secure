ALTER TABLE public.nina_confianca_decisoes
  ADD COLUMN IF NOT EXISTS avaliacao text NOT NULL DEFAULT 'action_safety',
  ADD COLUMN IF NOT EXISTS texto_final_hash text,
  ADD COLUMN IF NOT EXISTS claims jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nina_confianca_decisoes_avaliacao_chk'
  ) THEN
    ALTER TABLE public.nina_confianca_decisoes
      ADD CONSTRAINT nina_confianca_decisoes_avaliacao_chk
      CHECK (avaliacao IN ('action_safety', 'answer_confidence'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS nina_confianca_decisoes_exec_avaliacao_idx
  ON public.nina_confianca_decisoes (clinica_id, execucao_id, avaliacao, created_at DESC);
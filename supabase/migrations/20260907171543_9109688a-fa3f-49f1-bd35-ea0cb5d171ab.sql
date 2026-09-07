ALTER TABLE public.nina_confianca_decisoes
  ADD COLUMN IF NOT EXISTS message_id text,
  ADD COLUMN IF NOT EXISTS intencao text,
  ADD COLUMN IF NOT EXISTS acao_solicitada text,
  ADD COLUMN IF NOT EXISTS nivel text,
  ADD COLUMN IF NOT EXISTS decisao text,
  ADD COLUMN IF NOT EXISTS validadores jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS reason_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS fontes jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS ferramentas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS bloqueadores text[] NOT NULL DEFAULT ARRAY[]::text[],
  ADD COLUMN IF NOT EXISTS resultado_final text;

CREATE INDEX IF NOT EXISTS nina_confianca_decisoes_execucao_idx
  ON public.nina_confianca_decisoes (execucao_id, created_at DESC);
CREATE INDEX IF NOT EXISTS nina_confianca_decisoes_conversa_idx
  ON public.nina_confianca_decisoes (conversation_id, created_at DESC);
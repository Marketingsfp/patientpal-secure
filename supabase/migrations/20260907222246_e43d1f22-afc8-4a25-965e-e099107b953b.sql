ALTER TABLE public.nina_confianca_decisoes
  DROP CONSTRAINT IF EXISTS nina_confianca_decisoes_ambiente_check;
ALTER TABLE public.nina_confianca_decisoes
  ADD CONSTRAINT nina_confianca_decisoes_ambiente_check
  CHECK (ambiente = ANY (ARRAY['producao'::text,'homologacao'::text,'teste_automatizado'::text]));

ALTER TABLE public.nina_teste_execucao_itens
  ADD COLUMN IF NOT EXISTS confianca_amostras integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confianca_media numeric,
  ADD COLUMN IF NOT EXISTS confianca_min numeric,
  ADD COLUMN IF NOT EXISTS confianca_max numeric,
  ADD COLUMN IF NOT EXISTS confianca_niveis jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS confianca_nivel_minimo text,
  ADD COLUMN IF NOT EXISTS confianca_trace_ids text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_conf_dec_clinica_ambiente_conversa
  ON public.nina_confianca_decisoes (clinica_id, ambiente, conversation_id, created_at);
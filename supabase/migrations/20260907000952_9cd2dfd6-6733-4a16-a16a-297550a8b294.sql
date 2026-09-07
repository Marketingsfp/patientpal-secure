ALTER TABLE public.nina_execucoes
  ADD COLUMN IF NOT EXISTS prompt_versao_id uuid REFERENCES public.nina_instrucoes_versoes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prompt_versao integer,
  ADD COLUMN IF NOT EXISTS prompt_publicado_em timestamptz,
  ADD COLUMN IF NOT EXISTS prompt_origem text,
  ADD COLUMN IF NOT EXISTS prompt_modulos text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS nina_execucoes_prompt_versao_idx
  ON public.nina_execucoes (prompt_versao_id);

COMMENT ON COLUMN public.nina_execucoes.prompt_versao_id IS
  'FASE 6 — referência imutável à versão das Instruções da Nina usada nesta execução (não duplica o texto).';
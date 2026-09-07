ALTER TABLE public.nina_feedback_erros
  ADD COLUMN IF NOT EXISTS teste_tipo text,
  ADD COLUMN IF NOT EXISTS teste_execucao_id uuid,
  ADD COLUMN IF NOT EXISTS teste_lead_indice integer,
  ADD COLUMN IF NOT EXISTS teste_cenario_id uuid,
  ADD COLUMN IF NOT EXISTS avaliacao_id uuid,
  ADD COLUMN IF NOT EXISTS teste_evidencia jsonb,
  ADD COLUMN IF NOT EXISTS trace_ids text[],
  ADD COLUMN IF NOT EXISTS prompt_versao integer,
  ADD COLUMN IF NOT EXISTS regressao_cenario_id uuid;

ALTER TABLE public.nina_feedback_erros DROP CONSTRAINT IF EXISTS nina_fb_origem_chk;
ALTER TABLE public.nina_feedback_erros ADD CONSTRAINT nina_fb_origem_chk
  CHECK (origem = ANY (ARRAY['manual'::text, 'nina_message_quick_report'::text, 'nina_test_evaluation'::text]));

ALTER TABLE public.nina_feedback_erros DROP CONSTRAINT IF EXISTS nina_fb_teste_tipo_chk;
ALTER TABLE public.nina_feedback_erros ADD CONSTRAINT nina_fb_teste_tipo_chk
  CHECK (teste_tipo IS NULL OR teste_tipo = ANY (ARRAY['manual'::text, 'terra'::text, 'cenarios'::text, 'carga'::text]));

ALTER TABLE public.nina_feedback_erros
  ADD CONSTRAINT nina_fb_avaliacao_fk FOREIGN KEY (avaliacao_id)
  REFERENCES public.nina_teste_avaliacoes(id) ON DELETE SET NULL;

ALTER TABLE public.nina_feedback_erros
  ADD CONSTRAINT nina_fb_regressao_cenario_fk FOREIGN KEY (regressao_cenario_id)
  REFERENCES public.nina_teste_cenarios(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS nina_fb_avaliacao_idx ON public.nina_feedback_erros (avaliacao_id);
CREATE INDEX IF NOT EXISTS nina_fb_teste_exec_idx ON public.nina_feedback_erros (teste_tipo, teste_execucao_id);

ALTER TABLE public.nina_teste_cenarios
  ADD COLUMN IF NOT EXISTS origem_feedback_id uuid,
  ADD COLUMN IF NOT EXISTS origem_avaliacao_id uuid;

ALTER TABLE public.nina_teste_cenarios
  ADD CONSTRAINT nina_teste_cenarios_origem_feedback_fk FOREIGN KEY (origem_feedback_id)
  REFERENCES public.nina_feedback_erros(id) ON DELETE SET NULL;

ALTER TABLE public.nina_teste_cenarios
  ADD CONSTRAINT nina_teste_cenarios_origem_avaliacao_fk FOREIGN KEY (origem_avaliacao_id)
  REFERENCES public.nina_teste_avaliacoes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS nina_teste_cenarios_origem_fb_idx ON public.nina_teste_cenarios (origem_feedback_id);
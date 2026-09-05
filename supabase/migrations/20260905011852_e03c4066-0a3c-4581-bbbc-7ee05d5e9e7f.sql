ALTER TABLE public.nina_feedback_erros
  ADD COLUMN IF NOT EXISTS root_cause text,
  ADD COLUMN IF NOT EXISTS prioridade text,
  ADD COLUMN IF NOT EXISTS knowledge_status text,
  ADD COLUMN IF NOT EXISTS knowledge_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS knowledge_consultado_em timestamptz,
  ADD COLUMN IF NOT EXISTS grupo_chave text,
  ADD COLUMN IF NOT EXISTS grupo_titulo text,
  ADD COLUMN IF NOT EXISTS diagnosticado_por uuid,
  ADD COLUMN IF NOT EXISTS diagnosticado_em timestamptz;

ALTER TABLE public.nina_feedback_erros
  DROP CONSTRAINT IF EXISTS nina_feedback_erros_root_cause_chk;
ALTER TABLE public.nina_feedback_erros
  ADD CONSTRAINT nina_feedback_erros_root_cause_chk
  CHECK (root_cause IS NULL OR root_cause IN (
    'knowledge_error','knowledge_missing','retrieval_error','reasoning_error',
    'tool_error','hallucination','workflow_error'));

ALTER TABLE public.nina_feedback_erros
  DROP CONSTRAINT IF EXISTS nina_feedback_erros_prioridade_chk;
ALTER TABLE public.nina_feedback_erros
  ADD CONSTRAINT nina_feedback_erros_prioridade_chk
  CHECK (prioridade IS NULL OR prioridade IN ('critico','alto','normal'));

ALTER TABLE public.nina_feedback_erros
  DROP CONSTRAINT IF EXISTS nina_feedback_erros_knowledge_status_chk;
ALTER TABLE public.nina_feedback_erros
  ADD CONSTRAINT nina_feedback_erros_knowledge_status_chk
  CHECK (knowledge_status IS NULL OR knowledge_status IN ('found','not_found','conflict'));

CREATE INDEX IF NOT EXISTS nina_feedback_erros_grupo_idx
  ON public.nina_feedback_erros (clinica_id, grupo_chave);
CREATE INDEX IF NOT EXISTS nina_feedback_erros_prioridade_idx
  ON public.nina_feedback_erros (clinica_id, prioridade);
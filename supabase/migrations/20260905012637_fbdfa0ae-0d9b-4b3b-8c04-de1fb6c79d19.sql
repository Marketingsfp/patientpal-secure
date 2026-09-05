CREATE TABLE public.nina_feedback_acoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  feedback_id uuid NOT NULL REFERENCES public.nina_feedback_erros(id) ON DELETE CASCADE,
  root_cause text NOT NULL,
  camada text NOT NULL,
  tipo text NOT NULL,
  titulo text NOT NULL,
  instrucao text NOT NULL,
  valor_atual text,
  valor_novo text,
  status text NOT NULL DEFAULT 'open',
  evidencia jsonb,
  observacao text,
  criado_por uuid NOT NULL,
  concluido_por uuid,
  concluido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_fb_acoes_status_chk CHECK (status IN ('open','done','canceled')),
  CONSTRAINT nina_fb_acoes_camada_chk CHECK (camada IN ('planilha','busca','modelo','ferramenta','fluxo')),
  CONSTRAINT nina_fb_acoes_tipo_chk CHECK (tipo IN (
    'kb_update','kb_create','retrieval_fix','reasoning_fix','tool_fix','grounding_fix','workflow_fix')),
  CONSTRAINT nina_fb_acoes_root_cause_chk CHECK (root_cause IN (
    'knowledge_error','knowledge_missing','retrieval_error','reasoning_error',
    'tool_error','hallucination','workflow_error'))
);

CREATE INDEX nina_fb_acoes_clinica_idx ON public.nina_feedback_acoes (clinica_id, status, created_at DESC);
CREATE INDEX nina_fb_acoes_feedback_idx ON public.nina_feedback_acoes (feedback_id);

GRANT SELECT, INSERT, UPDATE ON public.nina_feedback_acoes TO authenticated;
GRANT ALL ON public.nina_feedback_acoes TO service_role;

ALTER TABLE public.nina_feedback_acoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY nina_fb_acoes_select ON public.nina_feedback_acoes FOR SELECT TO authenticated
  USING (is_member(auth.uid(), clinica_id));
CREATE POLICY nina_fb_acoes_insert ON public.nina_feedback_acoes FOR INSERT TO authenticated
  WITH CHECK (public.nina_fb_pode_revisar(auth.uid(), clinica_id) AND criado_por = auth.uid());
CREATE POLICY nina_fb_acoes_update ON public.nina_feedback_acoes FOR UPDATE TO authenticated
  USING (public.nina_fb_pode_revisar(auth.uid(), clinica_id))
  WITH CHECK (public.nina_fb_pode_revisar(auth.uid(), clinica_id));

CREATE TRIGGER nina_fb_acoes_touch BEFORE UPDATE ON public.nina_feedback_acoes
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

ALTER TABLE public.nina_feedback_erros
  ADD COLUMN IF NOT EXISTS aplicacao_tipo text,
  ADD COLUMN IF NOT EXISTS aplicacao_resumo text,
  ADD COLUMN IF NOT EXISTS aplicacao_evidencia jsonb,
  ADD COLUMN IF NOT EXISTS aplicado_por uuid,
  ADD COLUMN IF NOT EXISTS aplicado_em timestamptz;
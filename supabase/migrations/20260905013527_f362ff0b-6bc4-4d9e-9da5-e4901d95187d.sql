CREATE TABLE public.nina_feedback_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  feedback_id uuid NOT NULL REFERENCES public.nina_feedback_erros(id) ON DELETE CASCADE,
  acao_id uuid REFERENCES public.nina_feedback_acoes(id) ON DELETE SET NULL,
  versao integer NOT NULL DEFAULT 1,
  item text,
  valor_anterior text,
  valor_novo text,
  motivo text,
  camada text NOT NULL,
  tipo text NOT NULL,
  root_cause text,
  reportado_por uuid,
  aprovado_por uuid,
  aplicado_por uuid NOT NULL,
  kb_base_id_anterior uuid,
  kb_versao_anterior integer,
  kb_versao_nova integer,
  evidencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  teste_status text NOT NULL DEFAULT 'pendente',
  teste_em timestamptz,
  teste_resposta text,
  teste_detalhe jsonb,
  status text NOT NULL DEFAULT 'active',
  revertido_por uuid,
  revertido_em timestamptz,
  motivo_reversao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_fb_versoes_status_chk CHECK (status IN ('active','reverted')),
  CONSTRAINT nina_fb_versoes_teste_chk CHECK (teste_status IN ('pendente','nao_aplicavel','validado','falhou'))
);

GRANT SELECT, INSERT, UPDATE ON public.nina_feedback_versoes TO authenticated;
GRANT ALL ON public.nina_feedback_versoes TO service_role;

ALTER TABLE public.nina_feedback_versoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros da clinica veem versoes"
  ON public.nina_feedback_versoes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clinica_memberships m
                 WHERE m.clinica_id = nina_feedback_versoes.clinica_id
                   AND m.user_id = auth.uid()));

CREATE POLICY "Revisores registram versoes"
  ON public.nina_feedback_versoes FOR INSERT TO authenticated
  WITH CHECK (public.nina_fb_pode_revisar(auth.uid(), clinica_id) AND aplicado_por = auth.uid());

CREATE POLICY "Revisores atualizam versoes"
  ON public.nina_feedback_versoes FOR UPDATE TO authenticated
  USING (public.nina_fb_pode_revisar(auth.uid(), clinica_id))
  WITH CHECK (public.nina_fb_pode_revisar(auth.uid(), clinica_id));

CREATE INDEX idx_nina_fb_versoes_feedback ON public.nina_feedback_versoes (feedback_id, versao DESC);
CREATE INDEX idx_nina_fb_versoes_clinica ON public.nina_feedback_versoes (clinica_id, created_at DESC);

CREATE TRIGGER trg_nina_fb_versoes_updated
  BEFORE UPDATE ON public.nina_feedback_versoes
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

ALTER TABLE public.nina_feedback_erros
  ADD COLUMN IF NOT EXISTS validacao_status text,
  ADD COLUMN IF NOT EXISTS validacao_em timestamptz,
  ADD COLUMN IF NOT EXISTS validacao_resposta text,
  ADD COLUMN IF NOT EXISTS revertido_por uuid,
  ADD COLUMN IF NOT EXISTS revertido_em timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_reversao text;

ALTER TABLE public.nina_feedback_erros
  ADD CONSTRAINT nina_fb_validacao_chk
  CHECK (validacao_status IS NULL OR validacao_status IN ('pendente','nao_aplicavel','validado','falhou'));

ALTER TABLE public.nina_feedback_acoes
  ADD COLUMN IF NOT EXISTS homologado boolean NOT NULL DEFAULT false;
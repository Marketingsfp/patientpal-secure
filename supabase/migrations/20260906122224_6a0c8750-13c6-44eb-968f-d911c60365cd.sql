ALTER TABLE public.nina_feedback_erros
  ADD COLUMN IF NOT EXISTS decisao_humana text,
  ADD COLUMN IF NOT EXISTS decidido_por uuid,
  ADD COLUMN IF NOT EXISTS decidido_em timestamptz;

ALTER TABLE public.nina_feedback_erros DROP CONSTRAINT IF EXISTS nina_fb_decisao_chk;
ALTER TABLE public.nina_feedback_erros ADD CONSTRAINT nina_fb_decisao_chk
  CHECK (decisao_humana IS NULL OR decisao_humana IN ('problema_confirmado','falso_positivo'));

CREATE TABLE IF NOT EXISTS public.nina_feedback_decisoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  feedback_id uuid NOT NULL REFERENCES public.nina_feedback_erros(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN (
    'problema_confirmado','falso_positivo','classificacao_ajustada','sugestao_editada',
    'em_revisao','aprovado','rejeitado','rascunho_ia_usado','reaberto'
  )),
  status_antes text,
  status_depois text,
  causa_antes text,
  causa_depois text,
  observacao text,
  analise_id uuid,
  analise_versao integer,
  autor uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.nina_feedback_decisoes TO authenticated;
GRANT ALL ON public.nina_feedback_decisoes TO service_role;

ALTER TABLE public.nina_feedback_decisoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nina_fb_dec_select ON public.nina_feedback_decisoes;
CREATE POLICY nina_fb_dec_select ON public.nina_feedback_decisoes FOR SELECT TO authenticated
  USING (public.nina_fb_pode_revisar(auth.uid(), clinica_id));

DROP POLICY IF EXISTS nina_fb_dec_insert ON public.nina_feedback_decisoes;
CREATE POLICY nina_fb_dec_insert ON public.nina_feedback_decisoes FOR INSERT TO authenticated
  WITH CHECK (public.nina_fb_pode_revisar(auth.uid(), clinica_id) AND autor = auth.uid());

CREATE INDEX IF NOT EXISTS nina_fb_dec_feedback_idx
  ON public.nina_feedback_decisoes (feedback_id, created_at DESC);
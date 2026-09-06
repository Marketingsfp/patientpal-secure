CREATE TABLE IF NOT EXISTS public.nina_feedback_analises (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  feedback_id uuid NOT NULL REFERENCES public.nina_feedback_erros(id) ON DELETE CASCADE,
  execucao_id uuid,
  versao integer NOT NULL DEFAULT 1,
  criterios_versao text NOT NULL,
  modelo text NOT NULL,
  status text NOT NULL DEFAULT 'processing',
  conclusao text,
  resultado jsonb,
  evidencias_resumo jsonb,
  input_tokens integer,
  output_tokens integer,
  duracao_ms integer,
  erro text,
  solicitado_por uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  concluida_em timestamptz,
  CONSTRAINT nina_fb_analise_status_chk CHECK (status IN ('processing','done','failed'))
);

CREATE INDEX IF NOT EXISTS nina_fb_analises_feedback_idx
  ON public.nina_feedback_analises (feedback_id, versao DESC);

CREATE UNIQUE INDEX IF NOT EXISTS nina_fb_analises_uma_em_curso_idx
  ON public.nina_feedback_analises (feedback_id)
  WHERE status = 'processing';

CREATE UNIQUE INDEX IF NOT EXISTS nina_fb_analises_versao_idx
  ON public.nina_feedback_analises (feedback_id, versao);

GRANT SELECT, INSERT, UPDATE ON public.nina_feedback_analises TO authenticated;
GRANT ALL ON public.nina_feedback_analises TO service_role;

ALTER TABLE public.nina_feedback_analises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Revisores veem analises da clinica"
  ON public.nina_feedback_analises FOR SELECT TO authenticated
  USING (public.nina_fb_pode_revisar(auth.uid(), clinica_id));

CREATE POLICY "Revisores criam analises da clinica"
  ON public.nina_feedback_analises FOR INSERT TO authenticated
  WITH CHECK (public.nina_fb_pode_revisar(auth.uid(), clinica_id) AND solicitado_por = auth.uid());

CREATE POLICY "Revisores atualizam analises da clinica"
  ON public.nina_feedback_analises FOR UPDATE TO authenticated
  USING (public.nina_fb_pode_revisar(auth.uid(), clinica_id))
  WITH CHECK (public.nina_fb_pode_revisar(auth.uid(), clinica_id));
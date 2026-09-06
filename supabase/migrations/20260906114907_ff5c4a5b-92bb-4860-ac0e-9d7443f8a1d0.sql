ALTER TABLE public.nina_execucoes
  ADD COLUMN IF NOT EXISTS mensagens_entrada uuid[] NOT NULL DEFAULT '{}'::uuid[];

COMMENT ON COLUMN public.nina_execucoes.mensagens_entrada IS
  'IDs das mensagens de entrada do paciente realmente usadas para produzir esta resposta (ordem cronológica).';

CREATE TABLE IF NOT EXISTS public.nina_execucao_evidencias (
  execucao_id uuid PRIMARY KEY REFERENCES public.nina_execucoes(id) ON DELETE CASCADE,
  clinica_id uuid,
  etapas jsonb NOT NULL DEFAULT '[]'::jsonb,
  lacunas text[] NOT NULL DEFAULT '{}'::text[],
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nina_execucao_evidencias IS
  'Evidências preservadas da execução da Nina (snapshot histórico). Nunca é reescrita por alterações posteriores no catálogo.';

GRANT SELECT ON public.nina_execucao_evidencias TO authenticated;
GRANT ALL ON public.nina_execucao_evidencias TO service_role;

ALTER TABLE public.nina_execucao_evidencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nina_execucao_evidencias_select"
  ON public.nina_execucao_evidencias
  FOR SELECT
  TO authenticated
  USING (clinica_id IS NOT NULL AND public.is_member(auth.uid(), clinica_id));

CREATE INDEX IF NOT EXISTS idx_nina_evidencias_clinica
  ON public.nina_execucao_evidencias (clinica_id, created_at DESC);
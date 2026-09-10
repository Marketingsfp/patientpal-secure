CREATE TABLE IF NOT EXISTS public.nina_mensagens_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid REFERENCES public.clinicas(id) ON DELETE CASCADE,
  escopo text NOT NULL DEFAULT 'whatsapp',
  chave text NOT NULL,
  texto text NOT NULL,
  categoria text NOT NULL DEFAULT 'fluxo',
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicada', 'arquivada')),
  versao integer NOT NULL DEFAULT 1,
  instrucoes_versao_id uuid,
  publicado_em timestamptz,
  publicado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS nina_mensagens_templates_pub_clinica
  ON public.nina_mensagens_templates (clinica_id, escopo, chave)
  WHERE status = 'publicada' AND clinica_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS nina_mensagens_templates_pub_global
  ON public.nina_mensagens_templates (escopo, chave)
  WHERE status = 'publicada' AND clinica_id IS NULL;

CREATE INDEX IF NOT EXISTS nina_mensagens_templates_busca
  ON public.nina_mensagens_templates (escopo, chave, status);

GRANT SELECT ON public.nina_mensagens_templates TO authenticated;
GRANT ALL ON public.nina_mensagens_templates TO service_role;

ALTER TABLE public.nina_mensagens_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "templates nina leitura" ON public.nina_mensagens_templates;
CREATE POLICY "templates nina leitura"
  ON public.nina_mensagens_templates FOR SELECT
  TO authenticated
  USING (
    clinica_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.clinica_memberships m
      WHERE m.clinica_id = nina_mensagens_templates.clinica_id
        AND m.user_id = auth.uid()
        AND m.ativo = true
    )
  );
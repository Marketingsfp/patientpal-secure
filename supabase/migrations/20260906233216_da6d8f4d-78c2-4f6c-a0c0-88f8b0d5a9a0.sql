CREATE TABLE public.nina_instrucoes_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  escopo text NOT NULL CHECK (escopo IN ('whatsapp', 'painel_interno')),
  versao integer NOT NULL,
  conteudo text NOT NULL,
  status text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicada', 'arquivada')),
  comentario text NULL,
  versao_anterior_id uuid NULL REFERENCES public.nina_instrucoes_versoes(id) ON DELETE SET NULL,
  criado_por uuid NULL,
  publicado_por uuid NULL,
  publicado_em timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX nina_instrucoes_versao_unica_clinica
  ON public.nina_instrucoes_versoes (clinica_id, escopo, versao)
  WHERE clinica_id IS NOT NULL;

CREATE UNIQUE INDEX nina_instrucoes_versao_unica_global
  ON public.nina_instrucoes_versoes (escopo, versao)
  WHERE clinica_id IS NULL;

CREATE UNIQUE INDEX nina_instrucoes_publicada_unica_clinica
  ON public.nina_instrucoes_versoes (clinica_id, escopo)
  WHERE clinica_id IS NOT NULL AND status = 'publicada';

CREATE UNIQUE INDEX nina_instrucoes_publicada_unica_global
  ON public.nina_instrucoes_versoes (escopo)
  WHERE clinica_id IS NULL AND status = 'publicada';

CREATE INDEX nina_instrucoes_busca
  ON public.nina_instrucoes_versoes (escopo, clinica_id, status, versao DESC);

GRANT SELECT, INSERT, UPDATE ON public.nina_instrucoes_versoes TO authenticated;
GRANT ALL ON public.nina_instrucoes_versoes TO service_role;

ALTER TABLE public.nina_instrucoes_versoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nina_instrucoes_select"
  ON public.nina_instrucoes_versoes FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinica_memberships m
      WHERE m.user_id = auth.uid()
        AND m.ativo
        AND (nina_instrucoes_versoes.clinica_id IS NULL OR m.clinica_id = nina_instrucoes_versoes.clinica_id)
    )
  );

CREATE POLICY "nina_instrucoes_insert"
  ON public.nina_instrucoes_versoes FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinica_memberships m
      WHERE m.user_id = auth.uid()
        AND m.ativo
        AND m.role = ANY (ARRAY['admin'::public.app_role, 'gestor'::public.app_role])
        AND (nina_instrucoes_versoes.clinica_id IS NULL OR m.clinica_id = nina_instrucoes_versoes.clinica_id)
    )
  );

CREATE POLICY "nina_instrucoes_update"
  ON public.nina_instrucoes_versoes FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinica_memberships m
      WHERE m.user_id = auth.uid()
        AND m.ativo
        AND m.role = ANY (ARRAY['admin'::public.app_role, 'gestor'::public.app_role])
        AND (nina_instrucoes_versoes.clinica_id IS NULL OR m.clinica_id = nina_instrucoes_versoes.clinica_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.clinica_memberships m
      WHERE m.user_id = auth.uid()
        AND m.ativo
        AND m.role = ANY (ARRAY['admin'::public.app_role, 'gestor'::public.app_role])
        AND (nina_instrucoes_versoes.clinica_id IS NULL OR m.clinica_id = nina_instrucoes_versoes.clinica_id)
    )
  );

CREATE TRIGGER nina_instrucoes_versoes_touch
  BEFORE UPDATE ON public.nina_instrucoes_versoes
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- Enum de categoria
DO $$ BEGIN
  CREATE TYPE public.odonto_imagem_categoria AS ENUM (
    'intraoral','extraoral','radiografia_periapical','radiografia_panoramica',
    'tomografia','foto_documentacao','outro'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tabela
CREATE TABLE IF NOT EXISTS public.odonto_imagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  paciente_id UUID NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  prontuario_id UUID REFERENCES public.odonto_prontuarios(id) ON DELETE SET NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  tamanho_bytes BIGINT,
  largura INT,
  altura INT,
  categoria public.odonto_imagem_categoria NOT NULL DEFAULT 'foto_documentacao',
  dentes INT[] NOT NULL DEFAULT '{}',
  data_exame DATE NOT NULL DEFAULT CURRENT_DATE,
  descricao TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deletado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_odonto_imagens_paciente ON public.odonto_imagens(paciente_id) WHERE deletado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_odonto_imagens_clinica ON public.odonto_imagens(clinica_id) WHERE deletado_em IS NULL;
CREATE INDEX IF NOT EXISTS idx_odonto_imagens_dentes ON public.odonto_imagens USING GIN (dentes);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.odonto_imagens TO authenticated;
GRANT ALL ON public.odonto_imagens TO service_role;

ALTER TABLE public.odonto_imagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "odonto_imagens_select" ON public.odonto_imagens;
CREATE POLICY "odonto_imagens_select" ON public.odonto_imagens FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

DROP POLICY IF EXISTS "odonto_imagens_insert" ON public.odonto_imagens;
CREATE POLICY "odonto_imagens_insert" ON public.odonto_imagens FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), clinica_id));

DROP POLICY IF EXISTS "odonto_imagens_update" ON public.odonto_imagens;
CREATE POLICY "odonto_imagens_update" ON public.odonto_imagens FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid(), clinica_id))
  WITH CHECK (public.is_member(auth.uid(), clinica_id));

DROP POLICY IF EXISTS "odonto_imagens_delete" ON public.odonto_imagens;
CREATE POLICY "odonto_imagens_delete" ON public.odonto_imagens FOR DELETE TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.tg_odonto_imagens_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_odonto_imagens_updated_at ON public.odonto_imagens;
CREATE TRIGGER trg_odonto_imagens_updated_at
  BEFORE UPDATE ON public.odonto_imagens
  FOR EACH ROW EXECUTE FUNCTION public.tg_odonto_imagens_updated_at();

-- Políticas do bucket de storage (path = <clinica_id>/<paciente_id>/<uuid>.<ext>)
DROP POLICY IF EXISTS "odonto_imagens_storage_select" ON storage.objects;
CREATE POLICY "odonto_imagens_storage_select" ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'odonto-imagens'
    AND public.is_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS "odonto_imagens_storage_insert" ON storage.objects;
CREATE POLICY "odonto_imagens_storage_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'odonto-imagens'
    AND public.is_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS "odonto_imagens_storage_update" ON storage.objects;
CREATE POLICY "odonto_imagens_storage_update" ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'odonto-imagens'
    AND public.is_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

DROP POLICY IF EXISTS "odonto_imagens_storage_delete" ON storage.objects;
CREATE POLICY "odonto_imagens_storage_delete" ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'odonto-imagens'
    AND public.is_member(auth.uid(), (split_part(name, '/', 1))::uuid)
  );

-- Extensões
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Policy leitura do bucket privado (admin da clínica pasta do 1º nível = clinica_id)
DROP POLICY IF EXISTS "backups admin read" ON storage.objects;
CREATE POLICY "backups admin read"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'backups-diarios'
    AND EXISTS (
      SELECT 1 FROM public.clinica_memberships m
      WHERE m.user_id = auth.uid()
        AND m.role = 'admin'
        AND (storage.foldername(name))[1] = m.clinica_id::text
    )
  );

-- Log das execuções
CREATE TABLE IF NOT EXISTS public.backup_execucoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID REFERENCES public.clinicas(id) ON DELETE CASCADE,
  data_ref DATE NOT NULL,
  iniciado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'em_andamento',
  tabelas INTEGER,
  arquivos INTEGER,
  bytes BIGINT,
  erro TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.backup_execucoes TO authenticated;
GRANT ALL ON public.backup_execucoes TO service_role;

ALTER TABLE public.backup_execucoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "backup_execucoes admin read" ON public.backup_execucoes;
CREATE POLICY "backup_execucoes admin read"
  ON public.backup_execucoes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinica_memberships m
      WHERE m.user_id = auth.uid()
        AND m.role = 'admin'
        AND m.clinica_id = backup_execucoes.clinica_id
    )
  );

CREATE INDEX IF NOT EXISTS idx_backup_execucoes_clinica_data
  ON public.backup_execucoes (clinica_id, data_ref DESC);

DROP TRIGGER IF EXISTS backup_execucoes_touch ON public.backup_execucoes;
CREATE TRIGGER backup_execucoes_touch
  BEFORE UPDATE ON public.backup_execucoes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
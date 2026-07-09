ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS ficha_numero smallint;
ALTER TABLE public.gr_impressoes ADD COLUMN IF NOT EXISTS ficha_numero smallint;
CREATE INDEX IF NOT EXISTS idx_agendamentos_ficha_dia ON public.agendamentos (clinica_id, inicio) WHERE ficha_numero IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'agendamentos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamentos;
  END IF;
END $$;

ALTER TABLE public.agendamentos REPLICA IDENTITY FULL;
ALTER TABLE public.whatsapp_mensagens ADD COLUMN IF NOT EXISTS transcricao text;
ALTER TABLE public.whatsapp_mensagens REPLICA IDENTITY FULL;
ALTER TABLE public.atend_conversas REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_rel pr JOIN pg_publication p ON p.oid=pr.prpubid JOIN pg_class c ON c.oid=pr.prrelid WHERE p.pubname='supabase_realtime' AND c.relname='whatsapp_mensagens') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_mensagens';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_rel pr JOIN pg_publication p ON p.oid=pr.prpubid JOIN pg_class c ON c.oid=pr.prrelid WHERE p.pubname='supabase_realtime' AND c.relname='atend_conversas') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.atend_conversas';
  END IF;
END $$;
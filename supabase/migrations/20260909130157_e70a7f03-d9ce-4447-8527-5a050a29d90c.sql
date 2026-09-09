DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'atend_conversa_eventos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.atend_conversa_eventos;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_rel pr
    JOIN pg_publication p ON p.oid = pr.prpubid
    JOIN pg_class c ON c.oid = pr.prrelid
    WHERE p.pubname = 'supabase_realtime' AND c.relname = 'atend_handoff_resumos'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.atend_handoff_resumos;
  END IF;
END $$;

ALTER TABLE public.atend_conversa_eventos REPLICA IDENTITY FULL;
ALTER TABLE public.atend_handoff_resumos REPLICA IDENTITY FULL;
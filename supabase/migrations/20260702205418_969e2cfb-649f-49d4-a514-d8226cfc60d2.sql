ALTER TABLE public.agendamentos REPLICA IDENTITY FULL;
DO $$
BEGIN
  BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamentos;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END $$;
ALTER PUBLICATION supabase_realtime ADD TABLE public.whatsapp_mensagens;
ALTER TABLE public.whatsapp_mensagens REPLICA IDENTITY FULL;
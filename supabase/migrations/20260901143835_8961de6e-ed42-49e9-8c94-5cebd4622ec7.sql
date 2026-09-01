ALTER TABLE public.whatsapp_mensagens DROP CONSTRAINT IF EXISTS whatsapp_mensagens_enviada_por_check;
ALTER TABLE public.whatsapp_mensagens ADD CONSTRAINT whatsapp_mensagens_enviada_por_check
  CHECK (enviada_por = ANY (ARRAY['paciente'::text,'nina'::text,'humano'::text,'sistema'::text]));
ALTER TABLE public.whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS client_message_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_mensagens_clinica_client_msg_uidx
  ON public.whatsapp_mensagens (clinica_id, client_message_id)
  WHERE client_message_id IS NOT NULL;
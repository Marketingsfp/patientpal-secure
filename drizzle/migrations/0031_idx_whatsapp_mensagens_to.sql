CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_to
  ON public.whatsapp_mensagens (clinica_id, to_number, created_at DESC);
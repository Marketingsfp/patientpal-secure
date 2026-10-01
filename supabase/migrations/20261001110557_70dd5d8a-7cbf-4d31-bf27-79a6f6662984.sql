CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_midia_por_idade
  ON public.whatsapp_mensagens (clinica_id, recebida_em)
  WHERE media_url IS NOT NULL;
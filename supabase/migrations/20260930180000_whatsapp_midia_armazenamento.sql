-- Imagens e áudios recebidos no WhatsApp: armazenamento PRIVADO.
--   * O arquivo é baixado da Meta na chegada (a URL dela vale poucos minutos) e guardado aqui.
--   * `whatsapp_mensagens.media_url` passa a guardar o CAMINHO no bucket ({clinica}/{ano-mês}/{id}.ext).
--   * Sem nenhuma política de leitura/escrita para usuários: só o servidor (service role) acessa, e a
--     atendente vê por link assinado de vida curta, gerado depois de conferir o acesso à conversa.
--   * Retenção de 30 dias: o servidor apaga o arquivo e o vínculo; o texto e a transcrição ficam.
BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'whatsapp-midia',
  'whatsapp-midia',
  false,
  16777216,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp',
    'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/amr', 'audio/wav'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Limpeza por idade sem varrer a tabela toda (só mensagens que ainda têm arquivo).
CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_midia_por_idade
  ON public.whatsapp_mensagens (clinica_id, recebida_em)
  WHERE media_url IS NOT NULL;

COMMIT;

-- Desempenho para ~1.500 conversas/dia (16/10/2026).
--
-- A cada resposta, a Nina busca o histórico do telefone do paciente com
-- "from_number = X OR to_number = X" (src/lib/whatsapp.server.ts). O lado do
-- remetente já tem índice (idx_whatsapp_mensagens_from); o do destinatário não,
-- e com milhões de mensagens (retenção de 6 meses) a busca tenderia a varrer a
-- tabela em toda resposta. Com os dois índices, o banco combina as duas buscas.
--
-- Criado agora, com a tabela pequena, para não travar gravações depois.
-- Só leitura mais rápida: nenhuma regra, dado ou permissão muda.
CREATE INDEX IF NOT EXISTS idx_whatsapp_mensagens_to
  ON public.whatsapp_mensagens (clinica_id, to_number, created_at DESC);

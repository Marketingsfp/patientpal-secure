-- FASE 6 — o gatilho que liga a mensagem recebida à conversa compara o
-- telefone apenas com os dígitos (regexp_replace). Sem índice para essa
-- expressão, o banco precisava filtrar linha a linha dentro da clínica.
-- O índice abaixo espelha EXATAMENTE a expressão usada pelo gatilho, então a
-- regra de comparação (incluindo DDI) permanece intocada.
CREATE INDEX IF NOT EXISTS idx_atend_conv_digitos_canal
  ON public.atend_conversas (
    clinica_id,
    canal,
    (regexp_replace(COALESCE(contato_telefone, ''), '\D', '', 'g')),
    created_at
  );
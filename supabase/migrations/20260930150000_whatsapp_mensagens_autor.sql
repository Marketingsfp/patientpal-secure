-- Autor da mensagem enviada por pessoa (30/09/2026).
--
-- Até aqui a mensagem saída de uma pessoa só dizia "humano", sem quem escreveu. Com a supervisão
-- (gestor/admin) respondendo no mesmo chat da atendente, é preciso registrar quem respondeu e com
-- qual perfil, da mesma forma que a resposta da Nina é identificada.
--
--  * enviada_por continua 'humano' (métricas e regras de espera dependem disso).
--  * enviada_por_user_id = quem enviou; enviada_por_perfil = perfil exato quando quem enviou é da
--    supervisão ('admin' ou 'gestor'); NULL para atendentes comuns.
--  * Sem preenchimento retroativo: mensagens antigas ficam com NULL.
ALTER TABLE public.whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS enviada_por_user_id uuid,
  ADD COLUMN IF NOT EXISTS enviada_por_perfil text;

COMMENT ON COLUMN public.whatsapp_mensagens.enviada_por_user_id IS
  'Usuário que enviou a mensagem (enviada_por = humano). NULL em mensagens anteriores a 30/09/2026 e nas da Nina/sistema.';
COMMENT ON COLUMN public.whatsapp_mensagens.enviada_por_perfil IS
  'Perfil de supervisão de quem enviou no momento do envio (admin ou gestor). NULL para atendentes comuns e em mensagens antigas.';

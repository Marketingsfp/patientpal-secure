ALTER TABLE public.whatsapp_mensagens
  ADD COLUMN IF NOT EXISTS enviada_por_user_id uuid,
  ADD COLUMN IF NOT EXISTS enviada_por_perfil text;

COMMENT ON COLUMN public.whatsapp_mensagens.enviada_por_user_id IS
  'Usuário que enviou a mensagem (enviada_por = humano). NULL em mensagens anteriores a 30/09/2026 e nas da Nina/sistema.';
COMMENT ON COLUMN public.whatsapp_mensagens.enviada_por_perfil IS
  'Perfil de supervisão de quem enviou no momento do envio (admin ou gestor). NULL para atendentes comuns e em mensagens antigas.';
ALTER TABLE public.atend_conversas
  ADD COLUMN IF NOT EXISTS last_assigned_user_id uuid,
  ADD COLUMN IF NOT EXISTS resolved_by uuid;

COMMENT ON COLUMN public.atend_conversas.last_assigned_user_id IS 'Último atendente humano responsável (histórico; não define responsável ativo).';
COMMENT ON COLUMN public.atend_conversas.resolved_by IS 'Usuário que clicou em Resolver na última sessão encerrada.';
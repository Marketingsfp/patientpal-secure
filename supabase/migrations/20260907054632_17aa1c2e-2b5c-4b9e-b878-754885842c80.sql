ALTER TABLE public.nina_feedback_erros
  ADD COLUMN IF NOT EXISTS contato_paciente_id uuid,
  ADD COLUMN IF NOT EXISTS contato_telefone text,
  ADD COLUMN IF NOT EXISTS protocolo_atendimento text,
  ADD COLUMN IF NOT EXISTS protocolo_sessao_id text,
  ADD COLUMN IF NOT EXISTS prompt_versao_id uuid,
  ADD COLUMN IF NOT EXISTS teste_ciclo_id uuid,
  ADD COLUMN IF NOT EXISTS trace_id text;

CREATE INDEX IF NOT EXISTS nina_feedback_erros_conversa_mensagem_idx
  ON public.nina_feedback_erros (clinica_id, conversa_id, mensagem_id);
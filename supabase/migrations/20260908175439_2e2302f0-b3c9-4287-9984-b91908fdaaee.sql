ALTER TABLE public.nina_confianca_decisoes
  ADD COLUMN IF NOT EXISTS outgoing_message_id uuid,
  ADD COLUMN IF NOT EXISTS nina_session_id text,
  ADD COLUMN IF NOT EXISTS engine_version text;

CREATE INDEX IF NOT EXISTS nina_confianca_decisoes_outgoing_msg_idx
  ON public.nina_confianca_decisoes (clinica_id, outgoing_message_id)
  WHERE outgoing_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS nina_confianca_decisoes_exec_avaliacao_idx
  ON public.nina_confianca_decisoes (clinica_id, execucao_id, avaliacao, created_at DESC);
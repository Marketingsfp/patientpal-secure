CREATE TABLE IF NOT EXISTS public.nina_prompt_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execucao_id uuid NOT NULL UNIQUE REFERENCES public.nina_execucoes(id) ON DELETE CASCADE,
  clinica_id uuid,
  conversation_id uuid,
  message_id uuid,
  escopo text NOT NULL DEFAULT 'whatsapp',
  prompt_versao_id uuid,
  prompt_versao integer,
  prompt_publicado_em timestamptz,
  prompt_origem text,
  behavior_prompt_template text,
  behavior_prompt_rendered text,
  behavior_prompt_hash text,
  runtime_context jsonb,
  envelope_tecnico text,
  request_final text,
  model text,
  model_parameters jsonb,
  tool_schemas jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS nina_prompt_snapshots_conversa_idx
  ON public.nina_prompt_snapshots (clinica_id, conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS nina_prompt_snapshots_message_idx
  ON public.nina_prompt_snapshots (message_id);

GRANT SELECT ON public.nina_prompt_snapshots TO authenticated;
GRANT ALL ON public.nina_prompt_snapshots TO service_role;

ALTER TABLE public.nina_prompt_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS nina_prompt_snapshots_select ON public.nina_prompt_snapshots;
CREATE POLICY nina_prompt_snapshots_select
  ON public.nina_prompt_snapshots FOR SELECT TO authenticated
  USING (
    clinica_id IS NOT NULL
    AND public.is_member(auth.uid(), clinica_id)
    AND public.can_manage_clinica(auth.uid(), clinica_id)
  );
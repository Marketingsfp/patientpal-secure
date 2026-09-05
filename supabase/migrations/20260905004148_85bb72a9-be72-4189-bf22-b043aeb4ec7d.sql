CREATE TABLE IF NOT EXISTS public.nina_execucoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID,
  conversation_id TEXT,
  perfil TEXT NOT NULL,
  model TEXT NOT NULL,
  thinking_level TEXT NOT NULL,
  route_reason TEXT NOT NULL,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  knowledge_status TEXT,
  tool_calls TEXT[] NOT NULL DEFAULT '{}',
  success BOOLEAN NOT NULL DEFAULT true,
  error_category TEXT,
  handoff BOOLEAN NOT NULL DEFAULT false,
  input_tokens INTEGER,
  output_tokens INTEGER,
  retries INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT nina_execucoes_nivel_chk CHECK (thinking_level = ANY (ARRAY['low'::text,'medium'::text,'high'::text])),
  CONSTRAINT nina_execucoes_motivo_chk CHECK (route_reason = ANY (ARRAY['simple_faq'::text,'direct_knowledge_lookup'::text,'appointment_tool_required'::text,'multiple_constraints'::text,'conflicting_results'::text])),
  CONSTRAINT nina_execucoes_knowledge_chk CHECK (knowledge_status IS NULL OR knowledge_status = ANY (ARRAY['found'::text,'not_found'::text,'conflict'::text]))
);

CREATE INDEX IF NOT EXISTS idx_nina_execucoes_clinica_data ON public.nina_execucoes (clinica_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_nina_execucoes_conversa ON public.nina_execucoes (conversation_id, created_at DESC);

GRANT SELECT ON public.nina_execucoes TO authenticated;
GRANT ALL ON public.nina_execucoes TO service_role;

ALTER TABLE public.nina_execucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nina_execucoes_select" ON public.nina_execucoes
  FOR SELECT TO authenticated USING (clinica_id IS NOT NULL AND is_member(auth.uid(), clinica_id));
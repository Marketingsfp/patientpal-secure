CREATE TABLE IF NOT EXISTS public.nina_trace_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid,
  trace_id text NOT NULL,
  execution_id text NOT NULL,
  conversation_id text,
  message_id text,
  cycle_id integer NOT NULL DEFAULT 1,
  node_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('started','completed','failed','skipped','retry','cancelled')),
  started_at timestamp with time zone NOT NULL,
  finished_at timestamp with time zone,
  duration_ms integer,
  status text NOT NULL CHECK (status IN ('running','ok','error','skipped','cancelled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.nina_trace_eventos IS
  'Trace por etapa das execucoes da Nina: por quais componentes a mensagem passou, duracao e resultado. Sem segredos; dados pessoais mascarados na origem.';

GRANT SELECT ON public.nina_trace_eventos TO authenticated;
GRANT ALL ON public.nina_trace_eventos TO service_role;

ALTER TABLE public.nina_trace_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nina_trace_eventos_select"
  ON public.nina_trace_eventos
  FOR SELECT
  TO authenticated
  USING (clinica_id IS NOT NULL AND public.is_member(auth.uid(), clinica_id));

CREATE INDEX IF NOT EXISTS idx_nina_trace_eventos_trace
  ON public.nina_trace_eventos (trace_id, started_at);

CREATE INDEX IF NOT EXISTS idx_nina_trace_eventos_clinica
  ON public.nina_trace_eventos (clinica_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nina_trace_eventos_execucao
  ON public.nina_trace_eventos (execution_id);
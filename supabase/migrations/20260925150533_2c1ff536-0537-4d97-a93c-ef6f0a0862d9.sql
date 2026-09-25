CREATE TABLE public.nina_jev_decisoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid,
  conversation_id text,
  fase text NOT NULL,
  teste boolean NOT NULL DEFAULT true,
  perguntas jsonb NOT NULL DEFAULT '{}'::jsonb,
  respostas jsonb,
  aplicada boolean NOT NULL DEFAULT false,
  latency_ms integer,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.nina_jev_decisoes TO service_role;
GRANT SELECT ON public.nina_jev_decisoes TO authenticated;
ALTER TABLE public.nina_jev_decisoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Membros leem decisões Jev da clínica"
  ON public.nina_jev_decisoes FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()));
CREATE INDEX nina_jev_decisoes_clinica_idx ON public.nina_jev_decisoes (clinica_id, created_at DESC);
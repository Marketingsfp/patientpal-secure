CREATE TABLE public.nina_confianca_decisoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  conversation_id uuid,
  execucao_id uuid,
  trace_id text,
  ambiente text NOT NULL DEFAULT 'producao' CHECK (ambiente IN ('producao','homologacao')),
  score numeric(5,2) NOT NULL DEFAULT 0,
  acao text NOT NULL CHECK (acao IN ('responder','esclarecer','transferir')),
  bloqueio text,
  categorias jsonb NOT NULL DEFAULT '[]'::jsonb,
  motivos jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.nina_confianca_decisoes TO authenticated;
GRANT ALL ON public.nina_confianca_decisoes TO service_role;

ALTER TABLE public.nina_confianca_decisoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "confianca_select_membro"
ON public.nina_confianca_decisoes
FOR SELECT
TO authenticated
USING (clinica_id = ANY (clinicas_do_usuario()));

CREATE INDEX idx_nina_confianca_clinica_data
  ON public.nina_confianca_decisoes (clinica_id, created_at DESC);
CREATE INDEX idx_nina_confianca_conversa
  ON public.nina_confianca_decisoes (conversation_id);

CREATE TRIGGER trg_nina_confianca_updated_at
BEFORE UPDATE ON public.nina_confianca_decisoes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
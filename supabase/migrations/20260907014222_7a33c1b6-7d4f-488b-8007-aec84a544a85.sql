CREATE TABLE IF NOT EXISTS public.nina_teste_simulacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.nina_teste_leads(id) ON DELETE CASCADE,
  ciclo_id uuid REFERENCES public.nina_teste_ciclos(id) ON DELETE SET NULL,
  conversa_id uuid REFERENCES public.atend_conversas(id) ON DELETE SET NULL,
  modelo text NOT NULL,
  cenario text NOT NULL,
  persona jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_turnos integer NOT NULL DEFAULT 8,
  max_duracao_s integer NOT NULL DEFAULT 300,
  max_tokens integer NOT NULL DEFAULT 20000,
  timeout_s integer NOT NULL DEFAULT 60,
  status text NOT NULL DEFAULT 'executando'
    CHECK (status IN ('executando','pausada','concluida','parada','erro')),
  turnos integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  motivo_fim text,
  erro text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nina_teste_simulacoes TO authenticated;
GRANT ALL ON public.nina_teste_simulacoes TO service_role;

ALTER TABLE public.nina_teste_simulacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "nina_teste_simulacoes_select" ON public.nina_teste_simulacoes
  FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "nina_teste_simulacoes_cud" ON public.nina_teste_simulacoes
  FOR ALL TO authenticated USING (is_member(auth.uid(), clinica_id))
  WITH CHECK (is_member(auth.uid(), clinica_id));

CREATE INDEX IF NOT EXISTS nina_teste_simulacoes_lead_idx
  ON public.nina_teste_simulacoes (lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS nina_teste_simulacoes_ativas_idx
  ON public.nina_teste_simulacoes (clinica_id, status)
  WHERE status IN ('executando','pausada');

DROP TRIGGER IF EXISTS nina_teste_simulacoes_touch ON public.nina_teste_simulacoes;
CREATE TRIGGER nina_teste_simulacoes_touch BEFORE UPDATE ON public.nina_teste_simulacoes
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
CREATE TABLE public.nina_teste_avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.nina_teste_leads(id) ON DELETE SET NULL,
  conversa_id uuid,
  ciclo_id uuid REFERENCES public.nina_teste_ciclos(id) ON DELETE SET NULL,
  simulacao_id uuid REFERENCES public.nina_teste_simulacoes(id) ON DELETE SET NULL,
  cenario_id uuid REFERENCES public.nina_teste_cenarios(id) ON DELETE SET NULL,
  modelo text NOT NULL,
  versao_rubrica text NOT NULL DEFAULT 'sol-v1',
  status text NOT NULL DEFAULT 'concluida',
  resultado text,
  score integer,
  resumo text,
  dimensoes jsonb NOT NULL DEFAULT '[]'::jsonb,
  achados jsonb NOT NULL DEFAULT '[]'::jsonb,
  evidencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  prompt_versao integer,
  prompt_versao_id uuid,
  mensagens_avaliadas integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  latency_ms integer,
  erro text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_teste_avaliacoes_status_chk CHECK (status IN ('executando','concluida','erro')),
  CONSTRAINT nina_teste_avaliacoes_resultado_chk CHECK (resultado IS NULL OR resultado IN ('aprovado','aprovado_observacao','reprovado','erro_critico')),
  CONSTRAINT nina_teste_avaliacoes_score_chk CHECK (score IS NULL OR (score >= 0 AND score <= 100))
);

CREATE INDEX nina_teste_avaliacoes_clinica_idx ON public.nina_teste_avaliacoes (clinica_id, created_at DESC);
CREATE INDEX nina_teste_avaliacoes_lead_idx ON public.nina_teste_avaliacoes (lead_id, created_at DESC);
CREATE INDEX nina_teste_avaliacoes_conversa_idx ON public.nina_teste_avaliacoes (conversa_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nina_teste_avaliacoes TO authenticated;
GRANT ALL ON public.nina_teste_avaliacoes TO service_role;

ALTER TABLE public.nina_teste_avaliacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "avaliacoes_sol_select" ON public.nina_teste_avaliacoes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clinica_memberships m WHERE m.clinica_id = nina_teste_avaliacoes.clinica_id AND m.user_id = auth.uid() AND m.ativo));

CREATE POLICY "avaliacoes_sol_insert" ON public.nina_teste_avaliacoes
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.clinica_memberships m WHERE m.clinica_id = nina_teste_avaliacoes.clinica_id AND m.user_id = auth.uid() AND m.ativo));

CREATE POLICY "avaliacoes_sol_update" ON public.nina_teste_avaliacoes
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clinica_memberships m WHERE m.clinica_id = nina_teste_avaliacoes.clinica_id AND m.user_id = auth.uid() AND m.ativo))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clinica_memberships m WHERE m.clinica_id = nina_teste_avaliacoes.clinica_id AND m.user_id = auth.uid() AND m.ativo));

CREATE POLICY "avaliacoes_sol_delete" ON public.nina_teste_avaliacoes
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clinica_memberships m WHERE m.clinica_id = nina_teste_avaliacoes.clinica_id AND m.user_id = auth.uid() AND m.ativo));

CREATE TRIGGER nina_teste_avaliacoes_touch
  BEFORE UPDATE ON public.nina_teste_avaliacoes
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
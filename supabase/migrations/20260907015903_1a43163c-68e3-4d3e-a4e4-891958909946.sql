-- FASE 5 — Biblioteca de cenários automatizados e registro de execuções.

CREATE TABLE public.nina_teste_cenarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  descricao text,
  categoria text NOT NULL DEFAULT 'informacao',
  objetivo text NOT NULL,
  precondicoes text,
  dados_sinteticos jsonb NOT NULL DEFAULT '{}'::jsonb,
  criterios jsonb NOT NULL DEFAULT '[]'::jsonb,
  persona jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_turnos integer NOT NULL DEFAULT 6,
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'ativo',
  versao integer NOT NULL DEFAULT 1,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_teste_cenarios_status_chk CHECK (status IN ('rascunho','ativo','arquivado')),
  CONSTRAINT nina_teste_cenarios_categoria_chk CHECK (categoria IN (
    'informacao','agendamento','agenda','crm','rag','transferencia','prompt',
    'memoria','correcao_dados','fallback','erro','seguranca','regressao'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nina_teste_cenarios TO authenticated;
GRANT ALL ON public.nina_teste_cenarios TO service_role;
ALTER TABLE public.nina_teste_cenarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cenarios_teste_ver" ON public.nina_teste_cenarios
  FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "cenarios_teste_gerenciar" ON public.nina_teste_cenarios
  FOR ALL TO authenticated USING (is_member(auth.uid(), clinica_id))
  WITH CHECK (is_member(auth.uid(), clinica_id));

CREATE INDEX idx_nina_teste_cenarios_clinica ON public.nina_teste_cenarios (clinica_id, status, categoria);

CREATE TRIGGER trg_nina_teste_cenarios_touch
  BEFORE UPDATE ON public.nina_teste_cenarios
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE TABLE public.nina_teste_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  status text NOT NULL DEFAULT 'executando',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  total integer NOT NULL DEFAULT 0,
  aprovados integer NOT NULL DEFAULT 0,
  reprovados integer NOT NULL DEFAULT 0,
  inconclusivos integer NOT NULL DEFAULT 0,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_teste_execucoes_status_chk CHECK (status IN ('executando','concluida','parada','erro'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nina_teste_execucoes TO authenticated;
GRANT ALL ON public.nina_teste_execucoes TO service_role;
ALTER TABLE public.nina_teste_execucoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "execucoes_teste_ver" ON public.nina_teste_execucoes
  FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "execucoes_teste_gerenciar" ON public.nina_teste_execucoes
  FOR ALL TO authenticated USING (is_member(auth.uid(), clinica_id))
  WITH CHECK (is_member(auth.uid(), clinica_id));

CREATE INDEX idx_nina_teste_execucoes_clinica ON public.nina_teste_execucoes (clinica_id, created_at DESC);

CREATE TRIGGER trg_nina_teste_execucoes_touch
  BEFORE UPDATE ON public.nina_teste_execucoes
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE TABLE public.nina_teste_execucao_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  execucao_id uuid NOT NULL REFERENCES public.nina_teste_execucoes(id) ON DELETE CASCADE,
  cenario_id uuid REFERENCES public.nina_teste_cenarios(id) ON DELETE SET NULL,
  cenario_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  lead_id uuid REFERENCES public.nina_teste_leads(id) ON DELETE SET NULL,
  lead_indice integer,
  ciclo_id uuid,
  conversa_id uuid,
  simulacao_id uuid,
  ordem integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente',
  resultado text NOT NULL DEFAULT 'pendente',
  criterios_resultado jsonb NOT NULL DEFAULT '[]'::jsonb,
  mensagens integer NOT NULL DEFAULT 0,
  turnos integer NOT NULL DEFAULT 0,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  custo_estimado numeric(12,6) NOT NULL DEFAULT 0,
  modelo_nina text,
  modelo_paciente text,
  prompt_versao integer,
  prompt_versao_id uuid,
  ferramentas text[] NOT NULL DEFAULT '{}',
  transferida boolean NOT NULL DEFAULT false,
  erro text,
  iniciado_em timestamptz,
  finalizado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_teste_itens_status_chk CHECK (status IN ('pendente','executando','concluido','erro','cancelado')),
  CONSTRAINT nina_teste_itens_resultado_chk CHECK (resultado IN ('pendente','aprovado','reprovado','inconclusivo'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nina_teste_execucao_itens TO authenticated;
GRANT ALL ON public.nina_teste_execucao_itens TO service_role;
ALTER TABLE public.nina_teste_execucao_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "execucao_itens_teste_ver" ON public.nina_teste_execucao_itens
  FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "execucao_itens_teste_gerenciar" ON public.nina_teste_execucao_itens
  FOR ALL TO authenticated USING (is_member(auth.uid(), clinica_id))
  WITH CHECK (is_member(auth.uid(), clinica_id));

CREATE INDEX idx_nina_teste_itens_exec ON public.nina_teste_execucao_itens (execucao_id, ordem);
CREATE INDEX idx_nina_teste_itens_cenario ON public.nina_teste_execucao_itens (clinica_id, cenario_id, created_at DESC);

CREATE TRIGGER trg_nina_teste_itens_touch
  BEFORE UPDATE ON public.nina_teste_execucao_itens
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();
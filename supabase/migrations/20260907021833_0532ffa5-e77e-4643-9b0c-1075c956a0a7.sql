-- FASE 6 — Testes de carga e alto volume da homologação da Nina.

CREATE TABLE public.nina_teste_carga (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  perfil text NOT NULL DEFAULT 'leve',
  status text NOT NULL DEFAULT 'preparando',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  variacoes jsonb NOT NULL DEFAULT '{}'::jsonb,
  plano jsonb NOT NULL DEFAULT '[]'::jsonb,
  confirmado boolean NOT NULL DEFAULT false,
  cancelar boolean NOT NULL DEFAULT false,
  total_planejado integer NOT NULL DEFAULT 0,
  enviadas integer NOT NULL DEFAULT 0,
  sucesso integer NOT NULL DEFAULT 0,
  erros integer NOT NULL DEFAULT 0,
  timeouts integer NOT NULL DEFAULT 0,
  retries integer NOT NULL DEFAULT 0,
  chamadas_modelo integer NOT NULL DEFAULT 0,
  ferramentas integer NOT NULL DEFAULT 0,
  input_tokens bigint NOT NULL DEFAULT 0,
  output_tokens bigint NOT NULL DEFAULT 0,
  custo_estimado numeric(12,6) NOT NULL DEFAULT 0,
  conversas_finalizadas integer NOT NULL DEFAULT 0,
  modelo_gerador text,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_teste_carga_status_chk CHECK (status IN ('preparando','executando','concluido','parado','erro')),
  CONSTRAINT nina_teste_carga_perfil_chk CHECK (perfil IN ('leve','medio','alto','customizado'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nina_teste_carga TO authenticated;
GRANT ALL ON public.nina_teste_carga TO service_role;
ALTER TABLE public.nina_teste_carga ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carga_ver" ON public.nina_teste_carga
  FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "carga_gerenciar" ON public.nina_teste_carga
  FOR ALL TO authenticated USING (is_member(auth.uid(), clinica_id))
  WITH CHECK (is_member(auth.uid(), clinica_id));

CREATE INDEX idx_nina_teste_carga_clinica ON public.nina_teste_carga (clinica_id, created_at DESC);

CREATE TRIGGER trg_nina_teste_carga_touch
  BEFORE UPDATE ON public.nina_teste_carga
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE TABLE public.nina_teste_carga_amostras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  carga_id uuid NOT NULL REFERENCES public.nina_teste_carga(id) ON DELETE CASCADE,
  indice integer NOT NULL DEFAULT 0,
  lead_id uuid,
  lead_indice integer,
  conversa_id uuid,
  cenario text,
  mensagem text,
  status text NOT NULL DEFAULT 'ok',
  tentativa integer NOT NULL DEFAULT 1,
  latencia_ms integer,
  chamadas_modelo integer NOT NULL DEFAULT 0,
  ferramentas text[] NOT NULL DEFAULT '{}',
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_teste_carga_amostras_status_chk CHECK (status IN ('ok','erro','timeout','cancelado'))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nina_teste_carga_amostras TO authenticated;
GRANT ALL ON public.nina_teste_carga_amostras TO service_role;
ALTER TABLE public.nina_teste_carga_amostras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "carga_amostras_ver" ON public.nina_teste_carga_amostras
  FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY "carga_amostras_gerenciar" ON public.nina_teste_carga_amostras
  FOR ALL TO authenticated USING (is_member(auth.uid(), clinica_id))
  WITH CHECK (is_member(auth.uid(), clinica_id));

CREATE INDEX idx_nina_teste_carga_amostras_carga
  ON public.nina_teste_carga_amostras (clinica_id, carga_id, indice);
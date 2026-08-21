-- ============================================================
-- Etapa 1 — Integração externa de agendamentos (/api/integrations/v1)
-- Somente estrutura de banco. Nenhuma alteração de comportamento na Agenda.
-- ============================================================

-- 1) Campos de rastreio da integração em agendamentos.
--    NÃO confundir com origem_externa (repasse entre clínicas), que segue intocado.
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS origem_integracao text,
  ADD COLUMN IF NOT EXISTS id_externo text;

COMMENT ON COLUMN public.agendamentos.origem_integracao IS
  'Identificador do parceiro externo que criou o agendamento via /api/integrations/v1. NULL em agendamento interno. Não confundir com origem_externa (repasse financeiro entre clínicas).';
COMMENT ON COLUMN public.agendamentos.id_externo IS
  'Identificador do agendamento no sistema do parceiro externo. NULL em agendamento interno.';

-- Trava de duplicidade por parceiro (parcial: não afeta os agendamentos internos).
CREATE UNIQUE INDEX IF NOT EXISTS uq_agendamentos_origem_integracao_id_externo
  ON public.agendamentos (origem_integracao, id_externo)
  WHERE origem_integracao IS NOT NULL AND id_externo IS NOT NULL;

-- Busca por chave externa.
CREATE INDEX IF NOT EXISTS idx_agendamentos_id_externo
  ON public.agendamentos (clinica_id, origem_integracao, id_externo)
  WHERE origem_integracao IS NOT NULL;

-- ============================================================
-- 2) Chaves de API das integrações
-- ============================================================
CREATE TABLE IF NOT EXISTS public.integracao_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  origem_integracao text NOT NULL,
  nome text NOT NULL,
  key_prefix text NOT NULL,
  key_hash text NOT NULL,
  escopos text[] NOT NULL DEFAULT ARRAY['availability:read','appointments:read']::text[],
  ativo boolean NOT NULL DEFAULT true,
  expira_em timestamptz,
  limite_por_minuto integer NOT NULL DEFAULT 60,
  limite_por_dia integer NOT NULL DEFAULT 1000,
  ultima_utilizacao_em timestamptz,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_integracao_api_keys_prefix
  ON public.integracao_api_keys (key_prefix);
CREATE UNIQUE INDEX IF NOT EXISTS uq_integracao_api_keys_origem
  ON public.integracao_api_keys (clinica_id, origem_integracao);

GRANT SELECT ON public.integracao_api_keys TO authenticated;
GRANT ALL ON public.integracao_api_keys TO service_role;
ALTER TABLE public.integracao_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integracao_api_keys_select_gestor"
  ON public.integracao_api_keys FOR SELECT TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

DROP TRIGGER IF EXISTS trg_integracao_api_keys_upd ON public.integracao_api_keys;
CREATE TRIGGER trg_integracao_api_keys_upd
  BEFORE UPDATE ON public.integracao_api_keys
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ============================================================
-- 3) Log técnico de requisições (sem corpo, sem PII)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.integracao_requisicoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid REFERENCES public.integracao_api_keys(id) ON DELETE SET NULL,
  clinica_id uuid,
  request_id text NOT NULL,
  metodo text NOT NULL,
  rota text NOT NULL,
  status_http integer NOT NULL,
  erro_codigo text,
  erro_resumo text,
  duracao_ms integer,
  id_externo text,
  ip text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integracao_requisicoes_key_data
  ON public.integracao_requisicoes (api_key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_integracao_requisicoes_request_id
  ON public.integracao_requisicoes (request_id);

GRANT SELECT ON public.integracao_requisicoes TO authenticated;
GRANT ALL ON public.integracao_requisicoes TO service_role;
ALTER TABLE public.integracao_requisicoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integracao_requisicoes_select_gestor"
  ON public.integracao_requisicoes FOR SELECT TO authenticated
  USING (clinica_id IS NOT NULL AND public.can_manage_clinica(auth.uid(), clinica_id));

-- ============================================================
-- 4) Idempotência (janela de 24h)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.integracao_idempotencia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.integracao_api_keys(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL,
  body_hash text NOT NULL,
  status_http integer,
  response_json jsonb,
  concluido boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_integracao_idempotencia
  ON public.integracao_idempotencia (api_key_id, idempotency_key);
CREATE INDEX IF NOT EXISTS idx_integracao_idempotencia_created
  ON public.integracao_idempotencia (created_at);

GRANT ALL ON public.integracao_idempotencia TO service_role;
ALTER TABLE public.integracao_idempotencia ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_integracao_idempotencia_upd ON public.integracao_idempotencia;
CREATE TRIGGER trg_integracao_idempotencia_upd
  BEFORE UPDATE ON public.integracao_idempotencia
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- ============================================================
-- 5) Rate limit (janela deslizante persistida)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.integracao_rate_limit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id uuid NOT NULL REFERENCES public.integracao_api_keys(id) ON DELETE CASCADE,
  janela text NOT NULL,
  janela_inicio timestamptz NOT NULL,
  contador integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_integracao_rate_limit
  ON public.integracao_rate_limit (api_key_id, janela, janela_inicio);

GRANT SELECT ON public.integracao_rate_limit TO authenticated;
GRANT ALL ON public.integracao_rate_limit TO service_role;
ALTER TABLE public.integracao_rate_limit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integracao_rate_limit_select_gestor"
  ON public.integracao_rate_limit FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.integracao_api_keys k
    WHERE k.id = integracao_rate_limit.api_key_id
      AND public.can_manage_clinica(auth.uid(), k.clinica_id)
  ));
-- =============================================================
-- Nina — aprendizado contínuo (Fase 1 e 2). Vale para TODAS as clínicas.
-- =============================================================

CREATE TABLE public.nina_aprendizados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('FACT','RULE','WORKFLOW','EXAMPLE','ERROR_PATTERN','KNOWLEDGE_GAP')),
  canal text NOT NULL DEFAULT 'todos' CHECK (canal IN ('todos','whatsapp','interno')),
  titulo text NOT NULL,
  conteudo text NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED','ARCHIVED')),
  confianca numeric NOT NULL DEFAULT 0.5 CHECK (confianca >= 0 AND confianca <= 1),
  versao integer NOT NULL DEFAULT 1,
  origem text NOT NULL DEFAULT 'manual',
  origem_ref uuid,
  valido_ate timestamptz,
  usos integer NOT NULL DEFAULT 0,
  acertos integer NOT NULL DEFAULT 0,
  erros integer NOT NULL DEFAULT 0,
  criado_por uuid,
  aprovado_por uuid,
  aprovado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nina_aprendizados TO authenticated;
GRANT ALL ON public.nina_aprendizados TO service_role;
ALTER TABLE public.nina_aprendizados ENABLE ROW LEVEL SECURITY;

CREATE POLICY nina_aprendizados_select ON public.nina_aprendizados
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY nina_aprendizados_insert ON public.nina_aprendizados
  FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid(), clinica_id));
CREATE POLICY nina_aprendizados_update ON public.nina_aprendizados
  FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid(), clinica_id))
  WITH CHECK (public.is_member(auth.uid(), clinica_id));
CREATE POLICY nina_aprendizados_delete ON public.nina_aprendizados
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), clinica_id, 'admin'::app_role)
      OR public.has_role(auth.uid(), clinica_id, 'gestor'::app_role));

CREATE INDEX idx_nina_apr_clinica_status ON public.nina_aprendizados (clinica_id, status);
CREATE INDEX idx_nina_apr_titulo_trgm ON public.nina_aprendizados USING gin (lower(titulo) gin_trgm_ops);
CREATE INDEX idx_nina_apr_conteudo_trgm ON public.nina_aprendizados USING gin (lower(conteudo) gin_trgm_ops);
CREATE INDEX idx_nina_apr_tags ON public.nina_aprendizados USING gin (tags);

CREATE TRIGGER trg_nina_apr_touch
  BEFORE UPDATE ON public.nina_aprendizados
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

-- Só admin/gestor muda a situação de um aprendizado (aprovar/recusar).
CREATE OR REPLACE FUNCTION public.fn_nina_apr_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF auth.uid() IS NOT NULL
       AND NOT (public.has_role(auth.uid(), NEW.clinica_id, 'admin'::app_role)
             OR public.has_role(auth.uid(), NEW.clinica_id, 'gestor'::app_role)) THEN
      RAISE EXCEPTION 'Apenas administrador ou gestor pode aprovar/recusar aprendizados da Nina';
    END IF;
  END IF;
  IF NEW.conteudo IS DISTINCT FROM OLD.conteudo THEN
    NEW.versao := OLD.versao + 1;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nina_apr_status_guard
  BEFORE UPDATE ON public.nina_aprendizados
  FOR EACH ROW EXECUTE FUNCTION public.fn_nina_apr_status_guard();

-- ------------------------------------------------------------- versões
CREATE TABLE public.nina_aprendizado_versoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  aprendizado_id uuid NOT NULL REFERENCES public.nina_aprendizados(id) ON DELETE CASCADE,
  versao integer NOT NULL,
  conteudo text NOT NULL,
  status text NOT NULL,
  alterado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.nina_aprendizado_versoes TO authenticated;
GRANT ALL ON public.nina_aprendizado_versoes TO service_role;
ALTER TABLE public.nina_aprendizado_versoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY nina_apr_versoes_select ON public.nina_aprendizado_versoes
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY nina_apr_versoes_insert ON public.nina_aprendizado_versoes
  FOR INSERT TO authenticated WITH CHECK (public.is_member(auth.uid(), clinica_id));

CREATE INDEX idx_nina_apr_versoes_apr ON public.nina_aprendizado_versoes (aprendizado_id, versao DESC);

CREATE OR REPLACE FUNCTION public.fn_nina_apr_versiona()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.conteudo IS DISTINCT FROM OLD.conteudo OR NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.nina_aprendizado_versoes (clinica_id, aprendizado_id, versao, conteudo, status, alterado_por)
    VALUES (OLD.clinica_id, OLD.id, OLD.versao, OLD.conteudo, OLD.status, auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nina_apr_versiona
  AFTER UPDATE ON public.nina_aprendizados
  FOR EACH ROW EXECUTE FUNCTION public.fn_nina_apr_versiona();

-- ------------------------------------------------------------ feedback
CREATE TABLE public.nina_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  canal text NOT NULL DEFAULT 'interno' CHECK (canal IN ('whatsapp','interno')),
  conversa_id uuid,
  pergunta text NOT NULL,
  resposta text NOT NULL,
  avaliacao smallint NOT NULL CHECK (avaliacao IN (-1, 1)),
  categoria text CHECK (categoria IN ('dado_errado','tom','incompleto','fora_de_escopo','regra_errada','otimo','outro')),
  correcao text,
  aprendizado_id uuid REFERENCES public.nina_aprendizados(id) ON DELETE SET NULL,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.nina_feedback TO authenticated;
GRANT ALL ON public.nina_feedback TO service_role;
ALTER TABLE public.nina_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY nina_feedback_select ON public.nina_feedback
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY nina_feedback_insert ON public.nina_feedback
  FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), clinica_id) AND criado_por = auth.uid());
CREATE POLICY nina_feedback_update ON public.nina_feedback
  FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid(), clinica_id) AND criado_por = auth.uid())
  WITH CHECK (public.is_member(auth.uid(), clinica_id) AND criado_por = auth.uid());

CREATE INDEX idx_nina_feedback_clinica ON public.nina_feedback (clinica_id, created_at DESC);

-- -------------------------------------------------- avaliações da IA
CREATE TABLE public.nina_avaliacoes_ia (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  canal text NOT NULL DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp','interno')),
  conversa_id uuid,
  pergunta text NOT NULL,
  resposta text NOT NULL,
  nota integer CHECK (nota BETWEEN 0 AND 5),
  problema text,
  sugestao text,
  modelo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.nina_avaliacoes_ia TO authenticated;
GRANT ALL ON public.nina_avaliacoes_ia TO service_role;
ALTER TABLE public.nina_avaliacoes_ia ENABLE ROW LEVEL SECURITY;

CREATE POLICY nina_avaliacoes_ia_select ON public.nina_avaliacoes_ia
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));

CREATE INDEX idx_nina_aval_ia_clinica ON public.nina_avaliacoes_ia (clinica_id, created_at DESC);

-- ------------------------------------------------ testes de regressão
CREATE TABLE public.nina_testes_regressao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  pergunta text NOT NULL,
  resposta_esperada text NOT NULL,
  origem_feedback_id uuid REFERENCES public.nina_feedback(id) ON DELETE SET NULL,
  ativo boolean NOT NULL DEFAULT true,
  ultima_execucao timestamptz,
  ultimo_resultado text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nina_testes_regressao TO authenticated;
GRANT ALL ON public.nina_testes_regressao TO service_role;
ALTER TABLE public.nina_testes_regressao ENABLE ROW LEVEL SECURITY;

CREATE POLICY nina_testes_select ON public.nina_testes_regressao
  FOR SELECT TO authenticated USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY nina_testes_cud ON public.nina_testes_regressao
  FOR ALL TO authenticated
  USING (public.is_member(auth.uid(), clinica_id))
  WITH CHECK (public.is_member(auth.uid(), clinica_id));
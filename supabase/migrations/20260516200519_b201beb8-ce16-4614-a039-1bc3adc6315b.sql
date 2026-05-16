
-- ============ PRONTUÁRIOS ============
CREATE TABLE public.prontuarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  paciente_id uuid NOT NULL,
  medico_id uuid,
  data timestamptz NOT NULL DEFAULT now(),
  queixa_principal text,
  historia_doenca text,
  exame_fisico text,
  hipotese_diagnostica text,
  conduta text,
  prescricao text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.prontuarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY pron_select ON public.prontuarios FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY pron_insert ON public.prontuarios FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY pron_update ON public.prontuarios FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY pron_delete ON public.prontuarios FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER pron_touch BEFORE UPDATE ON public.prontuarios FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_pron_paciente ON public.prontuarios(clinica_id, paciente_id, data DESC);

-- ============ MODELOS DE DOCUMENTOS ============
CREATE TYPE public.tipo_documento AS ENUM ('atestado', 'receita', 'laudo', 'declaracao', 'contrato', 'outro');

CREATE TABLE public.modelos_documentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  nome text NOT NULL,
  tipo tipo_documento NOT NULL DEFAULT 'outro',
  conteudo text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.modelos_documentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY md_select ON public.modelos_documentos FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY md_insert ON public.modelos_documentos FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY md_update ON public.modelos_documentos FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY md_delete ON public.modelos_documentos FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER md_touch BEFORE UPDATE ON public.modelos_documentos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ DOCUMENTOS EMITIDOS ============
CREATE TABLE public.documentos_emitidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  paciente_id uuid,
  medico_id uuid,
  modelo_id uuid,
  tipo tipo_documento NOT NULL DEFAULT 'outro',
  titulo text NOT NULL,
  conteudo text NOT NULL,
  assinado boolean NOT NULL DEFAULT false,
  assinado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.documentos_emitidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY de_select ON public.documentos_emitidos FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY de_insert ON public.documentos_emitidos FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY de_update ON public.documentos_emitidos FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY de_delete ON public.documentos_emitidos FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER de_touch BEFORE UPDATE ON public.documentos_emitidos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ ANAMNESE - MODELOS E RESPOSTAS ============
CREATE TABLE public.anamnese_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  perguntas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.anamnese_modelos ENABLE ROW LEVEL SECURITY;
CREATE POLICY am_select ON public.anamnese_modelos FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY am_insert ON public.anamnese_modelos FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY am_update ON public.anamnese_modelos FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY am_delete ON public.anamnese_modelos FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER am_touch BEFORE UPDATE ON public.anamnese_modelos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE public.anamnese_respostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  modelo_id uuid NOT NULL,
  paciente_id uuid,
  respostas jsonb NOT NULL DEFAULT '{}'::jsonb,
  respondida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.anamnese_respostas ENABLE ROW LEVEL SECURITY;
CREATE POLICY ar_select ON public.anamnese_respostas FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY ar_insert ON public.anamnese_respostas FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY ar_update ON public.anamnese_respostas FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY ar_delete ON public.anamnese_respostas FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER ar_touch BEFORE UPDATE ON public.anamnese_respostas FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ ESTOQUE ============
CREATE TABLE public.estoque_produtos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  nome text NOT NULL,
  codigo text,
  unidade text NOT NULL DEFAULT 'un',
  estoque_atual numeric NOT NULL DEFAULT 0,
  estoque_minimo numeric NOT NULL DEFAULT 0,
  custo_unitario numeric NOT NULL DEFAULT 0,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.estoque_produtos ENABLE ROW LEVEL SECURITY;
CREATE POLICY ep_select ON public.estoque_produtos FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY ep_insert ON public.estoque_produtos FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY ep_update ON public.estoque_produtos FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY ep_delete ON public.estoque_produtos FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER ep_touch BEFORE UPDATE ON public.estoque_produtos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE TYPE public.estoque_movimento_tipo AS ENUM ('entrada', 'saida', 'ajuste');

CREATE TABLE public.estoque_movimentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  produto_id uuid NOT NULL,
  tipo estoque_movimento_tipo NOT NULL,
  quantidade numeric NOT NULL,
  custo_unitario numeric,
  observacoes text,
  data timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.estoque_movimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY em_select ON public.estoque_movimentos FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY em_insert ON public.estoque_movimentos FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY em_delete ON public.estoque_movimentos FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));

-- Atualiza estoque automaticamente
CREATE OR REPLACE FUNCTION public.aplicar_movimento_estoque() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.tipo = 'entrada' THEN
    UPDATE public.estoque_produtos SET estoque_atual = estoque_atual + NEW.quantidade WHERE id = NEW.produto_id;
  ELSIF NEW.tipo = 'saida' THEN
    UPDATE public.estoque_produtos SET estoque_atual = estoque_atual - NEW.quantidade WHERE id = NEW.produto_id;
  ELSIF NEW.tipo = 'ajuste' THEN
    UPDATE public.estoque_produtos SET estoque_atual = NEW.quantidade WHERE id = NEW.produto_id;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER em_apply AFTER INSERT ON public.estoque_movimentos FOR EACH ROW EXECUTE FUNCTION public.aplicar_movimento_estoque();

-- ============ BOLETOS ============
CREATE TABLE public.boletos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  paciente_id uuid,
  lancamento_id uuid,
  valor numeric NOT NULL,
  vencimento date NOT NULL,
  nosso_numero text,
  linha_digitavel text,
  url_pdf text,
  status text NOT NULL DEFAULT 'pendente',
  pago_em timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.boletos ENABLE ROW LEVEL SECURITY;
CREATE POLICY bol_select ON public.boletos FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY bol_insert ON public.boletos FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY bol_update ON public.boletos FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY bol_delete ON public.boletos FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER bol_touch BEFORE UPDATE ON public.boletos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ NFS-e ============
CREATE TABLE public.nfse (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  paciente_id uuid,
  medico_id uuid,
  numero text,
  serie text,
  data_emissao date NOT NULL DEFAULT CURRENT_DATE,
  valor_servicos numeric NOT NULL DEFAULT 0,
  valor_iss numeric NOT NULL DEFAULT 0,
  descricao_servicos text,
  status text NOT NULL DEFAULT 'rascunho',
  url_pdf text,
  url_xml text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.nfse ENABLE ROW LEVEL SECURITY;
CREATE POLICY nfse_select ON public.nfse FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY nfse_insert ON public.nfse FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY nfse_update ON public.nfse FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY nfse_delete ON public.nfse FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER nfse_touch BEFORE UPDATE ON public.nfse FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ CRM ============
CREATE TABLE public.crm_etapas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  nome text NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  cor text NOT NULL DEFAULT '#13b5a3',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_etapas ENABLE ROW LEVEL SECURITY;
CREATE POLICY ce_select ON public.crm_etapas FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY ce_insert ON public.crm_etapas FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY ce_update ON public.crm_etapas FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY ce_delete ON public.crm_etapas FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));

CREATE TYPE public.crm_status AS ENUM ('aberta', 'ganha', 'perdida');

CREATE TABLE public.crm_oportunidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  etapa_id uuid,
  paciente_id uuid,
  nome_lead text NOT NULL,
  telefone text,
  email text,
  valor_estimado numeric NOT NULL DEFAULT 0,
  status crm_status NOT NULL DEFAULT 'aberta',
  origem text,
  observacoes text,
  responsavel_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.crm_oportunidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY co_select ON public.crm_oportunidades FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY co_insert ON public.crm_oportunidades FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY co_update ON public.crm_oportunidades FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY co_delete ON public.crm_oportunidades FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER co_touch BEFORE UPDATE ON public.crm_oportunidades FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ CAMPANHAS DE MARKETING ============
CREATE TABLE public.campanhas_marketing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'whatsapp',
  mensagem text NOT NULL,
  segmento text,
  agendada_para timestamptz,
  enviada_em timestamptz,
  status text NOT NULL DEFAULT 'rascunho',
  total_envios integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campanhas_marketing ENABLE ROW LEVEL SECURITY;
CREATE POLICY cm_select ON public.campanhas_marketing FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY cm_insert ON public.campanhas_marketing FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY cm_update ON public.campanhas_marketing FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY cm_delete ON public.campanhas_marketing FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER cm_touch BEFORE UPDATE ON public.campanhas_marketing FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ TEMPLATES WHATSAPP ============
CREATE TABLE public.whatsapp_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  nome text NOT NULL,
  evento text NOT NULL,
  mensagem text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY wt_select ON public.whatsapp_templates FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY wt_insert ON public.whatsapp_templates FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY wt_update ON public.whatsapp_templates FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY wt_delete ON public.whatsapp_templates FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER wt_touch BEFORE UPDATE ON public.whatsapp_templates FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ TELECONSULTA: campos em agendamentos ============
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS teleconsulta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS link_teleconsulta text;

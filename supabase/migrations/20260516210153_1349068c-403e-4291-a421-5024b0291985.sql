
-- Tipos
CREATE TYPE public.prestador_tipo AS ENUM ('laboratorio','clinica_imagem','locador_equipamento','parceiro_pj','outro');
CREATE TYPE public.split_beneficiario_tipo AS ENUM ('clinica','medico','prestador','outro');
CREATE TYPE public.pagamento_status AS ENUM ('pendente','autorizado','capturado','falhou','estornado','cancelado');
CREATE TYPE public.pagamento_forma AS ENUM ('paytime_credito','paytime_debito','paytime_pix','dinheiro','pix','cartao_credito','cartao_debito','boleto','outro');

-- Prestadores (terceirizados PJ)
CREATE TABLE public.prestadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  nome text NOT NULL,
  tipo prestador_tipo NOT NULL DEFAULT 'outro',
  cnpj text,
  inscricao_municipal text,
  email text,
  telefone text,
  responsavel text,
  banco text,
  agencia text,
  conta text,
  pix_chave text,
  emite_nf_propria boolean NOT NULL DEFAULT true,
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.prestadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY prest_select ON public.prestadores FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY prest_insert ON public.prestadores FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY prest_update ON public.prestadores FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY prest_delete ON public.prestadores FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER trg_prest_updated BEFORE UPDATE ON public.prestadores FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_prest_clinica ON public.prestadores(clinica_id);

-- Regras de split por procedimento
CREATE TABLE public.procedimento_split_regras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  procedimento_id uuid NOT NULL,
  beneficiario_tipo split_beneficiario_tipo NOT NULL,
  medico_id uuid,             -- quando beneficiario_tipo='medico'
  prestador_id uuid,          -- quando beneficiario_tipo='prestador'
  rotulo text,                -- ex: "Aluguel aparelho" ou nome da clínica
  percentual numeric(6,3),    -- 0-100 (se valor_fixo for null)
  valor_fixo numeric(12,2),   -- alternativa ao percentual
  emite_nf boolean NOT NULL DEFAULT false, -- se esta parte emite NF própria
  ordem integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.procedimento_split_regras ENABLE ROW LEVEL SECURITY;
CREATE POLICY psr_select ON public.procedimento_split_regras FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY psr_insert ON public.procedimento_split_regras FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY psr_update ON public.procedimento_split_regras FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY psr_delete ON public.procedimento_split_regras FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER trg_psr_updated BEFORE UPDATE ON public.procedimento_split_regras FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_psr_proc ON public.procedimento_split_regras(procedimento_id);
CREATE INDEX idx_psr_clinica ON public.procedimento_split_regras(clinica_id);

-- Pagamentos (transações)
CREATE TABLE public.pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  paciente_id uuid,
  agendamento_id uuid,
  atendimento_id uuid,
  procedimento_id uuid,
  forma pagamento_forma NOT NULL DEFAULT 'paytime_credito',
  valor_bruto numeric(12,2) NOT NULL,
  valor_taxa numeric(12,2) NOT NULL DEFAULT 0,
  valor_liquido numeric(12,2) NOT NULL DEFAULT 0,
  parcelas integer NOT NULL DEFAULT 1,
  status pagamento_status NOT NULL DEFAULT 'pendente',
  paytime_transaction_id text,
  paytime_payload jsonb,
  nsu text,
  autorizacao text,
  observacoes text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pagamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY pag_select ON public.pagamentos FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY pag_insert ON public.pagamentos FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY pag_update ON public.pagamentos FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY pag_delete ON public.pagamentos FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER trg_pag_updated BEFORE UPDATE ON public.pagamentos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE INDEX idx_pag_clinica ON public.pagamentos(clinica_id);
CREATE INDEX idx_pag_paciente ON public.pagamentos(paciente_id);

-- Splits efetivos do pagamento
CREATE TABLE public.pagamento_splits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  pagamento_id uuid NOT NULL REFERENCES public.pagamentos(id) ON DELETE CASCADE,
  beneficiario_tipo split_beneficiario_tipo NOT NULL,
  medico_id uuid,
  prestador_id uuid,
  rotulo text,
  percentual numeric(6,3),
  valor numeric(12,2) NOT NULL,
  emite_nf boolean NOT NULL DEFAULT false,
  nfse_id uuid,
  paytime_recipient_id text,
  status text NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.pagamento_splits ENABLE ROW LEVEL SECURITY;
CREATE POLICY ps_select ON public.pagamento_splits FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY ps_insert ON public.pagamento_splits FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY ps_update ON public.pagamento_splits FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY ps_delete ON public.pagamento_splits FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE INDEX idx_ps_pag ON public.pagamento_splits(pagamento_id);

-- Campos Paytime no cadastro de prestadores/médicos (recipient id usado no split da adquirente)
ALTER TABLE public.medicos ADD COLUMN IF NOT EXISTS paytime_recipient_id text;
ALTER TABLE public.clinicas ADD COLUMN IF NOT EXISTS paytime_recipient_id text;

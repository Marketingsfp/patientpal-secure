
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

ALTER TABLE public.nfse
  ADD COLUMN IF NOT EXISTS emitente_id uuid,
  ADD COLUMN IF NOT EXISTS agendamento_id uuid REFERENCES public.agendamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pagamento_id uuid REFERENCES public.pagamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS focus_ref text UNIQUE,
  ADD COLUMN IF NOT EXISTS focus_status text,
  ADD COLUMN IF NOT EXISTS codigo_verificacao text,
  ADD COLUMN IF NOT EXISTS rps_numero integer,
  ADD COLUMN IF NOT EXISTS rps_serie text,
  ADD COLUMN IF NOT EXISTS aliquota_iss numeric(5,4),
  ADD COLUMN IF NOT EXISTS valor_liquido numeric(12,2),
  ADD COLUMN IF NOT EXISTS tomador_nome text,
  ADD COLUMN IF NOT EXISTS tomador_documento text,
  ADD COLUMN IF NOT EXISTS tomador_email text,
  ADD COLUMN IF NOT EXISTS tomador_endereco jsonb,
  ADD COLUMN IF NOT EXISTS erro_mensagem text,
  ADD COLUMN IF NOT EXISTS payload_envio jsonb,
  ADD COLUMN IF NOT EXISTS payload_resposta jsonb,
  ADD COLUMN IF NOT EXISTS cancelada_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelada_motivo text,
  ADD COLUMN IF NOT EXISTS emitida_por uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nfse_clinica ON public.nfse(clinica_id);
CREATE INDEX IF NOT EXISTS idx_nfse_focus_ref ON public.nfse(focus_ref);
CREATE INDEX IF NOT EXISTS idx_nfse_pagamento ON public.nfse(pagamento_id);

CREATE TABLE IF NOT EXISTS public.nfse_emitentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome text NOT NULL,
  cnpj text NOT NULL,
  inscricao_municipal text NOT NULL,
  inscricao_estadual text,
  razao_social text NOT NULL,
  nome_fantasia text,
  cep text NOT NULL,
  logradouro text NOT NULL,
  numero text NOT NULL,
  complemento text,
  bairro text NOT NULL,
  municipio text NOT NULL,
  codigo_municipio text NOT NULL,
  uf text NOT NULL,
  telefone text,
  email text,
  regime_tributario text NOT NULL DEFAULT 'simples_nacional',
  optante_simples boolean NOT NULL DEFAULT true,
  incentivador_cultural boolean NOT NULL DEFAULT false,
  item_lista_servico text NOT NULL DEFAULT '0401',
  codigo_tributario_municipio text,
  codigo_cnae text,
  aliquota_iss numeric(5,4) NOT NULL DEFAULT 0.02,
  descricao_servico_padrao text,
  certificado_pfx_base64 text,
  certificado_senha text,
  certificado_validade date,
  focus_token_homologacao text,
  focus_token_producao text,
  focus_ambiente text NOT NULL DEFAULT 'homologacao',
  rps_serie text NOT NULL DEFAULT '1',
  rps_proximo_numero integer NOT NULL DEFAULT 1,
  ativo boolean NOT NULL DEFAULT true,
  padrao boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, cnpj)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nfse_emitentes TO authenticated;
GRANT ALL ON public.nfse_emitentes TO service_role;

ALTER TABLE public.nfse_emitentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members manage emitentes" ON public.nfse_emitentes;
CREATE POLICY "members manage emitentes"
  ON public.nfse_emitentes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.clinica_memberships m WHERE m.clinica_id = nfse_emitentes.clinica_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.clinica_memberships m WHERE m.clinica_id = nfse_emitentes.clinica_id AND m.user_id = auth.uid()));

DROP TRIGGER IF EXISTS trg_nfse_emitentes_updated ON public.nfse_emitentes;
CREATE TRIGGER trg_nfse_emitentes_updated
  BEFORE UPDATE ON public.nfse_emitentes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.nfse
  DROP CONSTRAINT IF EXISTS nfse_emitente_id_fkey,
  ADD CONSTRAINT nfse_emitente_id_fkey FOREIGN KEY (emitente_id) REFERENCES public.nfse_emitentes(id) ON DELETE SET NULL;


-- PLANOS
CREATE TABLE public.planos_assinatura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  nome text NOT NULL,
  tipo text NOT NULL DEFAULT 'cartao_consulta', -- cartao_consulta | cartao_desconto | outro
  valor_mensal numeric NOT NULL DEFAULT 0,
  taxa_adesao numeric NOT NULL DEFAULT 0,
  max_dependentes integer NOT NULL DEFAULT 0,
  max_agregados integer NOT NULL DEFAULT 0,
  fidelidade_meses integer NOT NULL DEFAULT 6,
  vigencia_meses integer NOT NULL DEFAULT 12,
  num_parcelas integer NOT NULL DEFAULT 12,
  descricao_beneficios text,
  template_contrato text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.planos_assinatura ENABLE ROW LEVEL SECURITY;
CREATE POLICY pa_select ON public.planos_assinatura FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY pa_insert ON public.planos_assinatura FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY pa_update ON public.planos_assinatura FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY pa_delete ON public.planos_assinatura FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER trg_pa_updated BEFORE UPDATE ON public.planos_assinatura FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- CONTRATOS
CREATE TABLE public.contratos_assinatura (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  plano_id uuid NOT NULL REFERENCES public.planos_assinatura(id) ON DELETE RESTRICT,
  numero integer NOT NULL DEFAULT 0,
  paciente_id uuid NOT NULL,
  paciente_nome text NOT NULL,
  data_inicio date NOT NULL DEFAULT CURRENT_DATE,
  data_fim date,
  dia_vencimento smallint NOT NULL DEFAULT 10,
  valor_mensal numeric NOT NULL DEFAULT 0,
  taxa_adesao numeric NOT NULL DEFAULT 0,
  num_parcelas integer NOT NULL DEFAULT 12,
  forma_pagamento text DEFAULT 'dinheiro', -- dinheiro | carne | boleto | cartao_credito | pix
  status text NOT NULL DEFAULT 'ativo', -- ativo | cancelado | inadimplente | encerrado
  observacoes text,
  token_publico text UNIQUE DEFAULT replace(gen_random_uuid()::text,'-',''),
  assinatura_svg text,
  assinado_em timestamptz,
  assinatura_ip text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contratos_assinatura ENABLE ROW LEVEL SECURITY;
CREATE POLICY ca_select ON public.contratos_assinatura FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY ca_insert ON public.contratos_assinatura FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY ca_update ON public.contratos_assinatura FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY ca_delete ON public.contratos_assinatura FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER trg_ca_updated BEFORE UPDATE ON public.contratos_assinatura FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.contratos_assinatura_set_numero()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('contrato_assin:'||NEW.clinica_id::text));
    SELECT COALESCE(MAX(numero),0)+1 INTO NEW.numero
    FROM public.contratos_assinatura WHERE clinica_id = NEW.clinica_id;
  END IF;
  RETURN NEW;
END;$$;
CREATE TRIGGER trg_ca_numero BEFORE INSERT ON public.contratos_assinatura
  FOR EACH ROW EXECUTE FUNCTION public.contratos_assinatura_set_numero();

-- DEPENDENTES
CREATE TABLE public.contrato_dependentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.contratos_assinatura(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL,
  paciente_nome text NOT NULL,
  parentesco text,
  tipo text NOT NULL DEFAULT 'dependente', -- dependente | agregado
  incluido_em date NOT NULL DEFAULT CURRENT_DATE,
  excluido_em date,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.contrato_dependentes ENABLE ROW LEVEL SECURITY;
CREATE POLICY cd_select ON public.contrato_dependentes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contratos_assinatura c WHERE c.id=contrato_id AND is_member(auth.uid(), c.clinica_id)));
CREATE POLICY cd_insert ON public.contrato_dependentes FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.contratos_assinatura c WHERE c.id=contrato_id AND is_member(auth.uid(), c.clinica_id)));
CREATE POLICY cd_update ON public.contrato_dependentes FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contratos_assinatura c WHERE c.id=contrato_id AND is_member(auth.uid(), c.clinica_id)));
CREATE POLICY cd_delete ON public.contrato_dependentes FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.contratos_assinatura c WHERE c.id=contrato_id AND is_member(auth.uid(), c.clinica_id)));

-- MENSALIDADES
CREATE TABLE public.contrato_mensalidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_id uuid NOT NULL REFERENCES public.contratos_assinatura(id) ON DELETE CASCADE,
  clinica_id uuid NOT NULL,
  numero_parcela integer NOT NULL,
  vencimento date NOT NULL,
  valor numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendente', -- pendente | pago | atrasado | cancelado
  pago_em date,
  forma_pagamento text,
  valor_pago numeric,
  multa numeric DEFAULT 0,
  juros numeric DEFAULT 0,
  observacoes text,
  lancamento_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contrato_id, numero_parcela)
);
ALTER TABLE public.contrato_mensalidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY cm_select ON public.contrato_mensalidades FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY cm_insert ON public.contrato_mensalidades FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY cm_update ON public.contrato_mensalidades FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY cm_delete ON public.contrato_mensalidades FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE TRIGGER trg_cm_updated BEFORE UPDATE ON public.contrato_mensalidades FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Função para buscar contrato público para assinatura
CREATE OR REPLACE FUNCTION public.contrato_publico(_token text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _c record; _result jsonb;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN RAISE EXCEPTION 'Token inválido'; END IF;
  SELECT c.*, p.nome AS plano_nome, p.descricao_beneficios, p.template_contrato,
         p.tipo AS plano_tipo, cl.nome AS clinica_nome, cl.cnpj AS clinica_cnpj,
         cl.endereco AS clinica_endereco, cl.cidade AS clinica_cidade
  INTO _c FROM public.contratos_assinatura c
  JOIN public.planos_assinatura p ON p.id = c.plano_id
  LEFT JOIN public.clinicas cl ON cl.id = c.clinica_id
  WHERE c.token_publico = _token LIMIT 1;
  IF _c.id IS NULL THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
  _result := jsonb_build_object(
    'contrato', to_jsonb(_c),
    'dependentes', COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM public.contrato_dependentes d WHERE d.contrato_id = _c.id AND d.ativo), '[]'::jsonb)
  );
  RETURN _result;
END;$$;

CREATE OR REPLACE FUNCTION public.assinar_contrato_publico(_token text, _assinatura_svg text, _ip text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  IF _token IS NULL OR length(_token) < 16 THEN RAISE EXCEPTION 'Token inválido'; END IF;
  IF _assinatura_svg IS NULL OR length(_assinatura_svg) < 50 THEN RAISE EXCEPTION 'Assinatura inválida'; END IF;
  UPDATE public.contratos_assinatura
    SET assinatura_svg = _assinatura_svg,
        assinado_em = COALESCE(assinado_em, now()),
        assinatura_ip = _ip
  WHERE token_publico = _token
  RETURNING id INTO _id;
  IF _id IS NULL THEN RAISE EXCEPTION 'Contrato não encontrado'; END IF;
  RETURN _id;
END;$$;

GRANT EXECUTE ON FUNCTION public.contrato_publico(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assinar_contrato_publico(text, text, text) TO anon, authenticated;


CREATE TABLE public.orcamentos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID NOT NULL,
  numero INTEGER NOT NULL,
  paciente_id UUID,
  paciente_nome TEXT NOT NULL,
  paciente_telefone TEXT,
  paciente_cpf TEXT,
  medico_id UUID,
  medico_nome TEXT,
  validade_dias INTEGER NOT NULL DEFAULT 30,
  forma_pagamento TEXT,
  desconto NUMERIC NOT NULL DEFAULT 0,
  valor_total NUMERIC NOT NULL DEFAULT 0,
  observacoes TEXT,
  status TEXT NOT NULL DEFAULT 'aberto',
  criado_por UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE TABLE public.orcamento_itens (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  orcamento_id UUID NOT NULL REFERENCES public.orcamentos(id) ON DELETE CASCADE,
  procedimento_id UUID,
  descricao TEXT NOT NULL,
  quantidade NUMERIC NOT NULL DEFAULT 1,
  valor_unitario NUMERIC NOT NULL DEFAULT 0,
  valor_total NUMERIC NOT NULL DEFAULT 0,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_orcamentos_clinica ON public.orcamentos(clinica_id, created_at DESC);
CREATE INDEX idx_orcamentos_paciente ON public.orcamentos(paciente_id);
CREATE INDEX idx_orcamento_itens_orc ON public.orcamento_itens(orcamento_id);

ALTER TABLE public.orcamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orcamento_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY orc_select ON public.orcamentos FOR SELECT TO authenticated
  USING (is_member(auth.uid(), clinica_id));
CREATE POLICY orc_insert ON public.orcamentos FOR INSERT TO authenticated
  WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY orc_update ON public.orcamentos FOR UPDATE TO authenticated
  USING (is_member(auth.uid(), clinica_id));
CREATE POLICY orc_delete ON public.orcamentos FOR DELETE TO authenticated
  USING (can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY orci_select ON public.orcamento_itens FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orcamentos o WHERE o.id = orcamento_itens.orcamento_id AND is_member(auth.uid(), o.clinica_id)));
CREATE POLICY orci_insert ON public.orcamento_itens FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.orcamentos o WHERE o.id = orcamento_itens.orcamento_id AND is_member(auth.uid(), o.clinica_id)));
CREATE POLICY orci_update ON public.orcamento_itens FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orcamentos o WHERE o.id = orcamento_itens.orcamento_id AND is_member(auth.uid(), o.clinica_id)));
CREATE POLICY orci_delete ON public.orcamento_itens FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.orcamentos o WHERE o.id = orcamento_itens.orcamento_id AND is_member(auth.uid(), o.clinica_id)));

CREATE TRIGGER trg_orcamentos_updated BEFORE UPDATE ON public.orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Função para gerar número sequencial do orçamento por clínica
CREATE OR REPLACE FUNCTION public.orcamentos_set_numero()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('orcamento:' || NEW.clinica_id::text));
    SELECT COALESCE(MAX(numero), 0) + 1 INTO NEW.numero
    FROM public.orcamentos WHERE clinica_id = NEW.clinica_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orcamentos_numero BEFORE INSERT ON public.orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.orcamentos_set_numero();

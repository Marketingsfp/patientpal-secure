
-- Tabela de Convênios (tipos de cartão benefícios)
CREATE TABLE public.cb_convenios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cb_convenios_clinica ON public.cb_convenios(clinica_id);

ALTER TABLE public.cb_convenios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ver convenios da clinica"
  ON public.cb_convenios FOR SELECT
  USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY "Gestores podem criar convenios"
  ON public.cb_convenios FOR INSERT
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "Gestores podem atualizar convenios"
  ON public.cb_convenios FOR UPDATE
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "Gestores podem excluir convenios"
  ON public.cb_convenios FOR DELETE
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_cb_convenios_updated
  BEFORE UPDATE ON public.cb_convenios
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Tabela de Benefícios (vinculados a um convênio)
CREATE TABLE public.cb_beneficios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  convenio_id UUID NOT NULL REFERENCES public.cb_convenios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cb_beneficios_clinica ON public.cb_beneficios(clinica_id);
CREATE INDEX idx_cb_beneficios_convenio ON public.cb_beneficios(convenio_id);

ALTER TABLE public.cb_beneficios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ver beneficios da clinica"
  ON public.cb_beneficios FOR SELECT
  USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY "Gestores podem criar beneficios"
  ON public.cb_beneficios FOR INSERT
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "Gestores podem atualizar beneficios"
  ON public.cb_beneficios FOR UPDATE
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "Gestores podem excluir beneficios"
  ON public.cb_beneficios FOR DELETE
  USING (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_cb_beneficios_updated
  BEFORE UPDATE ON public.cb_beneficios
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

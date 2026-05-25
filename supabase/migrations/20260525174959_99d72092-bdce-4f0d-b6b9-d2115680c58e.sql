
DROP TABLE IF EXISTS public.cb_convenio_valores CASCADE;

CREATE TABLE public.cb_convenio_faixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  convenio_id uuid NOT NULL REFERENCES public.cb_convenios(id) ON DELETE CASCADE,
  vidas_de integer NOT NULL CHECK (vidas_de >= 1),
  vidas_ate integer NULL CHECK (vidas_ate IS NULL OR vidas_ate >= vidas_de),
  valor_mensal numeric(10,2) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_cb_convenio_faixas_convenio ON public.cb_convenio_faixas(convenio_id);

ALTER TABLE public.cb_convenio_faixas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros leem faixas"
ON public.cb_convenio_faixas FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.cb_convenios c
  WHERE c.id = cb_convenio_faixas.convenio_id
    AND public.is_member(auth.uid(), c.clinica_id)
));

CREATE POLICY "Gestores inserem faixas"
ON public.cb_convenio_faixas FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM public.cb_convenios c
  WHERE c.id = cb_convenio_faixas.convenio_id
    AND public.can_manage_clinica(auth.uid(), c.clinica_id)
));

CREATE POLICY "Gestores atualizam faixas"
ON public.cb_convenio_faixas FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM public.cb_convenios c
  WHERE c.id = cb_convenio_faixas.convenio_id
    AND public.can_manage_clinica(auth.uid(), c.clinica_id)
));

CREATE POLICY "Gestores excluem faixas"
ON public.cb_convenio_faixas FOR DELETE
USING (EXISTS (
  SELECT 1 FROM public.cb_convenios c
  WHERE c.id = cb_convenio_faixas.convenio_id
    AND public.can_manage_clinica(auth.uid(), c.clinica_id)
));

CREATE TRIGGER trg_cb_convenio_faixas_updated_at
BEFORE UPDATE ON public.cb_convenio_faixas
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

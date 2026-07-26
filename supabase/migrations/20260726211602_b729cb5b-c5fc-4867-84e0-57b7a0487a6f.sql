ALTER TABLE public.cb_convenios
  ADD COLUMN IF NOT EXISTS modalidade text;

ALTER TABLE public.cb_convenios
  DROP CONSTRAINT IF EXISTS cb_convenios_modalidade_check;
ALTER TABLE public.cb_convenios
  ADD CONSTRAINT cb_convenios_modalidade_check
  CHECK (modalidade IS NULL OR modalidade IN ('cartao_consulta','cartao_desconto'));

UPDATE public.cb_convenios
SET modalidade = CASE
  WHEN upper(translate(nome,'ÃÁÂÀÉÊÍÓÔÕÚÇ','AAAAEEIOOOUC')) LIKE '%DESCONTO%' THEN 'cartao_desconto'
  ELSE 'cartao_consulta'
END
WHERE modalidade IS NULL;

ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS convenio_id uuid REFERENCES public.cb_convenios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contrato_id uuid REFERENCES public.contratos_assinatura(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS convenio_modalidade text;

ALTER TABLE public.fin_lancamentos
  DROP CONSTRAINT IF EXISTS fin_lancamentos_convenio_modalidade_check;
ALTER TABLE public.fin_lancamentos
  ADD CONSTRAINT fin_lancamentos_convenio_modalidade_check
  CHECK (convenio_modalidade IS NULL OR convenio_modalidade IN ('cartao_consulta','cartao_desconto'));

CREATE INDEX IF NOT EXISTS idx_fin_lanc_convenio ON public.fin_lancamentos(convenio_id);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_contrato ON public.fin_lancamentos(contrato_id);
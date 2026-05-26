ALTER TABLE public.contratos_assinatura ADD COLUMN IF NOT EXISTS convenio_id uuid REFERENCES public.cb_convenios(id) ON DELETE RESTRICT;
ALTER TABLE public.contratos_assinatura ALTER COLUMN plano_id DROP NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contratos_assinatura_convenio ON public.contratos_assinatura(convenio_id);
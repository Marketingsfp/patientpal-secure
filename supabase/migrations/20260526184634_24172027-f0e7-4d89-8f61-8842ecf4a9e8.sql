ALTER TABLE public.boletos
  ADD COLUMN IF NOT EXISTS contrato_id UUID REFERENCES public.contratos_assinatura(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS mensalidade_id UUID REFERENCES public.contrato_mensalidades(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS codigo_barras TEXT,
  ADD COLUMN IF NOT EXISTS banco TEXT,
  ADD COLUMN IF NOT EXISTS erro_emissao TEXT,
  ADD COLUMN IF NOT EXISTS emitido_em TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_boletos_mensalidade ON public.boletos(mensalidade_id) WHERE mensalidade_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_boletos_contrato ON public.boletos(contrato_id);
CREATE INDEX IF NOT EXISTS idx_boletos_clinica_status ON public.boletos(clinica_id, status);
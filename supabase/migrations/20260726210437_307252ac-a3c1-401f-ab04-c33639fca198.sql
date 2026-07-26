ALTER TABLE public.medico_convenios
  ADD COLUMN IF NOT EXISTS convenio_tipo_repasse text,
  ADD COLUMN IF NOT EXISTS convenio_percentual numeric(5,2),
  ADD COLUMN IF NOT EXISTS convenio_valor numeric(12,2),
  ADD COLUMN IF NOT EXISTS cartao_consulta_valor numeric(12,2),
  ADD COLUMN IF NOT EXISTS cartao_desconto_valor numeric(12,2);

ALTER TABLE public.medico_convenios
  DROP CONSTRAINT IF EXISTS medico_convenios_convenio_tipo_repasse_check;

ALTER TABLE public.medico_convenios
  ADD CONSTRAINT medico_convenios_convenio_tipo_repasse_check
  CHECK (convenio_tipo_repasse IS NULL OR convenio_tipo_repasse IN ('percentual','valor'));

COMMENT ON COLUMN public.medico_convenios.tipo_repasse IS 'Repasse PARTICULAR: tipo (percentual|valor)';
COMMENT ON COLUMN public.medico_convenios.percentual IS 'Repasse PARTICULAR: percentual';
COMMENT ON COLUMN public.medico_convenios.valor IS 'Repasse PARTICULAR: valor fixo';
COMMENT ON COLUMN public.medico_convenios.convenio_tipo_repasse IS 'Repasse CONVENIO: tipo (percentual|valor). Nulo = usa repasse padrao do medico';
COMMENT ON COLUMN public.medico_convenios.cartao_consulta_valor IS 'Repasse CARTAO CONSULTA: valor fixo. Nulo = usa repasse padrao do medico';
COMMENT ON COLUMN public.medico_convenios.cartao_desconto_valor IS 'Repasse CARTAO DESCONTO: valor fixo. Nulo = usa repasse padrao do medico';
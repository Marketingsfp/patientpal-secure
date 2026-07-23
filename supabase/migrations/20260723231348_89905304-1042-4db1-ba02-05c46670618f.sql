ALTER TABLE public.cb_convenio_regras
  DROP CONSTRAINT IF EXISTS cb_convenio_regras_limite_ck;

ALTER TABLE public.cb_convenio_regras
  ADD CONSTRAINT cb_convenio_regras_limite_ck CHECK (
    limite_qtd IS NULL OR (
      limite_qtd > 0
      AND limite_periodo IN ('dia','semana','mes','contrato')
      AND limite_escopo IN ('contrato','paciente','titular_ou_dependente')
      AND excedente_modo IN ('percentual_particular','valor_fixo','particular','bloquear','regra_padrao_convenio')
    )
  );

COMMENT ON COLUMN public.cb_convenio_regras.excedente_modo IS
  'Como cobrar quando o limite for atingido: percentual_particular | valor_fixo | particular | bloquear | regra_padrao_convenio (cai na regra genérica do convênio; se não houver, cobra particular).';
ALTER TABLE public.cb_convenio_regras
  ADD COLUMN IF NOT EXISTS limite_qtd integer,
  ADD COLUMN IF NOT EXISTS limite_periodo text DEFAULT 'dia',
  ADD COLUMN IF NOT EXISTS limite_escopo text DEFAULT 'contrato',
  ADD COLUMN IF NOT EXISTS excedente_modo text,
  ADD COLUMN IF NOT EXISTS excedente_percentual numeric,
  ADD COLUMN IF NOT EXISTS excedente_valor numeric;

ALTER TABLE public.cb_convenio_regras
  DROP CONSTRAINT IF EXISTS cb_convenio_regras_limite_ck;

ALTER TABLE public.cb_convenio_regras
  ADD CONSTRAINT cb_convenio_regras_limite_ck CHECK (
    limite_qtd IS NULL
    OR (
      limite_qtd > 0
      AND limite_periodo IN ('dia','semana','mes')
      AND limite_escopo IN ('contrato','paciente')
      AND excedente_modo IN ('percentual_particular','valor_fixo','particular','bloquear')
    )
  );

COMMENT ON COLUMN public.cb_convenio_regras.limite_qtd IS 'Qtd máxima de aplicações da regra por período (null = sem limite)';
COMMENT ON COLUMN public.cb_convenio_regras.limite_periodo IS 'dia | semana | mes';
COMMENT ON COLUMN public.cb_convenio_regras.limite_escopo IS 'contrato = titular+dependentes contam juntos; paciente = por paciente';
COMMENT ON COLUMN public.cb_convenio_regras.excedente_modo IS 'Como cobrar quando o limite for atingido: percentual_particular | valor_fixo | particular | bloquear';
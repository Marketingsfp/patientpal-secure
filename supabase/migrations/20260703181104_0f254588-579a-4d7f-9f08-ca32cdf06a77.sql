ALTER TABLE public.cb_beneficios
  ADD COLUMN IF NOT EXISTS limite_qtd integer,
  ADD COLUMN IF NOT EXISTS limite_periodo text DEFAULT 'dia',
  ADD COLUMN IF NOT EXISTS limite_escopo text DEFAULT 'contrato',
  ADD COLUMN IF NOT EXISTS excedente_modo text,
  ADD COLUMN IF NOT EXISTS excedente_percentual numeric,
  ADD COLUMN IF NOT EXISTS excedente_valor numeric;

ALTER TABLE public.cb_beneficios
  DROP CONSTRAINT IF EXISTS cb_beneficios_limite_ck;

ALTER TABLE public.cb_beneficios
  ADD CONSTRAINT cb_beneficios_limite_ck CHECK (
    limite_qtd IS NULL
    OR (
      limite_qtd > 0
      AND limite_periodo IN ('dia','semana','mes')
      AND limite_escopo IN ('contrato','paciente')
      AND excedente_modo IN ('percentual_particular','valor_fixo','particular','bloquear')
    )
  );
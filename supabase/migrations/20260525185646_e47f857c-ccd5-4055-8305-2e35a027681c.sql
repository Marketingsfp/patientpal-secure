
ALTER TABLE public.cb_beneficios
  ADD COLUMN IF NOT EXISTS escopo text NOT NULL DEFAULT 'servico',
  ADD COLUMN IF NOT EXISTS procedimento_id uuid REFERENCES public.procedimentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS especialidade_id uuid REFERENCES public.especialidades(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_desconto text NOT NULL DEFAULT 'percentual',
  ADD COLUMN IF NOT EXISTS valor_desconto numeric(12,2),
  ADD COLUMN IF NOT EXISTS inicio_a_partir integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS limite_uso text NOT NULL DEFAULT 'ilimitado',
  ADD COLUMN IF NOT EXISTS periodicidade text NOT NULL DEFAULT 'contrato',
  ADD COLUMN IF NOT EXISTS pessoa text NOT NULL DEFAULT 'titular';

ALTER TABLE public.cb_beneficios
  DROP CONSTRAINT IF EXISTS cb_beneficios_escopo_chk,
  DROP CONSTRAINT IF EXISTS cb_beneficios_tipo_desconto_chk,
  DROP CONSTRAINT IF EXISTS cb_beneficios_inicio_chk,
  DROP CONSTRAINT IF EXISTS cb_beneficios_limite_chk,
  DROP CONSTRAINT IF EXISTS cb_beneficios_periodicidade_chk,
  DROP CONSTRAINT IF EXISTS cb_beneficios_pessoa_chk,
  DROP CONSTRAINT IF EXISTS cb_beneficios_alvo_chk,
  DROP CONSTRAINT IF EXISTS cb_beneficios_valor_chk;

ALTER TABLE public.cb_beneficios
  ADD CONSTRAINT cb_beneficios_escopo_chk CHECK (escopo IN ('servico','especialidade')),
  ADD CONSTRAINT cb_beneficios_tipo_desconto_chk CHECK (tipo_desconto IN ('percentual','valor','gratuidade')),
  ADD CONSTRAINT cb_beneficios_inicio_chk CHECK (inicio_a_partir IN (1,2,6)),
  ADD CONSTRAINT cb_beneficios_limite_chk CHECK (limite_uso IN ('ilimitado','1')),
  ADD CONSTRAINT cb_beneficios_periodicidade_chk CHECK (periodicidade IN ('dia','mes','contrato')),
  ADD CONSTRAINT cb_beneficios_pessoa_chk CHECK (pessoa IN ('titular','titular_dependentes_soma','titular_ou_dependentes')),
  ADD CONSTRAINT cb_beneficios_alvo_chk CHECK (
    (escopo = 'servico' AND procedimento_id IS NOT NULL) OR
    (escopo = 'especialidade' AND especialidade_id IS NOT NULL)
  ) NOT VALID,
  ADD CONSTRAINT cb_beneficios_valor_chk CHECK (
    tipo_desconto = 'gratuidade' OR (valor_desconto IS NOT NULL AND valor_desconto > 0)
  ) NOT VALID;

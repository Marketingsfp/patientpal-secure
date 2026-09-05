-- Regra única de normalização de telefone (mesma do app: remove DDI 55 e mantém os últimos 11 dígitos)
CREATE OR REPLACE FUNCTION public.normalizar_telefone(_tel text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    CASE
      WHEN left(d, 2) = '55' AND length(d) > 11 THEN right(substr(d, 3), 11)
      ELSE right(d, 11)
    END, '')
  FROM (SELECT regexp_replace(COALESCE(_tel, ''), '\D', '', 'g') AS d) s;
$$;

ALTER TABLE public.atend_conversas
  ADD COLUMN IF NOT EXISTS contato_telefone_norm text
  GENERATED ALWAYS AS (public.normalizar_telefone(contato_telefone)) STORED;

ALTER TABLE public.pacientes
  ADD COLUMN IF NOT EXISTS telefone_norm text
  GENERATED ALWAYS AS (public.normalizar_telefone(telefone)) STORED,
  ADD COLUMN IF NOT EXISTS telefone2_norm text
  GENERATED ALWAYS AS (public.normalizar_telefone(telefone2)) STORED;

CREATE INDEX IF NOT EXISTS idx_atend_conv_tel_norm
  ON public.atend_conversas (clinica_id, contato_telefone_norm)
  WHERE contato_telefone_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_atend_conv_paciente
  ON public.atend_conversas (clinica_id, contato_paciente_id)
  WHERE contato_paciente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pacientes_tel_norm
  ON public.pacientes (clinica_id, telefone_norm)
  WHERE telefone_norm IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pacientes_tel2_norm
  ON public.pacientes (clinica_id, telefone2_norm)
  WHERE telefone2_norm IS NOT NULL;
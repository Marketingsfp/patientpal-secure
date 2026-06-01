ALTER TABLE public.cb_beneficios DROP CONSTRAINT IF EXISTS cb_beneficios_escopo_chk;
ALTER TABLE public.cb_beneficios ADD CONSTRAINT cb_beneficios_escopo_chk
  CHECK (escopo = ANY (ARRAY['servico'::text, 'especialidade'::text, 'consulta'::text]));

ALTER TABLE public.cb_beneficios DROP CONSTRAINT IF EXISTS cb_beneficios_alvo_chk;
ALTER TABLE public.cb_beneficios ADD CONSTRAINT cb_beneficios_alvo_chk
  CHECK (
    (escopo = 'servico' AND procedimento_id IS NOT NULL)
    OR (escopo = 'especialidade' AND especialidade_id IS NOT NULL)
    OR (escopo = 'consulta')
  ) NOT VALID;

ALTER TABLE public.cb_beneficios ADD COLUMN IF NOT EXISTS prioridade integer NOT NULL DEFAULT 1;
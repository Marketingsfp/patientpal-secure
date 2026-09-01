ALTER TABLE public.clinicas DROP CONSTRAINT IF EXISTS clinicas_cnpj_key;
DROP INDEX IF EXISTS public.clinicas_cnpj_key;
CREATE INDEX IF NOT EXISTS clinicas_cnpj_idx ON public.clinicas (cnpj);
DROP INDEX IF EXISTS public.pacientes_codigo_prontuario_unq;
CREATE INDEX IF NOT EXISTS pacientes_codigo_prontuario_idx ON public.pacientes (clinica_id, codigo_prontuario);
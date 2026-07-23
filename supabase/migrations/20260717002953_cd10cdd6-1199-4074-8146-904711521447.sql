ALTER TABLE public.agendamentos DROP COLUMN IF EXISTS enfermagem_recurso_id;
DROP TABLE IF EXISTS public.enfermagem_recurso_atendentes CASCADE;
DROP TABLE IF EXISTS public.enfermagem_recurso_disponibilidades CASCADE;
DROP TABLE IF EXISTS public.enfermagem_recurso_procedimentos CASCADE;
DROP TABLE IF EXISTS public.enfermagem_recursos CASCADE;
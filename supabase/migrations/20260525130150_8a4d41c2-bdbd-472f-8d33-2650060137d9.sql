ALTER TABLE public.medicos ADD COLUMN IF NOT EXISTS telefone2 text;
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS telefone2 text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS telefone2 text;

ALTER TABLE public.pacientes DROP CONSTRAINT IF EXISTS pacientes_tel2_chk;
ALTER TABLE public.pacientes ADD CONSTRAINT pacientes_tel2_chk CHECK (telefone2 IS NULL OR length(telefone2) <= 30);
ALTER TABLE public.medicos
  ADD COLUMN IF NOT EXISTS tem_rqe boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rqe_especialidade text;

ALTER TABLE public.medicos
  DROP CONSTRAINT IF EXISTS medicos_rqe_especialidade_len;

ALTER TABLE public.medicos
  ADD CONSTRAINT medicos_rqe_especialidade_len
  CHECK (rqe_especialidade IS NULL OR length(rqe_especialidade) BETWEEN 1 AND 200);
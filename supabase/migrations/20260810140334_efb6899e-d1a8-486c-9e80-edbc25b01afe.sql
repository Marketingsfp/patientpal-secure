ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS is_mock_data boolean NOT NULL DEFAULT false;
ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS is_mock_data boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_pacientes_is_mock_data ON public.pacientes (clinica_id) WHERE is_mock_data;
CREATE INDEX IF NOT EXISTS idx_agendamentos_is_mock_data ON public.agendamentos (clinica_id) WHERE is_mock_data;
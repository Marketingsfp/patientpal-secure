CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_pacientes_nome_trgm
  ON public.pacientes USING gin (nome gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_pacientes_clinica_ativo_nome
  ON public.pacientes (clinica_id, ativo, nome);

CREATE INDEX IF NOT EXISTS idx_pacientes_codigo_prontuario_trgm
  ON public.pacientes USING gin (codigo_prontuario gin_trgm_ops)
  WHERE codigo_prontuario IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pacientes_clinica_codigo_desc
  ON public.pacientes (clinica_id, codigo_prontuario DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_pacientes_clinica_cpf
  ON public.pacientes (clinica_id, cpf)
  WHERE cpf IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pacientes_clinica_created
  ON public.pacientes (clinica_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_procedimentos_clinica_ativo_nome
  ON public.procedimentos (clinica_id, ativo, nome);

CREATE INDEX IF NOT EXISTS idx_procedimentos_clinica_grupo_nome
  ON public.procedimentos (clinica_id, grupo NULLS LAST, nome);

CREATE INDEX IF NOT EXISTS idx_fin_lanc_clinica_data_asc
  ON public.fin_lancamentos (clinica_id, data);

CREATE INDEX IF NOT EXISTS idx_fin_lanc_clinica_paciente
  ON public.fin_lancamentos (clinica_id, paciente_id)
  WHERE paciente_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_fin_lanc_clinica_medico
  ON public.fin_lancamentos (clinica_id, medico_id)
  WHERE medico_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_paciente_nome_trgm
  ON public.agendamentos USING gin (paciente_nome gin_trgm_ops)
  WHERE paciente_nome IS NOT NULL;

ANALYZE public.pacientes;
ANALYZE public.procedimentos;
ANALYZE public.fin_lancamentos;
ANALYZE public.agendamentos;
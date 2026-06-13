-- Performance: índices para alta concorrência (30→150 usuários)
-- 1) Busca de pacientes por CPF / telefone / e-mail / nome com ILIKE (multi-coluna OR)
CREATE INDEX IF NOT EXISTS idx_pacientes_cpf_trgm
  ON public.pacientes USING gin (cpf gin_trgm_ops) WHERE cpf IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pacientes_telefone_trgm
  ON public.pacientes USING gin (telefone gin_trgm_ops) WHERE telefone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pacientes_email_trgm
  ON public.pacientes USING gin (email gin_trgm_ops) WHERE email IS NOT NULL;

-- 2) Dashboard financeiro: filtro frequente clinica+tipo+status+data DESC
CREATE INDEX IF NOT EXISTS idx_fin_lanc_clinica_tipo_status_data
  ON public.fin_lancamentos (clinica_id, tipo, status, data DESC);

-- 3) Notas: listagem por data_emissao DESC
CREATE INDEX IF NOT EXISTS idx_fin_notas_clinica_data
  ON public.fin_notas_pacientes (clinica_id, data_emissao DESC);

-- 4) Atendimentos por paciente (timeline da ficha do paciente)
CREATE INDEX IF NOT EXISTS idx_fin_atend_paciente_data
  ON public.fin_atendimentos (paciente_id, data DESC) WHERE paciente_id IS NOT NULL;

-- 5) Agendamentos: lookup por (clinica, paciente_id, inicio) — ficha
CREATE INDEX IF NOT EXISTS idx_agend_clinica_paciente_inicio
  ON public.agendamentos (clinica_id, paciente_id, inicio DESC) WHERE paciente_id IS NOT NULL;

-- 6) Reduzir agressividade da cron de vinculação (lotes menores + menos frequente)
--    para liberar CPU/locks durante uso simultâneo
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron') THEN
    PERFORM cron.unschedule('mj-apply-match-plan');
    PERFORM cron.schedule(
      'mj-apply-match-plan',
      '*/2 * * * *',  -- a cada 2 minutos
      $job$SELECT public._mj_apply_batch(500);$job$  -- lotes de 500 (era 2000)
    );
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

ANALYZE public.pacientes;
ANALYZE public.fin_lancamentos;
ANALYZE public.fin_atendimentos;
ANALYZE public.agendamentos;
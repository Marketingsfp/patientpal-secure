ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS atendimento_grupo_id uuid;

CREATE INDEX IF NOT EXISTS idx_agendamentos_atendimento_grupo
  ON public.agendamentos (atendimento_grupo_id)
  WHERE atendimento_grupo_id IS NOT NULL;

COMMENT ON COLUMN public.agendamentos.atendimento_grupo_id IS
  'Vincula agendamentos criados no mesmo fluxo de Atendimento Multiplo (recepcao marca N servicos diferentes de uma vez). Opcional. Cada agendamento continua com seu proprio valor, GR e fin_atendimento.';
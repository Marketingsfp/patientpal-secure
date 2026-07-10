DROP INDEX IF EXISTS public.ux_fin_lancamentos_agendamento_receita;

CREATE UNIQUE INDEX ux_fin_lancamentos_agendamento_receita
ON public.fin_lancamentos (agendamento_id)
WHERE agendamento_id IS NOT NULL
  AND tipo = 'receita'
  AND status <> 'cancelado';
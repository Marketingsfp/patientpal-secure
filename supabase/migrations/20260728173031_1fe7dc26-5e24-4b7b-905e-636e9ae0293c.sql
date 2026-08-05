
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS origem_externa boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS origem_clinica_id uuid NULL REFERENCES public.clinicas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origem_clinica_nome text NULL,
  ADD COLUMN IF NOT EXISTS origem_gr_numero text NULL,
  ADD COLUMN IF NOT EXISTS origem_valor numeric(12,2) NULL;

CREATE INDEX IF NOT EXISTS idx_agendamentos_origem_externa
  ON public.agendamentos (clinica_id, origem_externa, inicio)
  WHERE origem_externa = true;

COMMENT ON COLUMN public.agendamentos.origem_externa IS
  'Quando true, este atendimento foi faturado em outra clínica (parceira). Não gera cobrança em caixa aqui — usado apenas para repasse do médico local e conferência.';
COMMENT ON COLUMN public.agendamentos.origem_gr_numero IS
  'Número da GR/comprovante emitido pela clínica de origem. Obrigatório quando origem_externa=true.';

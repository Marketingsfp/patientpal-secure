DO $$ BEGIN
  CREATE TYPE public.fluxo_etapa AS ENUM (
    'aguardando_recepcao',
    'recepcao',
    'caixa',
    'triagem',
    'atendimento',
    'exame',
    'finalizado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS fluxo_etapa public.fluxo_etapa NOT NULL DEFAULT 'aguardando_recepcao',
  ADD COLUMN IF NOT EXISTS fluxo_atualizado_em timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_agendamentos_fluxo_dia
  ON public.agendamentos (clinica_id, fluxo_etapa, inicio);
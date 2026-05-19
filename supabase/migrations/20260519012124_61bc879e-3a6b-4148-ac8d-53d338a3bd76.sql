-- Adiciona prioridade ao agendamento (idoso, gestante, deficiente, urgência, etc.)
DO $$ BEGIN
  CREATE TYPE public.agendamento_prioridade AS ENUM ('normal', 'prioritario', 'urgente');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS prioridade public.agendamento_prioridade NOT NULL DEFAULT 'normal';

CREATE INDEX IF NOT EXISTS idx_agendamentos_prioridade ON public.agendamentos (clinica_id, prioridade);
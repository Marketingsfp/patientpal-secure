
-- 1) Procedimentos: flag requer_laudo
ALTER TABLE public.procedimentos
  ADD COLUMN IF NOT EXISTS requer_laudo boolean NOT NULL DEFAULT false;

-- 2) Fin atendimentos: campos de laudo
ALTER TABLE public.fin_atendimentos
  ADD COLUMN IF NOT EXISTS medico_laudador_id uuid REFERENCES public.medicos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valor_laudo numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS laudo_status text,
  ADD COLUMN IF NOT EXISTS laudo_emitido_em timestamptz,
  ADD COLUMN IF NOT EXISTS laudo_lancamento_id uuid REFERENCES public.fin_atendimentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS laudo_de_atendimento_id uuid REFERENCES public.fin_atendimentos(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_fin_atend_laudador
  ON public.fin_atendimentos(medico_laudador_id, laudo_status)
  WHERE medico_laudador_id IS NOT NULL;

-- 3) Trigger: ao marcar laudo_status = 'emitido', criar repasse do laudador
CREATE OR REPLACE FUNCTION public.gerar_repasse_laudador()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_novo_id uuid;
BEGIN
  -- Só age quando o status passa para 'emitido' nesta operação
  IF NEW.laudo_status IS DISTINCT FROM 'emitido' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.laudo_status = 'emitido' THEN
    RETURN NEW;
  END IF;
  IF NEW.medico_laudador_id IS NULL OR COALESCE(NEW.valor_laudo,0) <= 0 THEN
    RETURN NEW;
  END IF;
  -- Não criar se já existe
  IF NEW.laudo_lancamento_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.fin_atendimentos (
    clinica_id, paciente_id, medico_id, data, procedimento,
    valor_total, valor_medico, valor_clinica,
    forma_pagamento, status, observacoes, laudo_de_atendimento_id
  ) VALUES (
    NEW.clinica_id, NEW.paciente_id, NEW.medico_laudador_id,
    COALESCE(NEW.laudo_emitido_em::date, CURRENT_DATE),
    '[LAUDO] ' || COALESCE(NEW.procedimento, ''),
    NEW.valor_laudo, NEW.valor_laudo, 0,
    'laudo', 'realizado',
    'Repasse de laudo do atendimento ' || NEW.id::text,
    NEW.id
  ) RETURNING id INTO v_novo_id;

  NEW.laudo_lancamento_id := v_novo_id;
  IF NEW.laudo_emitido_em IS NULL THEN
    NEW.laudo_emitido_em := now();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gerar_repasse_laudador ON public.fin_atendimentos;
CREATE TRIGGER trg_gerar_repasse_laudador
  BEFORE INSERT OR UPDATE OF laudo_status ON public.fin_atendimentos
  FOR EACH ROW EXECUTE FUNCTION public.gerar_repasse_laudador();

-- 4) Limpeza de duplicatas de agenda (slots vazios)
WITH dup AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY clinica_id, medico_id, agenda_id, inicio
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.agendamentos
  WHERE status = 'agendado'
    AND paciente_id IS NULL
)
DELETE FROM public.agendamentos a
USING dup
WHERE a.id = dup.id AND dup.rn > 1;

-- 5) Índice único para impedir slots vazios duplicados (mesmo agenda+medico+inicio)
CREATE UNIQUE INDEX IF NOT EXISTS uq_agend_slot_vazio
  ON public.agendamentos (clinica_id, medico_id, agenda_id, inicio)
  WHERE paciente_id IS NULL AND status = 'agendado';

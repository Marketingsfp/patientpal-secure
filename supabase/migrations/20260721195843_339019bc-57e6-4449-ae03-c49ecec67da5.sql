
CREATE OR REPLACE FUNCTION public.gerar_repasse_laudador_lanc()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_novo_id uuid;
  v_proc text;
  v_data date;
BEGIN
  IF NEW.laudo_status IS DISTINCT FROM 'emitido' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.laudo_status = 'emitido' THEN RETURN NEW; END IF;
  IF NEW.medico_laudador_id IS NULL OR COALESCE(NEW.valor_laudo,0) <= 0 THEN RETURN NEW; END IF;
  IF NEW.laudo_lancamento_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT a.procedimento, a.inicio::date INTO v_proc, v_data
    FROM public.agendamentos a
   WHERE a.id = NEW.agendamento_id;

  -- Usa a data do atendimento (agendamento ou lançamento) para que o repasse
  -- do laudo apareça no mesmo período do serviço realizado.
  v_data := COALESCE(v_data, NEW.data, CURRENT_DATE);

  INSERT INTO public.fin_atendimentos (
    clinica_id, paciente_id, medico_id, data, procedimento,
    valor_total, valor_medico, valor_clinica,
    forma_pagamento, status, observacoes
  ) VALUES (
    NEW.clinica_id, NEW.paciente_id, NEW.medico_laudador_id,
    v_data,
    '[LAUDO] ' || COALESCE(v_proc, NEW.descricao, ''),
    NEW.valor_laudo, NEW.valor_laudo, 0,
    'laudo', 'realizado',
    'Repasse de laudo do lançamento ' || NEW.id::text
  ) RETURNING id INTO v_novo_id;

  NEW.laudo_lancamento_id := v_novo_id;
  IF NEW.laudo_emitido_em IS NULL THEN NEW.laudo_emitido_em := now(); END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.gerar_repasse_laudador()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_novo_id uuid;
BEGIN
  IF NEW.laudo_status IS DISTINCT FROM 'emitido' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.laudo_status = 'emitido' THEN RETURN NEW; END IF;
  IF NEW.medico_laudador_id IS NULL OR COALESCE(NEW.valor_laudo,0) <= 0 THEN RETURN NEW; END IF;
  IF NEW.laudo_lancamento_id IS NOT NULL THEN RETURN NEW; END IF;
  -- Evita loop: não gerar repasse a partir de uma linha "[LAUDO]".
  IF NEW.procedimento IS NOT NULL AND NEW.procedimento LIKE '[LAUDO]%' THEN RETURN NEW; END IF;

  INSERT INTO public.fin_atendimentos (
    clinica_id, paciente_id, medico_id, data, procedimento,
    valor_total, valor_medico, valor_clinica,
    forma_pagamento, status, observacoes
  ) VALUES (
    NEW.clinica_id, NEW.paciente_id, NEW.medico_laudador_id,
    COALESCE(NEW.data, CURRENT_DATE),
    '[LAUDO] ' || COALESCE(NEW.procedimento, ''),
    NEW.valor_laudo, NEW.valor_laudo, 0,
    'laudo', 'realizado',
    'Repasse de laudo do atendimento ' || NEW.id::text
  ) RETURNING id INTO v_novo_id;

  NEW.laudo_lancamento_id := v_novo_id;
  IF NEW.laudo_emitido_em IS NULL THEN NEW.laudo_emitido_em := now(); END IF;
  RETURN NEW;
END;
$function$;

-- Backfill: alinhar data dos "[LAUDO]" existentes com a data do serviço original.
UPDATE public.fin_atendimentos fa
   SET data = COALESCE(a.inicio::date, l.data, fa.data)
  FROM public.fin_lancamentos l
  LEFT JOIN public.agendamentos a ON a.id = l.agendamento_id
 WHERE l.laudo_lancamento_id = fa.id
   AND fa.data <> COALESCE(a.inicio::date, l.data, fa.data);

UPDATE public.fin_atendimentos fa
   SET data = origem.data
  FROM public.fin_atendimentos origem
 WHERE origem.laudo_lancamento_id = fa.id
   AND fa.data <> origem.data;


DO $$
DECLARE
  v_clinica uuid; g record; v_fim_exp time; v_t timestamptz; v_limite timestamptz; v_tpl record;
BEGIN
  SELECT id INTO v_clinica FROM public.clinicas WHERE nome ILIKE '%menino jesus%' LIMIT 1;
  FOR g IN
    WITH b AS (
      SELECT a.medico_id, a.clinica_id, (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date AS d,
             MIN(bk.inicio) omin, MAX(bk.inicio) omax, COUNT(*) n, MAX(a.fim) curfim,
             mode() WITHIN GROUP (ORDER BY (EXTRACT(epoch FROM (a.fim-a.inicio))/60)::int) dur
      FROM public.agendamentos a
      JOIN public.agendamentos_respacamento_backup_20260805 bk ON bk.id = a.id
      WHERE a.clinica_id = v_clinica GROUP BY 1,2,3
    )
    SELECT * FROM b
    WHERE n > 1 AND EXTRACT(epoch FROM (omax-omin))/60 < (n-1)*dur*0.5
      AND d >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
  LOOP
    SELECT MAX(dp.hora_fim) INTO v_fim_exp FROM public.medico_disponibilidades dp
    WHERE dp.medico_id = g.medico_id AND dp.clinica_id = v_clinica AND dp.ativo
      AND dp.dia_semana = EXTRACT(dow FROM g.d);
    IF v_fim_exp IS NULL THEN CONTINUE; END IF;
    v_limite := (g.d + v_fim_exp) AT TIME ZONE 'America/Sao_Paulo';
    IF g.curfim >= v_limite THEN CONTINUE; END IF;

    SELECT * INTO v_tpl FROM public.agendamentos
    WHERE clinica_id = v_clinica AND medico_id = g.medico_id
      AND (inicio AT TIME ZONE 'America/Sao_Paulo')::date = g.d AND paciente_id IS NULL
    ORDER BY inicio DESC LIMIT 1;
    IF v_tpl IS NULL THEN CONTINUE; END IF;

    v_t := g.curfim;
    WHILE v_t + make_interval(mins => g.dur) <= v_limite LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.agendamentos o
        WHERE o.clinica_id = v_clinica AND o.medico_id = g.medico_id
          AND o.inicio < v_t + make_interval(mins => g.dur) AND o.fim > v_t
      ) THEN
        INSERT INTO public.agendamentos
          (clinica_id, medico_id, inicio, fim, paciente_nome, procedimento, status, agenda_id, especialidade_id, tipo_atendimento)
        VALUES (v_clinica, g.medico_id, v_t, v_t + make_interval(mins => g.dur),
                COALESCE(NULLIF(v_tpl.paciente_nome,''), ''), v_tpl.procedimento, v_tpl.status,
                v_tpl.agenda_id, v_tpl.especialidade_id, v_tpl.tipo_atendimento);
      END IF;
      v_t := v_t + make_interval(mins => g.dur);
    END LOOP;
  END LOOP;
END $$;

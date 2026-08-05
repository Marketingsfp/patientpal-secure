
CREATE TABLE IF NOT EXISTS public.agendamentos_respacamento_backup_20260805 (
  id uuid primary key, inicio timestamptz, fim timestamptz, salvo_em timestamptz default now(), removido boolean default false
);
ALTER TABLE public.agendamentos_respacamento_backup_20260805 ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.agendamentos_respacamento_backup_20260805 TO service_role;
DO $$
DECLARE
  v_clinica uuid;
  g record;
  v_dur int;
  v_ini timestamptz;
  v_end timestamptz;
  v_times timestamptz[];
  v_ids uuid[];
  v_i int;
  v_shift interval := interval '1000 years';
BEGIN
  SELECT id INTO v_clinica FROM public.clinicas WHERE nome ILIKE '%menino jesus%' LIMIT 1;
  IF v_clinica IS NULL THEN RAISE EXCEPTION 'clinica nao encontrada'; END IF;

  FOR g IN
    SELECT medico_id, (inicio AT TIME ZONE 'America/Sao_Paulo')::date AS d
    FROM public.agendamentos
    WHERE clinica_id = v_clinica
      AND (inicio AT TIME ZONE 'America/Sao_Paulo')::date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
      AND medico_id IS NOT NULL
    GROUP BY 1,2
  LOOP
    SELECT mode() WITHIN GROUP (ORDER BY (EXTRACT(epoch FROM (fim-inicio))/60)::int),
           MIN(inicio), MAX(fim)
      INTO v_dur, v_ini, v_end
    FROM public.agendamentos
    WHERE clinica_id = v_clinica AND medico_id = g.medico_id
      AND (inicio AT TIME ZONE 'America/Sao_Paulo')::date = g.d;

    IF v_dur IS NULL OR v_dur < 1 THEN CONTINUE; END IF;

    SELECT array_agg(id ORDER BY inicio, created_at) INTO v_ids
    FROM public.agendamentos
    WHERE clinica_id = v_clinica AND medico_id = g.medico_id
      AND (inicio AT TIME ZONE 'America/Sao_Paulo')::date = g.d
      AND paciente_id IS NULL;

    IF v_ids IS NULL THEN CONTINUE; END IF;

    SELECT array_agg(t ORDER BY t) INTO v_times
    FROM generate_series(v_ini, v_end - make_interval(mins => v_dur), make_interval(mins => v_dur)) t
    WHERE NOT EXISTS (
      SELECT 1 FROM public.agendamentos o
      WHERE o.clinica_id = v_clinica AND o.medico_id = g.medico_id
        AND o.paciente_id IS NOT NULL
        AND (o.inicio AT TIME ZONE 'America/Sao_Paulo')::date = g.d
        AND o.inicio < t + make_interval(mins => v_dur) AND o.fim > t
    );

    INSERT INTO public.agendamentos_respacamento_backup_20260805(id, inicio, fim)
    SELECT id, inicio, fim FROM public.agendamentos WHERE id = ANY(v_ids)
    ON CONFLICT (id) DO NOTHING;

    -- desloca temporariamente para evitar conflito de chave única
    UPDATE public.agendamentos SET inicio = inicio + v_shift, fim = fim + v_shift WHERE id = ANY(v_ids);

    FOR v_i IN 1 .. array_length(v_ids,1) LOOP
      IF v_times IS NULL OR v_i > array_length(v_times,1) THEN
        UPDATE public.agendamentos_respacamento_backup_20260805 SET removido = true WHERE id = v_ids[v_i];
        DELETE FROM public.agendamentos WHERE id = v_ids[v_i];
      ELSE
        UPDATE public.agendamentos
           SET inicio = v_times[v_i], fim = v_times[v_i] + make_interval(mins => v_dur)
         WHERE id = v_ids[v_i];
      END IF;
    END LOOP;
  END LOOP;
END $$;

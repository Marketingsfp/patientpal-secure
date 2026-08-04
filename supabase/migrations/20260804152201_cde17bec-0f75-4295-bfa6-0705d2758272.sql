CREATE OR REPLACE FUNCTION public.get_horarios_disponiveis(_clinica_id uuid, _especialidade_id uuid DEFAULT NULL::uuid, _medico_id uuid DEFAULT NULL::uuid, _dias integer DEFAULT 7, _limite integer DEFAULT 60)
 RETURNS TABLE(medico_id uuid, medico_nome text, especialidade_id uuid, especialidade_nome text, agenda_id uuid, agenda_nome text, inicio timestamp with time zone, fim timestamp with time zone, ocupados integer, capacidade integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_dias int := least(greatest(coalesce(_dias, 7), 1), 30);
  v_lim  int := least(greatest(coalesce(_limite, 60), 1), 500);
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_member(auth.uid(), _clinica_id) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH dias AS (
    SELECT (current_date + i) AS d
    FROM generate_series(0, v_dias - 1) g(i)
  ),
  disp AS (
    SELECT
      md.medico_id, md.agenda_id, md.hora_inicio, md.hora_fim,
      COALESCE(md.intervalo_min, 30) AS intervalo,
      COALESCE(md.limite_pacientes, 1) AS capacidade,
      md.dia_semana, md.vigencia_inicio, md.vigencia_fim,
      m.nome AS medico_nome, m.especialidade_id AS med_esp,
      e.nome AS esp_nome, ag.nome AS agenda_nome
    FROM public.medico_disponibilidades md
    JOIN public.medicos m ON m.id = md.medico_id AND m.ativo
    LEFT JOIN public.especialidades e ON e.id = m.especialidade_id
    LEFT JOIN public.medico_agendas ag ON ag.id = md.agenda_id
    WHERE md.clinica_id = _clinica_id
      AND md.ativo
      AND (_medico_id IS NULL OR md.medico_id = _medico_id)
      AND (
        _especialidade_id IS NULL
        OR m.especialidade_id = _especialidade_id
        OR EXISTS (
          SELECT 1 FROM public.medico_especialidades me
          WHERE me.medico_id = m.id AND me.especialidade_id = _especialidade_id
        )
      )
  ),
  slots AS (
    SELECT
      d.medico_id AS s_medico_id, d.medico_nome AS s_medico_nome,
      COALESCE(d.med_esp, _especialidade_id) AS s_especialidade_id,
      d.esp_nome AS s_especialidade_nome,
      d.agenda_id AS s_agenda_id, d.agenda_nome AS s_agenda_nome,
      d.capacidade AS s_capacidade,
      ((dias.d::timestamp + d.hora_inicio) AT TIME ZONE 'America/Sao_Paulo')
        + (s.i * (d.intervalo || ' minutes')::interval) AS s_inicio,
      ((dias.d::timestamp + d.hora_inicio) AT TIME ZONE 'America/Sao_Paulo')
        + ((s.i + 1) * (d.intervalo || ' minutes')::interval) AS s_fim
    FROM dias
    JOIN disp d
      ON d.dia_semana = EXTRACT(DOW FROM dias.d)::int
     AND (d.vigencia_inicio IS NULL OR dias.d >= d.vigencia_inicio)
     AND (d.vigencia_fim    IS NULL OR dias.d <= d.vigencia_fim)
    CROSS JOIN LATERAL generate_series(
      0,
      GREATEST(0, ((EXTRACT(EPOCH FROM (d.hora_fim - d.hora_inicio)) / 60)::int / d.intervalo) - 1)
    ) s(i)
  ),
  slots_ativos AS (
    SELECT * FROM slots WHERE slots.s_inicio >= now()
  ),
  contagem AS (
    SELECT s.s_medico_id, s.s_inicio, s.s_fim,
      COUNT(a.id)::int AS ocupados
    FROM slots_ativos s
    LEFT JOIN public.agendamentos a
      ON a.clinica_id = _clinica_id
     AND a.medico_id  = s.s_medico_id
     AND a.status <> 'cancelado'
     AND a.inicio < s.s_fim
     AND a.fim    > s.s_inicio
    GROUP BY s.s_medico_id, s.s_inicio, s.s_fim
  )
  SELECT
    s.s_medico_id, s.s_medico_nome, s.s_especialidade_id, s.s_especialidade_nome,
    s.s_agenda_id, s.s_agenda_nome, s.s_inicio, s.s_fim,
    c.ocupados, s.s_capacidade
  FROM slots_ativos s
  JOIN contagem c ON c.s_medico_id = s.s_medico_id AND c.s_inicio = s.s_inicio
  WHERE c.ocupados < s.s_capacidade
  ORDER BY s.s_inicio, s.s_medico_nome
  LIMIT v_lim;
END;
$function$;
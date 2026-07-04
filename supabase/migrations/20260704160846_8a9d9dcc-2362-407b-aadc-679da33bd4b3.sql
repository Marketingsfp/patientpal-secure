
-- =========================================================
-- RPC: get_horarios_disponiveis
-- Retorna os próximos N dias de horários livres, com base em
-- medico_disponibilidades - agendamentos existentes.
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_horarios_disponiveis(
  _clinica_id uuid,
  _especialidade_id uuid DEFAULT NULL,
  _medico_id uuid DEFAULT NULL,
  _dias integer DEFAULT 7,
  _limite integer DEFAULT 60
)
RETURNS TABLE (
  medico_id uuid,
  medico_nome text,
  especialidade_id uuid,
  especialidade_nome text,
  agenda_id uuid,
  agenda_nome text,
  inicio timestamptz,
  fim timestamptz,
  ocupados integer,
  capacidade integer
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
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
      d.medico_id, d.medico_nome,
      COALESCE(d.med_esp, _especialidade_id) AS especialidade_id,
      d.esp_nome AS especialidade_nome,
      d.agenda_id, d.agenda_nome,
      d.capacidade,
      ((dias.d::timestamp + d.hora_inicio) AT TIME ZONE 'America/Sao_Paulo')
        + (s.i * (d.intervalo || ' minutes')::interval) AS inicio,
      ((dias.d::timestamp + d.hora_inicio) AT TIME ZONE 'America/Sao_Paulo')
        + ((s.i + 1) * (d.intervalo || ' minutes')::interval) AS fim
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
    SELECT * FROM slots WHERE inicio >= now()
  ),
  contagem AS (
    SELECT s.medico_id, s.inicio, s.fim,
      COUNT(a.id)::int AS ocupados
    FROM slots_ativos s
    LEFT JOIN public.agendamentos a
      ON a.clinica_id = _clinica_id
     AND a.medico_id  = s.medico_id
     AND a.status <> 'cancelado'
     AND a.inicio < s.fim
     AND a.fim    > s.inicio
    GROUP BY s.medico_id, s.inicio, s.fim
  )
  SELECT
    s.medico_id, s.medico_nome, s.especialidade_id, s.especialidade_nome,
    s.agenda_id, s.agenda_nome, s.inicio, s.fim,
    c.ocupados, s.capacidade
  FROM slots_ativos s
  JOIN contagem c ON c.medico_id = s.medico_id AND c.inicio = s.inicio
  WHERE c.ocupados < s.capacidade
  ORDER BY s.inicio, s.medico_nome
  LIMIT v_lim;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_horarios_disponiveis(uuid, uuid, uuid, integer, integer) TO authenticated;

-- =========================================================
-- RPC: get_ultimo_agendamento_paciente
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_ultimo_agendamento_paciente(
  _paciente_id uuid
)
RETURNS TABLE (
  medico_id uuid,
  medico_nome text,
  especialidade_id uuid,
  especialidade_nome text,
  procedimento text,
  clinica_id uuid,
  inicio timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.medico_id, m.nome, m.especialidade_id, e.nome, a.procedimento, a.clinica_id, a.inicio
  FROM public.agendamentos a
  LEFT JOIN public.medicos m ON m.id = a.medico_id
  LEFT JOIN public.especialidades e ON e.id = m.especialidade_id
  WHERE a.paciente_id = _paciente_id
    AND public.is_member(auth.uid(), a.clinica_id)
    AND a.status <> 'cancelado'
  ORDER BY a.inicio DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_ultimo_agendamento_paciente(uuid) TO authenticated;

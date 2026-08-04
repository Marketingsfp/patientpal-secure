
-- Clínicas onde o paciente logado tem cadastro
CREATE OR REPLACE FUNCTION public.minhas_clinicas_paciente()
RETURNS TABLE(clinica_id uuid, clinica_nome text, paciente_id uuid, paciente_nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT c.id, c.nome, p.id, p.nome
  FROM public.pacientes p
  JOIN public.clinicas c ON c.id = p.clinica_id
  WHERE p.email IS NOT NULL
    AND lower(p.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  ORDER BY c.nome;
$$;

REVOKE ALL ON FUNCTION public.minhas_clinicas_paciente() FROM public;
GRANT EXECUTE ON FUNCTION public.minhas_clinicas_paciente() TO authenticated;

-- Especialidades da clínica (apenas para pacientes cadastrados nela)
CREATE OR REPLACE FUNCTION public.especialidades_paciente(_clinica_id uuid)
RETURNS TABLE(id uuid, nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT DISTINCT e.id, e.nome
  FROM public.especialidades e
  WHERE EXISTS (
      SELECT 1 FROM public.medicos m
      WHERE m.clinica_id = _clinica_id AND m.ativo AND m.especialidade_id = e.id
    )
    AND EXISTS (
      SELECT 1 FROM public.pacientes p
      WHERE p.clinica_id = _clinica_id AND p.email IS NOT NULL
        AND lower(p.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
    )
  ORDER BY e.nome;
$$;

REVOKE ALL ON FUNCTION public.especialidades_paciente(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.especialidades_paciente(uuid) TO authenticated;

-- Horários livres para o paciente (permite datas futuras: até 60 dias)
CREATE OR REPLACE FUNCTION public.horarios_disponiveis_paciente(
  _clinica_id uuid,
  _especialidade_id uuid DEFAULT NULL,
  _medico_id uuid DEFAULT NULL,
  _de date DEFAULT NULL,
  _dias integer DEFAULT 30,
  _limite integer DEFAULT 200
)
RETURNS TABLE(
  medico_id uuid, medico_nome text, especialidade_id uuid, especialidade_nome text,
  agenda_id uuid, agenda_nome text, inicio timestamptz, fim timestamptz,
  ocupados integer, capacidade integer
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_dias int := least(greatest(coalesce(_dias, 30), 1), 60);
  v_lim  int := least(greatest(coalesce(_limite, 200), 1), 500);
  v_de   date := greatest(coalesce(_de, current_date), current_date);
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.pacientes p
    WHERE p.clinica_id = _clinica_id AND p.email IS NOT NULL
      AND lower(p.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH dias AS (
    SELECT (v_de + i) AS d FROM generate_series(0, v_dias - 1) g(i)
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
    SELECT s.s_medico_id, s.s_inicio, s.s_fim, COUNT(a.id)::int AS ocupados
    FROM slots_ativos s
    LEFT JOIN public.agendamentos a
      ON a.clinica_id = _clinica_id
     AND a.medico_id  = s.s_medico_id
     AND a.status <> 'cancelado'
     AND a.inicio < s.s_fim
     AND a.fim    > s.s_inicio
    GROUP BY s.s_medico_id, s.s_inicio, s.s_fim
  )
  SELECT s.s_medico_id, s.s_medico_nome, s.s_especialidade_id, s.s_especialidade_nome,
         s.s_agenda_id, s.s_agenda_nome, s.s_inicio, s.s_fim, c.ocupados, s.s_capacidade
  FROM slots_ativos s
  JOIN contagem c ON c.s_medico_id = s.s_medico_id AND c.s_inicio = s.s_inicio
  WHERE c.ocupados < s.s_capacidade
  ORDER BY s.s_inicio, s.s_medico_nome
  LIMIT v_lim;
END;
$$;

REVOKE ALL ON FUNCTION public.horarios_disponiveis_paciente(uuid, uuid, uuid, date, integer, integer) FROM public;
GRANT EXECUTE ON FUNCTION public.horarios_disponiveis_paciente(uuid, uuid, uuid, date, integer, integer) TO authenticated;

-- Criação do agendamento pelo próprio paciente
CREATE OR REPLACE FUNCTION public.agendar_online(
  _clinica_id uuid,
  _medico_id uuid,
  _inicio timestamptz,
  _fim timestamptz,
  _agenda_id uuid DEFAULT NULL,
  _especialidade_id uuid DEFAULT NULL,
  _procedimento text DEFAULT NULL,
  _observacoes text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_pac  public.pacientes%ROWTYPE;
  v_cap  int;
  v_ocup int;
  v_id   uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Faça login para agendar';
  END IF;

  SELECT * INTO v_pac FROM public.pacientes p
  WHERE p.clinica_id = _clinica_id AND p.email IS NOT NULL
    AND lower(p.email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  LIMIT 1;

  IF v_pac.id IS NULL THEN
    RAISE EXCEPTION 'Cadastro de paciente não encontrado nesta clínica';
  END IF;

  IF _inicio <= now() THEN
    RAISE EXCEPTION 'Escolha um horário futuro';
  END IF;

  IF _inicio > now() + interval '60 days' THEN
    RAISE EXCEPTION 'Só é possível agendar com até 60 dias de antecedência';
  END IF;

  SELECT COALESCE(MAX(COALESCE(md.limite_pacientes, 1)), 1) INTO v_cap
  FROM public.medico_disponibilidades md
  WHERE md.clinica_id = _clinica_id AND md.medico_id = _medico_id AND md.ativo;

  SELECT COUNT(*) INTO v_ocup
  FROM public.agendamentos a
  WHERE a.clinica_id = _clinica_id AND a.medico_id = _medico_id
    AND a.status <> 'cancelado'
    AND a.inicio < _fim AND a.fim > _inicio;

  IF v_ocup >= v_cap THEN
    RAISE EXCEPTION 'Este horário acabou de ser preenchido. Escolha outro.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.paciente_id = v_pac.id AND a.status <> 'cancelado'
      AND a.inicio < _fim AND a.fim > _inicio
  ) THEN
    RAISE EXCEPTION 'Você já possui um agendamento neste horário';
  END IF;

  INSERT INTO public.agendamentos (
    clinica_id, paciente_id, paciente_nome, medico_id, agenda_id, especialidade_id,
    inicio, fim, procedimento, observacoes, status
  ) VALUES (
    _clinica_id, v_pac.id, v_pac.nome, _medico_id, _agenda_id, _especialidade_id,
    _inicio, _fim, _procedimento, _observacoes, 'agendado'
  ) RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.agendar_online(uuid, uuid, timestamptz, timestamptz, uuid, uuid, text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.agendar_online(uuid, uuid, timestamptz, timestamptz, uuid, uuid, text, text) TO authenticated;

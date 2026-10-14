-- Corrige a 0017: mesma regra, escrita de forma que a busca de 30 dias não estoure o tempo
-- (agenda desligada lida em array; antecedência no piso de início; faixa/limite partindo de site_agendamento_faixa).
CREATE OR REPLACE FUNCTION public.horarios_disponiveis_publico(
  _clinica_id uuid, _especialidade_id uuid DEFAULT NULL::uuid, _medico_id uuid DEFAULT NULL::uuid,
  _de date DEFAULT NULL::date, _dias integer DEFAULT 30, _limite integer DEFAULT 200)
RETURNS TABLE(medico_id uuid, medico_nome text, especialidade_id uuid, especialidade_nome text, agenda_id uuid, agenda_nome text, inicio timestamp with time zone, fim timestamp with time zone, ocupados integer, capacidade integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_dias int := least(greatest(coalesce(_dias, 30), 1), 60);
  v_lim  int := least(greatest(coalesce(_limite, 200), 1), 500);
  v_de   date := greatest(coalesce(_de, current_date), current_date);
  v_agendas_off uuid[] := ARRAY(SELECT sa.agenda_id FROM public.site_agendamento_agenda sa
                                 WHERE sa.clinica_id = _clinica_id AND NOT sa.ativo);
  v_fim  timestamptz := ((v_de + v_dias)::timestamp AT TIME ZONE 'America/Sao_Paulo');
  v_horas int := coalesce((SELECT c.horas_minimas FROM public.site_agendamento_config c WHERE c.clinica_id = _clinica_id), 0);
  -- (5) Antecedência mínima (0 = sem regra) entra no piso de início.
  v_ini  timestamptz := greatest(now() + (v_horas || ' hours')::interval, (v_de::timestamp AT TIME ZONE 'America/Sao_Paulo'));
BEGIN
  RETURN QUERY
  SELECT a.medico_id, m.nome, COALESCE(m.especialidade_id, _especialidade_id), e.nome,
         a.agenda_id, ag.nome, a.inicio, a.fim, 0::int, 1::int
  FROM public.agendamentos a
  JOIN public.medicos m ON m.id = a.medico_id AND m.ativo AND m.visivel_agendamento_online
  LEFT JOIN public.especialidades e ON e.id = m.especialidade_id
  LEFT JOIN public.medico_agendas ag ON ag.id = a.agenda_id
  WHERE a.clinica_id = _clinica_id
    AND a.inicio >= v_ini AND a.inicio < v_fim
    AND a.status <> 'cancelado'
    AND lower(btrim(a.paciente_nome)) IN ('disponivel', 'disponível')
    AND a.fim > a.inicio
    AND (_medico_id IS NULL OR a.medico_id = _medico_id)
    AND (_especialidade_id IS NULL OR m.especialidade_id = _especialidade_id
      OR EXISTS (SELECT 1 FROM public.medico_especialidades me WHERE me.medico_id = m.id AND me.especialidade_id = _especialidade_id))
    -- (1) Especialidade: teto da unidade + interruptor do site. Sem linha = liberada.
    AND (_especialidade_id IS NULL OR (
          NOT EXISTS (SELECT 1 FROM public.especialidade_unidade eu
                      WHERE eu.clinica_id = _clinica_id AND eu.especialidade_id = _especialidade_id AND NOT eu.ativo)
      AND NOT EXISTS (SELECT 1 FROM public.site_agendamento_especialidade se
                      WHERE se.clinica_id = _clinica_id AND se.especialidade_id = _especialidade_id AND NOT se.ativo)))
    AND (
      (m.especialidade_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.medico_especialidades me0 WHERE me0.medico_id = m.id))
      OR EXISTS (
        SELECT 1 FROM (
          SELECT m.especialidade_id AS eid
          UNION
          SELECT me1.especialidade_id FROM public.medico_especialidades me1 WHERE me1.medico_id = m.id
        ) s
        WHERE s.eid IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM public.especialidade_unidade eu
                          WHERE eu.clinica_id = _clinica_id AND eu.especialidade_id = s.eid AND NOT eu.ativo)
          AND NOT EXISTS (SELECT 1 FROM public.site_agendamento_especialidade se
                          WHERE se.clinica_id = _clinica_id AND se.especialidade_id = s.eid AND NOT se.ativo)))
    -- (2) Agenda desativada não oferece fichas; ficha sem agenda continua.
    AND (a.agenda_id IS NULL OR COALESCE(ag.ativo, true))
    AND NOT EXISTS (
      SELECT 1 FROM public.agendamentos o
      WHERE o.medico_id = a.medico_id AND o.clinica_id = a.clinica_id AND o.id <> a.id
        AND o.status <> 'cancelado'
        AND lower(btrim(coalesce(o.paciente_nome, ''))) NOT IN ('disponivel', 'disponível', 'bloqueio')
        AND o.inicio < a.fim AND o.inicio >= a.inicio - interval '1 day' AND o.fim > a.inicio)
    -- (3) Bloqueio sobreposto esconde a ficha.
    AND NOT EXISTS (
      SELECT 1 FROM public.agendamentos b
      WHERE b.medico_id = a.medico_id AND b.clinica_id = _clinica_id AND b.id <> a.id
        AND b.status <> 'cancelado'
        AND lower(btrim(coalesce(b.paciente_nome, ''))) = 'bloqueio'
        AND b.inicio < a.fim AND b.fim > a.inicio)
    -- (4) Agenda desligada para o site. Sem linha = aparece.
    AND (a.agenda_id IS NULL OR NOT (a.agenda_id = ANY (v_agendas_off)))
    -- (6) Faixa desligada: a ficha casa com a faixa (mesmo médico e agenda, dia_semana
    --     0=domingo e hora local de São Paulo dentro de [hora_inicio, hora_fim), vigência).
    --     Ficha que não casa com nenhuma faixa continua. A busca parte das linhas de
    --     site_agendamento_faixa (sem linha = nada a checar, custo zero).
    AND NOT EXISTS (
      SELECT 1 FROM public.site_agendamento_faixa sf
      JOIN public.medico_disponibilidades d ON d.id = sf.disponibilidade_id
      WHERE sf.clinica_id = _clinica_id AND NOT sf.ativo
          AND d.clinica_id = a.clinica_id AND d.medico_id = a.medico_id
          AND d.agenda_id = a.agenda_id AND d.ativo
          AND d.dia_semana = extract(dow FROM (a.inicio AT TIME ZONE 'America/Sao_Paulo'))::int
          AND (a.inicio AT TIME ZONE 'America/Sao_Paulo')::time >= d.hora_inicio
          AND (a.inicio AT TIME ZONE 'America/Sao_Paulo')::time < d.hora_fim
          AND (d.vigencia_inicio IS NULL OR (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date >= d.vigencia_inicio)
          AND (d.vigencia_fim IS NULL OR (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date <= d.vigencia_fim))
    -- (7) Reserva de vagas do site: faixa casada com limite_site e já atingido
    --     (agendamentos do site do mesmo médico, agenda e data local).
    AND NOT EXISTS (
      SELECT 1 FROM public.site_agendamento_faixa sf
      JOIN public.medico_disponibilidades d ON d.id = sf.disponibilidade_id
      WHERE sf.clinica_id = _clinica_id AND sf.ativo AND sf.limite_site IS NOT NULL
          AND d.clinica_id = a.clinica_id AND d.medico_id = a.medico_id
          AND d.agenda_id = a.agenda_id AND d.ativo
          AND d.dia_semana = extract(dow FROM (a.inicio AT TIME ZONE 'America/Sao_Paulo'))::int
          AND (a.inicio AT TIME ZONE 'America/Sao_Paulo')::time >= d.hora_inicio
          AND (a.inicio AT TIME ZONE 'America/Sao_Paulo')::time < d.hora_fim
          AND (d.vigencia_inicio IS NULL OR (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date >= d.vigencia_inicio)
          AND (d.vigencia_fim IS NULL OR (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date <= d.vigencia_fim)
          AND sf.limite_site <= (
            SELECT count(*) FROM public.agendamentos q
            WHERE q.clinica_id = _clinica_id AND q.medico_id = a.medico_id AND q.agenda_id = a.agenda_id
              AND public.site_agendamento_e_do_site(q.origem_integracao)
              AND q.status <> 'cancelado'
              AND lower(btrim(coalesce(q.paciente_nome, ''))) NOT IN ('disponivel', 'disponível', 'bloqueio')
              AND q.inicio >= ((a.inicio AT TIME ZONE 'America/Sao_Paulo')::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
              AND q.inicio < (((a.inicio AT TIME ZONE 'America/Sao_Paulo')::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')))
  ORDER BY a.inicio, m.nome
  LIMIT v_lim;
END;
$function$;
REVOKE ALL ON FUNCTION public.horarios_disponiveis_publico(uuid,uuid,uuid,date,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.horarios_disponiveis_publico(uuid,uuid,uuid,date,integer,integer) TO authenticated, service_role;
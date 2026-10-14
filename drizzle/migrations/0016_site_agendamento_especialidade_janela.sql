CREATE TABLE public.site_agendamento_especialidade (
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  especialidade_id uuid NOT NULL REFERENCES public.especialidades(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid,
  PRIMARY KEY (clinica_id, especialidade_id)
);
GRANT SELECT ON public.site_agendamento_especialidade TO authenticated;
GRANT ALL ON public.site_agendamento_especialidade TO service_role;
ALTER TABLE public.site_agendamento_especialidade ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_agendamento_especialidade_select ON public.site_agendamento_especialidade
  FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()));
COMMENT ON TABLE public.site_agendamento_especialidade IS 'Interruptor por especialidade do agendamento pelo site, por clínica. Ausência de linha = ligada. Não altera especialidade_unidade (teto da unidade). Escrita só pelo servidor.';

ALTER TABLE public.site_agendamento_config
  ADD COLUMN dias_antecedencia integer NOT NULL DEFAULT 7
  CHECK (dias_antecedencia BETWEEN 1 AND 60);

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
  v_ini  timestamptz := greatest(now(), (v_de::timestamp AT TIME ZONE 'America/Sao_Paulo'));
  v_fim  timestamptz := ((v_de + v_dias)::timestamp AT TIME ZONE 'America/Sao_Paulo');
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
  ORDER BY a.inicio, m.nome
  LIMIT v_lim;
END;
$function$;
REVOKE ALL ON FUNCTION public.horarios_disponiveis_publico(uuid,uuid,uuid,date,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.horarios_disponiveis_publico(uuid,uuid,uuid,date,integer,integer) TO authenticated, service_role;
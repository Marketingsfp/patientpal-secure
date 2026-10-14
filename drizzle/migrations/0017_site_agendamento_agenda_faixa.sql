CREATE TABLE public.site_agendamento_agenda (
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  agenda_id uuid NOT NULL REFERENCES public.medico_agendas(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid,
  PRIMARY KEY (clinica_id, agenda_id)
);
GRANT SELECT ON public.site_agendamento_agenda TO authenticated;
GRANT ALL ON public.site_agendamento_agenda TO service_role;
ALTER TABLE public.site_agendamento_agenda ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_agendamento_agenda_select ON public.site_agendamento_agenda
  FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()));
COMMENT ON TABLE public.site_agendamento_agenda IS 'Interruptor por agenda do agendamento pelo site. Ausência de linha = ligada. Não altera medico_agendas.ativo (recepção). Escrita só pelo servidor.';

CREATE TABLE public.site_agendamento_faixa (
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  disponibilidade_id uuid NOT NULL REFERENCES public.medico_disponibilidades(id) ON DELETE CASCADE,
  ativo boolean NOT NULL DEFAULT true,
  limite_site integer CHECK (limite_site IS NULL OR limite_site >= 0),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid,
  PRIMARY KEY (clinica_id, disponibilidade_id)
);
GRANT SELECT ON public.site_agendamento_faixa TO authenticated;
GRANT ALL ON public.site_agendamento_faixa TO service_role;
ALTER TABLE public.site_agendamento_faixa ENABLE ROW LEVEL SECURITY;
CREATE POLICY site_agendamento_faixa_select ON public.site_agendamento_faixa
  FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()));
COMMENT ON TABLE public.site_agendamento_faixa IS 'Interruptor e limite de vagas do site por faixa (medico_disponibilidades). Ausência de linha = ligada, sem limite. limite_site NULL = sem limite; 0 = site não ocupa nenhuma. Escrita só pelo servidor.';

ALTER TABLE public.site_agendamento_config
  ADD COLUMN horas_minimas integer NOT NULL DEFAULT 0
  CHECK (horas_minimas BETWEEN 0 AND 720);

-- Origem do agendamento conta como "site" para a reserva de vagas.
-- 'site_publico' e 'site-%' são site. NÃO são site: 'nina_%', 'policardmed', 'homologacao'.
CREATE OR REPLACE FUNCTION public.site_agendamento_e_do_site(origem text)
RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $$ SELECT coalesce(origem = 'site_publico' OR origem LIKE 'site-%', false) $$;
GRANT EXECUTE ON FUNCTION public.site_agendamento_e_do_site(text) TO authenticated, service_role;

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
  v_horas int := coalesce((SELECT c.horas_minimas FROM public.site_agendamento_config c WHERE c.clinica_id = _clinica_id), 0);
  v_piso timestamptz := now() + (v_horas || ' hours')::interval;
BEGIN
  RETURN QUERY
  SELECT a.medico_id, m.nome, COALESCE(m.especialidade_id, _especialidade_id), e.nome,
         a.agenda_id, ag.nome, a.inicio, a.fim, 0::int, 1::int
  FROM public.agendamentos a
  JOIN public.medicos m ON m.id = a.medico_id AND m.ativo AND m.visivel_agendamento_online
  LEFT JOIN public.especialidades e ON e.id = m.especialidade_id
  LEFT JOIN public.medico_agendas ag ON ag.id = a.agenda_id
  -- (6) Faixa de disponibilidade casada com a ficha (dia_semana 0=domingo, hora local SP).
  LEFT JOIN LATERAL (
    SELECT d.id AS disp_id, sf.ativo AS faixa_ativo, sf.limite_site
    FROM public.medico_disponibilidades d
    LEFT JOIN public.site_agendamento_faixa sf ON sf.clinica_id = _clinica_id AND sf.disponibilidade_id = d.id
    WHERE d.clinica_id = a.clinica_id AND d.medico_id = a.medico_id
      AND d.agenda_id = a.agenda_id AND d.ativo
      AND d.dia_semana = extract(dow FROM (a.inicio AT TIME ZONE 'America/Sao_Paulo'))::int
      AND (a.inicio AT TIME ZONE 'America/Sao_Paulo')::time >= d.hora_inicio
      AND (a.inicio AT TIME ZONE 'America/Sao_Paulo')::time < d.hora_fim
      AND (d.vigencia_inicio IS NULL OR (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date >= d.vigencia_inicio)
      AND (d.vigencia_fim IS NULL OR (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date <= d.vigencia_fim)
    ORDER BY d.hora_inicio, d.id
    LIMIT 1
  ) fx ON true
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
    AND (a.agenda_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM public.site_agendamento_agenda sa
      WHERE sa.clinica_id = _clinica_id AND sa.agenda_id = a.agenda_id AND NOT sa.ativo))
    -- (5) Antecedência mínima (0 = sem regra).
    AND a.inicio >= v_piso
    -- (6) Faixa desligada. Ficha sem faixa casada continua.
    AND COALESCE(fx.faixa_ativo, true)
    -- (7) Reserva de vagas do site na faixa casada (mesmo médico, agenda e data local).
    AND (fx.limite_site IS NULL OR fx.limite_site > (
      SELECT count(*) FROM public.agendamentos q
      WHERE q.clinica_id = _clinica_id AND q.medico_id = a.medico_id AND q.agenda_id = a.agenda_id
        AND public.site_agendamento_e_do_site(q.origem_integracao)
        AND q.status <> 'cancelado'
        AND lower(btrim(coalesce(q.paciente_nome, ''))) NOT IN ('disponivel', 'disponível', 'bloqueio')
        AND (q.inicio AT TIME ZONE 'America/Sao_Paulo')::date = (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date))
  ORDER BY a.inicio, m.nome
  LIMIT v_lim;
END;
$function$;
REVOKE ALL ON FUNCTION public.horarios_disponiveis_publico(uuid,uuid,uuid,date,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.horarios_disponiveis_publico(uuid,uuid,uuid,date,integer,integer) TO authenticated, service_role;
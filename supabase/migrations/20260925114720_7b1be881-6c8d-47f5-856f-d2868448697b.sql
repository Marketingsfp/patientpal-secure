-- API v1.3 (fatia 4, ajuste de desempenho): a checagem de sobreposição lia
-- todo o histórico do médico (4,4 s na Menino Jesus). Limita a busca a
-- atendimentos que começaram até 1 dia antes da ficha — nenhum atendimento
-- dura mais que isso — e usa o índice (medico_id, inicio). Mesma regra.
CREATE OR REPLACE FUNCTION public.horarios_disponiveis_publico(
  _clinica_id uuid,
  _especialidade_id uuid DEFAULT NULL::uuid,
  _medico_id uuid DEFAULT NULL::uuid,
  _de date DEFAULT NULL::date,
  _dias integer DEFAULT 30,
  _limite integer DEFAULT 200
)
RETURNS TABLE(medico_id uuid, medico_nome text, especialidade_id uuid, especialidade_nome text, agenda_id uuid, agenda_nome text, inicio timestamp with time zone, fim timestamp with time zone, ocupados integer, capacidade integer)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
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
  JOIN public.medicos m ON m.id = a.medico_id AND m.ativo
  LEFT JOIN public.especialidades e ON e.id = m.especialidade_id
  LEFT JOIN public.medico_agendas ag ON ag.id = a.agenda_id
  WHERE a.clinica_id = _clinica_id
    AND a.inicio >= v_ini
    AND a.inicio <  v_fim
    AND a.status <> 'cancelado'
    AND lower(btrim(a.paciente_nome)) IN ('disponivel', 'disponível')
    AND a.fim > a.inicio
    AND (_medico_id IS NULL OR a.medico_id = _medico_id)
    AND (
      _especialidade_id IS NULL
      OR m.especialidade_id = _especialidade_id
      OR EXISTS (SELECT 1 FROM public.medico_especialidades me
                 WHERE me.medico_id = m.id AND me.especialidade_id = _especialidade_id)
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.agendamentos o
      WHERE o.medico_id = a.medico_id
        AND o.clinica_id = a.clinica_id
        AND o.id <> a.id
        AND o.status <> 'cancelado'
        AND lower(btrim(coalesce(o.paciente_nome, ''))) NOT IN ('disponivel', 'disponível', 'bloqueio')
        AND o.inicio < a.fim
        AND o.inicio >= a.inicio - interval '1 day'
        AND o.fim > a.inicio
    )
  ORDER BY a.inicio, m.nome
  LIMIT v_lim;
END;
$function$;
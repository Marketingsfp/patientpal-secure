CREATE OR REPLACE FUNCTION public.fin_agenda_resumo_dia(p_clinica uuid, p_ini date, p_fim date)
RETURNS TABLE(
  dia date,
  agenda_id uuid,
  agenda_nome text,
  ordem_chegada boolean,
  medico_id uuid,
  medico_nome text,
  especialidade text,
  vagas bigint,
  marcados bigint,
  compareceu bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $function$
BEGIN
  IF NOT public.is_member(auth.uid(), p_clinica) THEN
    RETURN;
  END IF;
  RETURN QUERY
    WITH base AS (
      SELECT
        (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
        a.agenda_id,
        a.medico_id,
        a.paciente_id IS NOT NULL AND a.status::text <> 'cancelado' AS marcado,
        a.status::text <> 'cancelado' AS vaga,
        a.paciente_id IS NOT NULL AND a.status::text <> 'cancelado' AND (
          a.status::text IN ('realizado', 'confirmado')
          OR COALESCE(a.fluxo_etapa::text, 'aguardando_recepcao') <> 'aguardando_recepcao'
          OR EXISTS (
            SELECT 1 FROM public.fin_lancamentos l
            WHERE l.agendamento_id = a.id AND l.tipo = 'receita' AND l.status = 'confirmado'
          )
        ) AS veio
      FROM public.agendamentos a
      WHERE a.clinica_id = p_clinica
        AND a.inicio >= (p_ini::timestamp AT TIME ZONE 'America/Sao_Paulo')
        AND a.inicio < ((p_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
        AND COALESCE(a.is_mock_data, false) = false
    )
    SELECT
      b.dia,
      b.agenda_id,
      ag.nome::text,
      COALESCE(ag.ordem_chegada, false),
      b.medico_id,
      m.nome::text,
      e.nome::text,
      COUNT(*) FILTER (WHERE b.vaga)::bigint,
      COUNT(*) FILTER (WHERE b.marcado)::bigint,
      COUNT(*) FILTER (WHERE b.veio)::bigint
    FROM base b
    LEFT JOIN public.medico_agendas ag ON ag.id = b.agenda_id
    LEFT JOIN public.medicos m ON m.id = b.medico_id
    LEFT JOIN public.especialidades e ON e.id = m.especialidade_id
    GROUP BY b.dia, b.agenda_id, ag.nome, ag.ordem_chegada, b.medico_id, m.nome, e.nome
    ORDER BY b.dia, b.agenda_id NULLS FIRST, b.medico_id NULLS FIRST;
END;
$function$;

REVOKE ALL ON FUNCTION public.fin_agenda_resumo_dia(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fin_agenda_resumo_dia(uuid, date, date) TO authenticated;
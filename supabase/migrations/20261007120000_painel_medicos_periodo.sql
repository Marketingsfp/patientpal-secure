-- ---------------------------------------------------------------------------
-- Dashboard operacional — "Médicos" por período
--
-- A seção de médicos do Dashboard ganhou seletor de período (hoje, ontem,
-- este mês, mês passado ou datas livres). Um mês passa de 35 mil linhas em
-- `agendamentos`; trazer isso ao navegador a cada atualização automática
-- deixaria a tela lenta. Esta função devolve a conta pronta por médico.
--
-- Mesmos critérios do cálculo de "hoje" feito na tela (app.painel.tsx):
--   * fora: cancelados e vagas livres da grade ("DISPONIVEL" / nome vazio sem
--     paciente vinculado — ver src/lib/agenda/vaga-livre.ts);
--   * atendidos = status 'realizado' ou fluxo_etapa 'finalizado';
--   * faltas    = status 'faltou';
--   * pagos     = data_pagamento preenchida;
--   * novos     = paciente cadastrado dentro do período.
-- Datas no fuso da clínica (America/Sao_Paulo), pelo `inicio` do agendamento.
-- Só lê. Só devolve clínicas das quais o usuário é membro.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.painel_medicos_periodo(
  p_clinicas uuid[],
  p_de date,
  p_ate date
)
RETURNS TABLE(
  medico_id uuid,
  total bigint,
  atendidos bigint,
  faltas bigint,
  pagos bigint,
  novos bigint
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '30s'
AS $function$
DECLARE
  v_ini timestamptz := (p_de::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  v_fim timestamptz := ((p_ate + 1)::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  v_clinicas uuid[];
BEGIN
  SELECT array_agg(c) INTO v_clinicas
  FROM unnest(p_clinicas) AS c
  WHERE public.is_member(auth.uid(), c);

  IF v_clinicas IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    a.medico_id,
    count(*)::bigint,
    count(*) FILTER (WHERE a.status = 'realizado' OR a.fluxo_etapa = 'finalizado')::bigint,
    count(*) FILTER (WHERE a.status = 'faltou')::bigint,
    count(*) FILTER (WHERE a.data_pagamento IS NOT NULL)::bigint,
    count(*) FILTER (
      WHERE p.created_at >= v_ini AND p.created_at < v_fim
    )::bigint
  FROM public.agendamentos a
  LEFT JOIN public.pacientes p ON p.id = a.paciente_id
  WHERE a.clinica_id = ANY (v_clinicas)
    AND a.inicio >= v_ini
    AND a.inicio < v_fim
    AND a.medico_id IS NOT NULL
    AND a.status <> 'cancelado'
    AND (
      a.paciente_id IS NOT NULL
      OR upper(btrim(coalesce(a.paciente_nome, ''))) NOT IN ('', 'DISPONIVEL', 'DISPONÍVEL')
    )
  GROUP BY a.medico_id;
END;
$function$;

-- Mesma permissão das demais RPCs do painel: só usuário logado (e o backend).
REVOKE ALL ON FUNCTION public.painel_medicos_periodo(uuid[], date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.painel_medicos_periodo(uuid[], date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.painel_medicos_periodo(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.painel_medicos_periodo(uuid[], date, date) TO service_role;

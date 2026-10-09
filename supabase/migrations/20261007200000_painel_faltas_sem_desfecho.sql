-- ---------------------------------------------------------------------------
-- Dashboard operacional — "Faltas" por médico contam os agendamentos sem desfecho
--
-- Os cards dos médicos mostravam "Faltas 0" para quase todos: a recepção quase
-- nunca marca "faltou" e o sistema não encerra o dia sozinho. Em setembro/2026
-- eram 61 faltas marcadas contra ~1.820 agendamentos de dias passados em que o
-- paciente nunca passou pelo balcão.
--
-- Decisão do dono (07/10/2026): no PAINEL, falta passa a ser
--   * status 'faltou'; OU
--   * dia já encerrado (antes de hoje, fuso da clínica), status 'agendado' ou
--     'confirmado', sem check-in (fluxo_etapa 'aguardando_recepcao' ou nulo),
--     e que não seja BLOQUEIO da grade.
-- Pagamento não interfere. Nada é gravado no banco: caixa, repasse e
-- relatórios continuam como estão.
--
-- Mesma regra em src/lib/painel/sem-desfecho.ts (aviso e lista do Dashboard).
-- O resto da conta é o da migração 20261007120000_painel_medicos_periodo.sql.
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
  -- 00:00 de hoje na clínica: o que começa daqui em diante ainda pode chegar.
  v_hoje timestamptz :=
    ((now() AT TIME ZONE 'America/Sao_Paulo')::date::timestamp) AT TIME ZONE 'America/Sao_Paulo';
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
    count(*) FILTER (
      WHERE a.status = 'faltou'
         OR (
           a.inicio < v_hoje
           AND a.status IN ('agendado', 'confirmado')
           AND coalesce(a.fluxo_etapa::text, 'aguardando_recepcao') = 'aguardando_recepcao'
           AND NOT (
             a.paciente_id IS NULL
             AND upper(translate(btrim(coalesce(a.paciente_nome, '')), 'éÉ', 'eE')) = 'BLOQUEIO'
           )
         )
    )::bigint,
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

-- CREATE OR REPLACE mantém as permissões; repetidas aqui para a migração valer sozinha.
REVOKE ALL ON FUNCTION public.painel_medicos_periodo(uuid[], date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.painel_medicos_periodo(uuid[], date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.painel_medicos_periodo(uuid[], date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.painel_medicos_periodo(uuid[], date, date) TO service_role;

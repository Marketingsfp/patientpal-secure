-- ---------------------------------------------------------------------------
-- Dashboard operacional — o dia de HOJE passa a contar falta depois das 19h
--
-- A migração 20261007200000_painel_faltas_sem_desfecho.sql só contava como
-- falta os agendamentos sem desfecho de dias anteriores, esperando a
-- meia-noite. O dono lembrou que a clínica fecha às 19h (07/10/2026) e não
-- houve check-in depois das 19h nos últimos 30 dias: a partir das 19h (fuso
-- da clínica) o dia de hoje também está encerrado. Vale para todas as
-- unidades — não há horário de funcionamento cadastrado por clínica.
--
-- Única mudança: o corte `v_hoje` vira `v_corte` (00:00 de amanhã depois das
-- 19h; 00:00 de hoje antes disso). Mesma regra em src/lib/painel/sem-desfecho.ts.
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
  -- Até onde o dia já acabou: a clínica fecha às 19h. Antes disso, o que
  -- começa de 00:00 de hoje em diante ainda pode chegar.
  v_agora timestamp := now() AT TIME ZONE 'America/Sao_Paulo';
  v_corte timestamptz := (
    v_agora::date + CASE WHEN v_agora::time >= time '19:00' THEN 1 ELSE 0 END
  )::timestamp AT TIME ZONE 'America/Sao_Paulo';
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
           a.inicio < v_corte
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

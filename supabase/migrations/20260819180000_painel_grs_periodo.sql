-- Painel Executivo — card "GRs / Guias" (antes era o card "Clientes").
--
-- ============================== O QUE ELE RESPONDE ==========================
-- Numero grande : quantas GRs (guias) foram emitidas no periodo selecionado.
-- Sub-indicador : quantos pacientes DISTINTOS geraram essas guias, separados
--                 entre novos e recorrentes.
--
-- ================================ AS REGRAS ================================
-- 1. Uma GR = uma 1a via. A 2a via (via_numero = 2) e a reimpressao sao a
--    MESMA guia, entao nao contam de novo. Reimpressao, alias, nem grava
--    linha nova em gr_impressoes (ver src/lib/print-gr.ts).
-- 2. Entram as guias de atendimento (agendamento_id) e as de mensalidade do
--    Cartao Consulta (mensalidade_id) — a mesma convencao ja usada pela
--    numeracao diaria da GR de mensalidade ("a contagem de GRs do dia soma
--    atendimentos + mensalidades", em src/lib/print-gr.ts).
-- 3. A data considerada e a da EMISSAO da guia (created_at), nao a data do
--    agendamento: o card responde "quantas guias sairam no periodo".
-- 4. Paciente da guia: pelo agendamento, ou pelo titular do contrato quando a
--    guia e de mensalidade.
-- 5. "Novo" = paciente sem nenhum agendamento nesta clinica ANTES do inicio do
--    periodo. E o mesmo criterio de "novos" que o painel ja usava.
--
-- ============================== POR QUE NO BANCO ============================
-- A tela contava tudo no navegador, e o PostgREST devolve no maximo 1.000
-- linhas por consulta. Nos ultimos 30 dias a clinica tem 24.178 agendamentos,
-- ou seja: qualquer contagem feita no navegador sai truncada. Aqui a conta
-- inteira roda no servidor e volta pronta — medido com EXPLAIN ANALYZE na base
-- de producao: 12 ms para 30 dias (844 guias, 616 pacientes).
CREATE OR REPLACE FUNCTION public.painel_grs_periodo(
  p_clinica uuid,
  p_ini timestamptz,
  p_fim timestamptz
)
RETURNS TABLE(grs bigint, pacientes bigint, novos bigint, recorrentes bigint)
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
  WITH g AS (
    SELECT gi.agendamento_id, gi.mensalidade_id
    FROM public.gr_impressoes gi
    WHERE gi.clinica_id = p_clinica
      AND gi.via_numero = 1
      AND gi.created_at >= p_ini
      AND gi.created_at <= p_fim
  ),
  pac AS (
    SELECT DISTINCT x.paciente_id
    FROM (
      SELECT a.paciente_id
      FROM g
      JOIN public.agendamentos a ON a.id = g.agendamento_id
      UNION ALL
      SELECT ca.paciente_id
      FROM g
      JOIN public.contrato_mensalidades cm ON cm.id = g.mensalidade_id
      JOIN public.contratos_assinatura ca ON ca.id = cm.contrato_id
    ) x
    WHERE x.paciente_id IS NOT NULL
  ),
  tot AS (
    SELECT
      (SELECT count(*) FROM g)::bigint   AS qtd_grs,
      (SELECT count(*) FROM pac)::bigint AS qtd_pac,
      (SELECT count(*) FROM pac
        WHERE NOT EXISTS (
          SELECT 1
          FROM public.agendamentos a2
          WHERE a2.clinica_id = p_clinica
            AND a2.paciente_id = pac.paciente_id
            AND a2.inicio < p_ini
        ))::bigint AS qtd_novos
  )
  SELECT tot.qtd_grs, tot.qtd_pac, tot.qtd_novos, tot.qtd_pac - tot.qtd_novos
  FROM tot;
END;
$function$;

-- Mesma permissao das demais RPCs do painel: so usuario logado (e o backend).
REVOKE ALL ON FUNCTION public.painel_grs_periodo(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.painel_grs_periodo(uuid, timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.painel_grs_periodo(uuid, timestamptz, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.painel_grs_periodo(uuid, timestamptz, timestamptz) TO service_role;

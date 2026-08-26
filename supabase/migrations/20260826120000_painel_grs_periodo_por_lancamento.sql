-- Painel Executivo — card "GRs / Guias" passa a contar LANCAMENTOS, nao impressoes.
--
-- SITUACAO EM PRODUCAO: a funcao (passo 2) foi aplicada em 26/08/2026, com
-- autorizacao do dono, e conferida logo depois. O indice (passo 1) ficou
-- pendente de propriedade, para ser criado em um horario de movimento baixo —
-- ele nao muda nenhum numero, so acelera a consulta.
--
-- ================================ O PROBLEMA ===============================
-- A versao anterior desta funcao (20260819180000_painel_grs_periodo.sql) contava
-- linhas de `gr_impressoes`, a tabela que registra a impressao da guia. Essa
-- tabela deixou de ser alimentada de forma confiavel a partir de 22/07/2026:
--
--   25/08/2026 -> 326 atendimentos faturados,  1 impressao registrada
--   20/08/2026 -> 361 atendimentos faturados,  1 impressao registrada
--   19/08/2026 -> 390 atendimentos faturados, 49 impressoes registradas
--
-- Ou seja: o card do topo do painel mostrava 9 guias numa semana em que a
-- clinica lancou mais de 1.500. Nao e um erro de calculo, e uma fonte de dados
-- que parou de ser gravada.
--
-- ================================ A CORRECAO ===============================
-- A nova conta usa o LANCAMENTO de receita (`fin_lancamentos`), que continua
-- sendo gravado normalmente e e o evento que a recepcao entende como "gerei a
-- GR". E exatamente a mesma regra da aba "GRs" do painel
-- (SecaoGrsDoDia, em src/routes/_authenticated/app.painel-executivo.tsx), para
-- que o card do topo e a lista detalhada nunca discordem entre si.
--
-- ================================= AS REGRAS ===============================
-- 1. Uma GR = um ATENDIMENTO lancado. Pagamento dividido gera varios
--    lancamentos para o mesmo agendamento e continua sendo UMA guia, por isso
--    o agrupamento por `agendamento_id`.
-- 2. Lancamento sem agendamento (mensalidade do Cartao Consulta, cobranca
--    avulsa) conta como uma GR sozinho — a mesma convencao da versao anterior,
--    que ja somava atendimentos + mensalidades.
-- 3. A data considerada e a da DIGITACAO (`created_at`), nao a competencia
--    (`data`): o card responde "quantas guias sairam no periodo".
-- 4. Lancamento cancelado continua contando como GR gerada — ela existiu e
--    depois foi estornada. A lista detalhada mostra essas com o selo
--    "Estornado".
-- 5. Paciente da guia: pelo agendamento, ou pelo proprio lancamento quando nao
--    ha agendamento.
-- 6. "Novo" = paciente sem nenhum agendamento nesta clinica ANTES do inicio do
--    periodo. Criterio inalterado em relacao a versao anterior.
--
-- ================================ DESEMPENHO ===============================
-- Medido com EXPLAIN ANALYZE na base de producao, janela de 30 dias:
-- 86 ms (2.920 GRs, 1.998 pacientes, 1.407 novos). O custo vem de varrer
-- `fin_lancamentos` (915 mil linhas, 416 MB) por `created_at`, que nao tinha
-- indice — o indice abaixo resolve isso e tambem acelera a aba "GRs".

-- ---------------------------------------------------------------------------
-- 1) Indice de apoio.
--    ATENCAO: a criacao do indice bloqueia GRAVACOES em fin_lancamentos por
--    alguns segundos. Rode em um momento de movimento baixo (horario de almoco
--    ou apos o fechamento), para nao travar o caixa da recepcao.
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_fin_lanc_clinica_created_receita
  ON public.fin_lancamentos (clinica_id, created_at)
  WHERE tipo = 'receita';

-- ---------------------------------------------------------------------------
-- 2) A funcao. Mesma assinatura e mesmas colunas de retorno da versao anterior,
--    entao a tela nao precisa mudar: assim que este SQL rodar, o card do topo
--    passa a mostrar o numero certo.
-- ---------------------------------------------------------------------------
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
  WITH l AS (
    SELECT fl.id, fl.agendamento_id, fl.paciente_id
    FROM public.fin_lancamentos fl
    WHERE fl.clinica_id = p_clinica
      AND fl.tipo = 'receita'
      AND fl.created_at >= p_ini
      AND fl.created_at <= p_fim
  ),
  gr AS (
    -- Uma chave por guia: o agendamento quando existe, senao o proprio
    -- lancamento. O prefixo evita colisao entre os dois tipos de id.
    SELECT DISTINCT COALESCE(l.agendamento_id::text, 'l:' || l.id::text) AS chave
    FROM l
  ),
  pac AS (
    SELECT DISTINCT COALESCE(a.paciente_id, l.paciente_id) AS paciente_id
    FROM l
    LEFT JOIN public.agendamentos a ON a.id = l.agendamento_id
    WHERE COALESCE(a.paciente_id, l.paciente_id) IS NOT NULL
  ),
  tot AS (
    SELECT
      (SELECT count(*) FROM gr)::bigint  AS qtd_grs,
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

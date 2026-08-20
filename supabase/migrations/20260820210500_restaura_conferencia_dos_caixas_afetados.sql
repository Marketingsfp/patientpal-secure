-- ---------------------------------------------------------------------------
-- Devolve aos caixas já fechados a diferença que a operadora registrou no dia
--
-- Complemento da migração 20260820210000: aquela impede novos casos, esta
-- limpa os que já existem. Até aqui, todo lançamento retroativo em sessão
-- fechada somava seu valor apenas ao `valor_fechamento_calculado` e recalculava
-- a diferença contra o `valor_fechamento_informado` antigo, criando uma "Falta
-- em caixa" do tamanho exato do lançamento.
--
-- Como o UPDATE antigo só rodava quando a sessão JÁ estava fechada, toda
-- observação "[Retroativo lançado em ...]" é necessariamente posterior ao
-- fechamento, e nenhuma das sessões afetadas foi reaberta depois (verificado:
-- zero movimentos do tipo `reabertura` nas 34). Por isso somar os retroativos
-- de volta ao valor informado restaura exatamente o estado do momento em que
-- a operadora fechou o caixa.
--
-- Efeito: 22 sessões voltam a diferença zero (falta que nunca existiu) e as
-- outras 12 voltam a mostrar só a divergência real, sem a parte fantasma. Os
-- valores recebidos, formas de pagamento e observações de auditoria não são
-- tocados — só os dois campos da conferência e a diferença.
--
-- A cópia do estado anterior fica em `backup.caixa_sessoes_conferencia_20260820`
-- (schema fora do `public`, portanto não exposto pela API do PostgREST).
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS backup.caixa_sessoes_conferencia_20260820 AS
SELECT id,
       user_nome,
       aberto_em,
       valor_fechamento_informado,
       valor_fechamento_calculado,
       diferenca,
       observacoes,
       updated_at
FROM public.caixa_sessoes
WHERE status = 'fechado'
  AND upper(observacoes) LIKE '%RETROATIVO LANCADO%';

WITH retro AS (
  SELECT s.id,
         (SELECT COALESCE(SUM(replace(m[1], ',', '')::numeric), 0)
            FROM regexp_matches(upper(s.observacoes),
                                'RETROATIVO LANCADO EM[^]]*\+R\$ ([0-9.,]+)', 'g') m) AS soma
  FROM public.caixa_sessoes s
  WHERE s.status = 'fechado'
    AND upper(s.observacoes) LIKE '%RETROATIVO LANCADO%'
    AND s.observacoes NOT ILIKE '%CONFERENCIA DO FECHAMENTO RESTAURADA%'
)
UPDATE public.caixa_sessoes s
SET valor_fechamento_informado = round(COALESCE(s.valor_fechamento_informado, 0) + r.soma, 2),
    diferenca = round(COALESCE(s.valor_fechamento_informado, 0) + r.soma
                      - COALESCE(s.valor_fechamento_calculado, 0), 2),
    observacoes = s.observacoes || format(
      ' | [Conferencia do fechamento restaurada em %s: R$ %s de retroativos somados ao valor conferido; a diferenca volta a ser a do fechamento]',
      to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
      to_char(r.soma, 'FM999G999G990D00')),
    updated_at = now()
FROM retro r
WHERE s.id = r.id
  AND r.soma > 0;

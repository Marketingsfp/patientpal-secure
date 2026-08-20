-- ---------------------------------------------------------------------------
-- Zera a sobra fantasma deixada pela pré-carga que ignorava a sangria
--
-- Até o commit que unificou o cálculo da grade "Conferência por forma de
-- pagamento", mexer no campo "Dia a fechar" reescrevia o campo Dinheiro com
-- todo o dinheiro RECEBIDO no dia, sem descontar o que já tinha saído da
-- gaveta na sangria. Quem fechava aceitando esse número gravava uma "Sobra em
-- caixa" exatamente do tamanho da sangria do dia.
--
-- Dois fechamentos ficaram gravados assim, e são reconhecíveis porque a
-- diferença bate ao centavo com a soma das sangrias da própria sessão:
--
--   Suellen, 27/07/2026 — sobra de R$ 5.716,00, sangria de R$ 5.716,00
--   Mayara,  24/07/2026 — sobra de R$ 3.450,00, sangria de R$ 3.450,00
--
-- Nos dois casos o valor conferido volta a ser o calculado do dia e a
-- diferença volta a zero. Os demais fechamentos com divergência NÃO são
-- tocados: neles a sobra não bate com a sangria, sinal de que houve digitação
-- manual misturada, e não há como separar o defeito da divergência real.
--
-- As sessões são endereçadas por id, e o UPDATE ainda exige que a condição
-- (diferença = sangria) continue verdadeira, para não corrigir nada que tenha
-- mudado no meio tempo. A marca em `observacoes` torna a migração idempotente.
-- ---------------------------------------------------------------------------

CREATE SCHEMA IF NOT EXISTS backup;
REVOKE ALL ON SCHEMA backup FROM anon, authenticated;

CREATE TABLE IF NOT EXISTS backup.caixa_sessoes_sobra_sangria_20260820 AS
SELECT id,
       user_nome,
       aberto_em,
       valor_fechamento_informado,
       valor_fechamento_calculado,
       diferenca,
       observacoes,
       updated_at
FROM public.caixa_sessoes
WHERE id IN ('b97c1d39-55c1-40f5-b86c-b18d1dbd6381',
             '773669c6-a22b-4029-bdff-f4b742e4b25b');

UPDATE public.caixa_sessoes s
SET valor_fechamento_informado = round(COALESCE(s.valor_fechamento_calculado, 0), 2),
    diferenca = 0,
    observacoes = s.observacoes || format(
      ' | [Sobra da sangria corrigida em %s: a pre-carga do fechamento somava o dinheiro sangrado ao conferido; valor conferido volta a ser o calculado do dia]',
      to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')),
    updated_at = now()
WHERE s.id IN ('b97c1d39-55c1-40f5-b86c-b18d1dbd6381',
               '773669c6-a22b-4029-bdff-f4b742e4b25b')
  AND s.status = 'fechado'
  AND s.observacoes NOT ILIKE '%SOBRA DA SANGRIA CORRIGIDA%'
  AND abs(COALESCE(s.diferenca, 0)
          - (SELECT COALESCE(SUM(m.valor), 0) FROM public.caixa_movimentos m
              WHERE m.sessao_id = s.id AND m.tipo = 'sangria')) < 0.005;

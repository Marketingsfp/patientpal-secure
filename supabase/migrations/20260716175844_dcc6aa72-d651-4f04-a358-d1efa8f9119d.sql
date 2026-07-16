
-- 1) Seleciona movimentos a mover e resolve a sessão fechada de destino
WITH movs AS (
  SELECT cm.id AS mov_id,
         cm.sessao_id AS sessao_origem,
         cm.valor,
         cs_origem.user_id,
         l.data AS lanc_data
  FROM caixa_movimentos cm
  JOIN caixa_sessoes cs_origem ON cs_origem.id = cm.sessao_id
  JOIN fin_lancamentos l ON l.id = cm.lancamento_id
  WHERE cm.created_at::date = CURRENT_DATE
    AND l.data < CURRENT_DATE
    AND cs_origem.aberto_em::date <> l.data
),
alvo AS (
  SELECT m.mov_id,
         m.valor,
         m.lanc_data,
         (
           SELECT cs.id FROM caixa_sessoes cs
           WHERE cs.user_id = m.user_id
             AND cs.aberto_em::date = m.lanc_data
             AND cs.status = 'fechado'
           ORDER BY cs.aberto_em LIMIT 1
         ) AS sessao_destino
  FROM movs m
),
mov_upd AS (
  UPDATE caixa_movimentos cm
     SET sessao_id  = a.sessao_destino,
         created_at = (a.lanc_data::timestamp AT TIME ZONE 'UTC') + INTERVAL '12 hours'
    FROM alvo a
   WHERE cm.id = a.mov_id
     AND a.sessao_destino IS NOT NULL
  RETURNING cm.id, a.sessao_destino AS sessao_id, cm.valor
),
por_sessao AS (
  SELECT sessao_id, COUNT(*) AS qtd, SUM(valor) AS total
  FROM mov_upd
  GROUP BY sessao_id
)
-- 2) Recalcula valor_fechamento_calculado e diferenca, mantendo o valor informado.
UPDATE caixa_sessoes cs
   SET valor_fechamento_calculado = COALESCE(cs.valor_fechamento_calculado, 0) + ps.total,
       diferenca                  = (COALESCE(cs.valor_fechamento_calculado, 0) + ps.total)
                                    - COALESCE(cs.valor_fechamento_informado, 0),
       observacoes                = COALESCE(cs.observacoes || E'\n', '')
                                    || 'Ajuste ' || to_char(now() AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY HH24:MI')
                                    || ': anexados ' || ps.qtd
                                    || ' mov(s) totalizando R$ ' || to_char(ps.total, 'FM999G990D00')
                                    || ' (lancamentos retroativos gravados por engano no caixa de hoje).'
  FROM por_sessao ps
 WHERE cs.id = ps.sessao_id;

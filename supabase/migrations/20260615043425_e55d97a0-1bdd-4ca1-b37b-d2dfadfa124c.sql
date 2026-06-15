-- Deduplica lançamentos de maio/2026 em fin_lancamentos
-- Mantém o registro mais antigo (menor created_at) para cada combinação
-- de clinica_id + data + descricao + valor + tipo e remove os repetidos.
WITH ranked AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY clinica_id, data, descricao, valor, tipo
           ORDER BY created_at, id
         ) AS rn
  FROM public.fin_lancamentos
  WHERE data >= '2026-05-01'
    AND data <= '2026-05-31'
    AND tipo = 'receita'
    AND status = 'confirmado'
)
DELETE FROM public.fin_lancamentos f
USING ranked r
WHERE f.id = r.id
  AND r.rn > 1;
-- Backfill: em orçamentos de Odontologia, PIX passa a valer o mesmo que Cartão
-- (regra: PIX é agrupado com Cartão, e não com Dinheiro).
WITH odo AS (
  SELECT id AS especialidade_id
  FROM public.especialidades
  WHERE upper(unaccent(nome)) = 'ODONTOLOGIA'
),
alvo AS (
  SELECT oi.id, oi.valores_formas
  FROM public.orcamento_itens oi
  JOIN public.orcamentos o ON o.id = oi.orcamento_id
  JOIN odo ON odo.especialidade_id = o.especialidade_id
  WHERE oi.valores_formas IS NOT NULL
)
UPDATE public.orcamento_itens t
SET valores_formas = a.valores_formas || jsonb_build_object(
  'PIX', COALESCE(
    (a.valores_formas->>'Cartão de Crédito')::numeric,
    (a.valores_formas->>'Cartão de Débito')::numeric,
    (a.valores_formas->>'Cartão')::numeric,
    (a.valores_formas->>'PIX')::numeric,
    0
  )
)
FROM alvo a
WHERE t.id = a.id;
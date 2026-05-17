WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY upper(trim(nome)), coalesce(grupo,'')
    ORDER BY (valor_padrao IS NULL), valor_padrao DESC NULLS LAST, created_at DESC
  ) AS rn
  FROM public.procedimentos
  WHERE clinica_id = 'a2e1ffd6-084e-4954-84a0-8fe7788274ae'
)
DELETE FROM public.procedimentos WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
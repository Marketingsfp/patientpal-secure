DELETE FROM public.procedimentos
WHERE clinica_id = 'a2e1ffd6-084e-4954-84a0-8fe7788274ae'
  AND (valor_dinheiro IS NULL OR valor_dinheiro = 0);
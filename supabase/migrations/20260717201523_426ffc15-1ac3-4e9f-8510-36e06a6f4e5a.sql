UPDATE public.contratos_assinatura
SET numero_renovacoes = GREATEST(COALESCE(numero_renovacoes,0), 1),
    observacoes = COALESCE(observacoes,'') || E'\n[Renovação registrada manualmente em ' || to_char(now(),'DD/MM/YYYY') || ' — isenta de carência]'
WHERE id = '4ff7ea75-11b1-41d9-b565-0eb75279f393';
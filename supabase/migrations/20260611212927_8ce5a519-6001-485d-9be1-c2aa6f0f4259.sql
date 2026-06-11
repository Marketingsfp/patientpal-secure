UPDATE public.fin_lancamentos fl
SET paciente_id = c.paciente_id
FROM public.contratos_assinatura c
WHERE fl.clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
  AND fl.observacoes ILIKE '%rateios MJ%'
  AND fl.paciente_id IS NULL
  AND c.clinica_id = fl.clinica_id
  AND c.paciente_id IS NOT NULL
  AND fl.descricao ILIKE '%' || c.paciente_nome || '%';
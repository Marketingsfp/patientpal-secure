
-- Vincular todas as especialidades (exceto LABORATORIO) ao médico SAO FRANCISCO DE PAULA
INSERT INTO public.medico_especialidades (medico_id, especialidade_id)
SELECT '8edf7bc6-a3a2-4374-8330-0818c5958799'::uuid, e.id
FROM public.especialidades e
WHERE e.id <> 'e737ff20-9409-4fff-911f-b9dd68cb46cd'
ON CONFLICT DO NOTHING;

-- Vincular todos os procedimentos ativos da clínica (exceto grupo Laboratório) ao médico
INSERT INTO public.medico_procedimentos (medico_id, procedimento_id)
SELECT '8edf7bc6-a3a2-4374-8330-0818c5958799'::uuid, p.id
FROM public.procedimentos p
WHERE p.clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
  AND p.ativo = true
  AND (p.grupo IS DISTINCT FROM 'Laboratório')
ON CONFLICT DO NOTHING;

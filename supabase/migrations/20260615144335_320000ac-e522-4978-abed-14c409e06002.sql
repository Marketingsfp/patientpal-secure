UPDATE public.pacientes p
SET codigo_prontuario_anterior = t.novo,
    updated_at = now()
FROM public._tmp_prontuario_updates t
WHERE p.id = t.paciente_id
  AND p.clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'::uuid;

DROP TABLE public._tmp_prontuario_updates;
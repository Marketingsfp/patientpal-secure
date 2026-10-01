INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo, descricao)
SELECT c.id, 'nina_informa_cadastro', true,
       'Nina informa consultas, horários e valores pelo cadastro do sistema (30/09/2026)'
  FROM public.clinicas c
 WHERE c.id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
ON CONFLICT (clinica_id, flag_key) DO UPDATE SET ativo = true, updated_at = now();
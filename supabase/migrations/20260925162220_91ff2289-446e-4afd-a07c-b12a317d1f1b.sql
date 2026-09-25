INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo)
SELECT id, 'nina_jev_fase4', true FROM public.clinicas
WHERE id IN (SELECT clinica_id FROM public.clinica_feature_flags WHERE flag_key = 'nina_jev_fase1')
ON CONFLICT (clinica_id, flag_key) DO UPDATE SET ativo = true;
INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo, descricao)
SELECT clinica_id, 'nina_jev_fase3', true, 'Jev Fase 3 (homologação): encontrar especialidade/serviço quando a busca normal não acha'
FROM public.clinica_feature_flags WHERE flag_key = 'nina_jev_fase1'
ON CONFLICT (clinica_id, flag_key) DO UPDATE SET ativo = true;
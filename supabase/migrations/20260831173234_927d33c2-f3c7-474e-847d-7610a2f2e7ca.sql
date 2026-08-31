INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo)
VALUES ('7570ddde-8c1c-4b55-ba72-cf12b2a6c940', 'nina_agenda_ativa', true)
ON CONFLICT (clinica_id, flag_key) DO UPDATE SET ativo = true;
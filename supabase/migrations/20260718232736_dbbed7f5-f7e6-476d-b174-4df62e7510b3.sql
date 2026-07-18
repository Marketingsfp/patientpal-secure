INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo)
VALUES ('a2e1ffd6-084e-4954-84a0-8fe7788274ae', 'menu_micro_interactions', true)
ON CONFLICT (clinica_id, flag_key) DO UPDATE SET ativo = true;
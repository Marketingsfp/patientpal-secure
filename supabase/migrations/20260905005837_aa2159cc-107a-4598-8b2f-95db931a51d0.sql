INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo, descricao)
SELECT c.id, 'nina_gemini_37_enabled', true, 'Nina usando o modelo Gemini 3.7 Flash (rollback: desligar esta linha)'
FROM public.clinicas c
ON CONFLICT (clinica_id, flag_key) DO UPDATE SET ativo = true, updated_at = now();
INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo, descricao)
SELECT id, 'menu_hover_scale', true, 'Efeito hover scale nos itens do menu lateral'
FROM public.clinicas
WHERE nome ILIKE '%SAO FRANCISCO DE PAULA%'
ON CONFLICT (clinica_id, flag_key) DO UPDATE SET ativo = true;
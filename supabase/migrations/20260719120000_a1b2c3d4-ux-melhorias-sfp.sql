-- Flag de clínica para o pacote de melhorias de UX (navegação SPA sem reload,
-- transição de rota, dark mode, skeletons). Ligada apenas para a
-- Policlínica São Francisco de Paula — mesmo padrão da flag menu_hover_scale.
INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo, descricao)
SELECT id, 'ux_melhorias', true, 'Melhorias de UX: navegação SPA, transições, dark mode e skeletons'
FROM public.clinicas
WHERE nome ILIKE '%SAO FRANCISCO DE PAULA%'
ON CONFLICT (clinica_id, flag_key) DO UPDATE SET ativo = true;

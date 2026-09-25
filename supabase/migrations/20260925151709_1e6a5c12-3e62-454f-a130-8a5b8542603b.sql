INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo, descricao)
SELECT c.id, 'nina_jev_fase1', true, 'Jev Fase 1 (entender o pedido) — vale só em conversas de homologação'
FROM public.clinicas c
WHERE NOT EXISTS (SELECT 1 FROM public.clinica_feature_flags f WHERE f.clinica_id = c.id AND f.flag_key = 'nina_jev_fase1');
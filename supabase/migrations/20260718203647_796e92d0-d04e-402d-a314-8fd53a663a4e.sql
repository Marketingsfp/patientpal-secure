INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo, descricao)
SELECT id, 'agenda_express_disabled', true, 'Desabilita a Agenda Express para esta clínica'
FROM public.clinicas
WHERE upper(nome) LIKE '%SAO FRANCISCO DE PAULA%' OR upper(nome) LIKE '%SÃO FRANCISCO DE PAULA%'
ON CONFLICT (clinica_id, flag_key) DO UPDATE SET ativo = EXCLUDED.ativo, descricao = EXCLUDED.descricao, updated_at = now();
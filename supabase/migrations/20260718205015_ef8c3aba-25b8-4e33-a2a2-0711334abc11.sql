INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo, descricao)
VALUES ('a2e1ffd6-084e-4954-84a0-8fe7788274ae', 'agenda_v2_disabled', true, 'Desativa a rota /app/agenda-v2 (piloto) para esta clínica')
ON CONFLICT (clinica_id, flag_key) DO UPDATE SET ativo = EXCLUDED.ativo, descricao = EXCLUDED.descricao, updated_at = now();
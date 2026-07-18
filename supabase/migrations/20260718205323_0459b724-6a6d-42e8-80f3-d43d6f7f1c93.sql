INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo, descricao)
VALUES ('a2e1ffd6-084e-4954-84a0-8fe7788274ae', 'atendimento_multiplo_disabled', true,
        'Oculta o módulo "Atendimento Múltiplo" na POLICLINICA SAO FRANCISCO DE PAULA')
ON CONFLICT (clinica_id, flag_key)
DO UPDATE SET ativo = EXCLUDED.ativo, descricao = EXCLUDED.descricao, updated_at = now();
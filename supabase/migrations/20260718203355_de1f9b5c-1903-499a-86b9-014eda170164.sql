-- Desativa o Modo Turbo da Agenda na clínica POLICLINICA SAO FRANCISCO DE PAULA
INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo, descricao)
VALUES (
  'a2e1ffd6-084e-4954-84a0-8fe7788274ae',
  'turbo_mode_agenda_disabled',
  true,
  'Modo Turbo removido da Agenda para São Francisco de Paula'
)
ON CONFLICT (clinica_id, flag_key) DO UPDATE SET ativo = EXCLUDED.ativo, descricao = EXCLUDED.descricao;
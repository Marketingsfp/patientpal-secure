-- Liga o módulo Hiperdia em TODAS as clínicas.
--
-- Decisão explícita do responsável pelo projeto (14/08/2026): o Hiperdia deve
-- valer para todas as clínicas, não só para a que pediu. Registrado aqui porque
-- `mem/preferences/feature-flags-por-clinica.md` exige confirmação explícita
-- antes de ligar uma feature globalmente — esta é a confirmação.
--
-- A flag nasceu com default OFF (não existe linha em `clinica_feature_flags`),
-- então este INSERT é o que torna o card visível na tela do paciente.
--
-- ROLLBACK (desliga sem perder o histórico da flag):
--   UPDATE public.clinica_feature_flags SET ativo = false WHERE flag_key = 'hiperdia';
--
-- ATENÇÃO: só aplicar DEPOIS de `20260814180000_hiperdia_registros.sql`. Ligar
-- a flag sem a tabela existir faz o card aparecer e falhar ao carregar.

INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo, descricao)
SELECT id, 'hiperdia', true, 'Módulo Hiperdia: aferições de pressão, glicemia e peso no prontuário do paciente'
FROM public.clinicas
ON CONFLICT (clinica_id, flag_key) DO UPDATE SET ativo = true;

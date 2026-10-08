-- ============================================================================
-- Perfil FINANCEIRO consegue dar baixa (Financeiro → Atendimentos)
-- ============================================================================
--
-- POR QUÊ
--   A baixa que libera o repasse do médico grava status "realizado" no
--   agendamento. A regra de alteração de `agendamentos` (agend_update) aceitava
--   admin, gestor, supervisor, recepção, caixa, médico e enfermeiro — mas não
--   financeiro. Em 08/10/2026, das 10h03 às 14h01, Beth e Zenilda estavam no
--   perfil Financeiro: a tela dizia "Baixa realizada", o banco recusava em
--   silêncio e o atendimento continuava pendente para todo mundo.
--
-- O QUE MUDA
--   Só acrescenta 'financeiro' à lista de agend_update. Nada é tirado de
--   nenhum perfil; inserir agendamento continua como está.
--
-- Idempotente: pode ser rodada mais de uma vez.
-- ============================================================================

ALTER POLICY agend_update ON public.agendamentos
  USING (has_any_role(auth.uid(), clinica_id, ARRAY['admin'::app_role, 'gestor'::app_role, 'supervisor'::app_role, 'recepcao'::app_role, 'caixa'::app_role, 'medico'::app_role, 'enfermeiro'::app_role, 'financeiro'::app_role]))
  WITH CHECK (has_any_role(auth.uid(), clinica_id, ARRAY['admin'::app_role, 'gestor'::app_role, 'supervisor'::app_role, 'recepcao'::app_role, 'caixa'::app_role, 'medico'::app_role, 'enfermeiro'::app_role, 'financeiro'::app_role]));

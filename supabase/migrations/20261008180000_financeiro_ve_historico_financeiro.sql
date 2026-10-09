-- ============================================================================
-- Perfil FINANCEIRO vê o "Histórico do atendimento" (Financeiro → Atendimentos)
-- ============================================================================
--
-- POR QUÊ
--   O botão "Histórico do atendimento" lê o audit_log (quem alterou o quê e
--   quando). A única regra de leitura do audit_log é "Gestores podem ver
--   auditoria" (can_manage_clinica = admin/gestor), então para o perfil
--   Financeiro (Beth e Zenilda, 08/10/2026) o histórico abria vazio.
--
-- O QUE MUDA
--   Só ACRESCENTA uma regra de leitura para o papel financeiro, limitada às
--   tabelas de dinheiro e da agenda. Alterações de permissão, equipe,
--   prontuário, cadastro de paciente e configurações continuam visíveis só
--   para admin/gestor. Nada é tirado de nenhum perfil.
--
-- Idempotente: pode ser rodada mais de uma vez.
-- ============================================================================

DROP POLICY IF EXISTS audit_log_select_financeiro ON public.audit_log;

CREATE POLICY audit_log_select_financeiro ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    clinica_id IS NOT NULL
    AND is_financeiro_clinica(auth.uid(), clinica_id)
    AND table_name IN (
      'agendamentos',
      'fin_lancamentos',
      'fin_atendimentos',
      'fin_categorias',
      'caixa_movimentos',
      'caixa_sessoes',
      'estorno_solicitacoes',
      'contrato_mensalidades',
      'contratos_assinatura',
      'nfse',
      'boletos',
      'pagamentos',
      'medico_repasse_laudo',
      'fin_repasse_terceiro'
    )
  );

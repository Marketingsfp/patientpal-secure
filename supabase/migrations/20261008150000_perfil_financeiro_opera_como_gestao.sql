-- ============================================================================
-- Perfil FINANCEIRO opera caixa e financeiro como a gestão
-- ============================================================================
--
-- POR QUÊ
--   Em 08/10/2026 Beth e Zenilda passaram de Administrador para Financeiro e
--   travaram: o perfil Financeiro nunca tinha sido usado de verdade, e várias
--   regras do banco só aceitavam admin/gestor (`can_manage_clinica`). A gestão
--   decidiu que elas ficam no perfil Financeiro, com o mesmo poder que tinham
--   sobre caixa e financeiro (aprovado pelo dono, lista completa abaixo).
--
-- O QUE MUDA (só ACRESCENTA regras para o papel financeiro; nada é tirado)
--   - caixa_movimentos: ver, corrigir e excluir movimentos de qualquer
--     operadora (aba "Todos (Financeiro)" e conferência de fechamento).
--   - caixa_sessoes: excluir sessão (ver e atualizar já estavam liberados).
--   - Excluir em lançamentos, contas, categorias, empresas, notas, atendimentos
--     financeiros, alertas, repasse de terceiro, boletos, NFS-e, pagamentos e
--     divisão de pagamento.
--   - Renovação de contrato (inserir), emitente da NFS-e (tudo) e regras de
--     classificação automática do financeiro (gravar).
--
--   As travas de caixa fechado e de retroativo ficam em gatilhos, que valem
--   para todos os perfis e não mudam aqui.
--
-- Idempotente: pode ser rodada mais de uma vez.
-- ============================================================================

DO $$
DECLARE
  t text;
  regra constant text := 'is_financeiro_clinica(auth.uid(), clinica_id)';
BEGIN
  -- caixa_movimentos: leitura e correção de qualquer operadora
  EXECUTE 'DROP POLICY IF EXISTS cx_mov_select_financeiro ON public.caixa_movimentos';
  EXECUTE format('CREATE POLICY cx_mov_select_financeiro ON public.caixa_movimentos FOR SELECT TO authenticated USING (%s)', regra);
  EXECUTE 'DROP POLICY IF EXISTS cx_mov_update_financeiro ON public.caixa_movimentos';
  EXECUTE format('CREATE POLICY cx_mov_update_financeiro ON public.caixa_movimentos FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', regra, regra);

  -- Exclusão (antes só admin/gestor)
  FOREACH t IN ARRAY ARRAY[
    'caixa_movimentos', 'caixa_sessoes',
    'fin_lancamentos', 'fin_contas', 'fin_categorias', 'fin_empresas',
    'fin_notas_pacientes', 'fin_atendimentos', 'fin_alertas', 'fin_repasse_terceiro',
    'boletos', 'nfse', 'pagamentos', 'pagamento_splits', 'fin_regras_ia'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete_financeiro', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (%s)',
      t || '_delete_financeiro', t, regra);
  END LOOP;

  -- Regras de classificação automática do financeiro: gravar
  EXECUTE 'DROP POLICY IF EXISTS fin_regras_ia_insert_financeiro ON public.fin_regras_ia';
  EXECUTE format('CREATE POLICY fin_regras_ia_insert_financeiro ON public.fin_regras_ia FOR INSERT TO authenticated WITH CHECK (%s)', regra);
  EXECUTE 'DROP POLICY IF EXISTS fin_regras_ia_update_financeiro ON public.fin_regras_ia';
  EXECUTE format('CREATE POLICY fin_regras_ia_update_financeiro ON public.fin_regras_ia FOR UPDATE TO authenticated USING (%s) WITH CHECK (%s)', regra, regra);

  -- Renovação de contrato
  EXECUTE 'DROP POLICY IF EXISTS contrato_renovacoes_insert_financeiro ON public.contrato_renovacoes';
  EXECUTE format('CREATE POLICY contrato_renovacoes_insert_financeiro ON public.contrato_renovacoes FOR INSERT TO authenticated WITH CHECK (%s)', regra);

  -- Emitente da NFS-e (empresa que emite a nota)
  EXECUTE 'DROP POLICY IF EXISTS nfse_emitentes_all_financeiro ON public.nfse_emitentes';
  EXECUTE format('CREATE POLICY nfse_emitentes_all_financeiro ON public.nfse_emitentes FOR ALL TO authenticated USING (%s) WITH CHECK (%s)', regra, regra);
END $$;

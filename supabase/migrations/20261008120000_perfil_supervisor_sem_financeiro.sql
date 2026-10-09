-- ============================================================================
-- Perfil SUPERVISOR: gestão operacional sem acesso a dinheiro
-- ============================================================================
--
-- POR QUÊ
--   A gestão pediu (08/10/2026) o perfil SUPERVISOR: acompanha equipe,
--   indicadores, agendas e filas, com BLOQUEIO TOTAL da área financeira. O
--   perfil em si (telas liberadas) mora no código — permissoes-presets.ts e a
--   tela de Perfis de Acesso. Aqui ficam as travas que são do banco:
--
--   1) O papel "supervisor" ainda constava nas políticas de GRAVAÇÃO de
--      tabelas financeiras (lista fixa de 20260816000750). Sai delas.
--   2) A função de desfazer baixa de atendimento (estorno de recebimento)
--      também o aceitava. Sai dela.
--   3) Os relatórios de produtividade (marcações por atendente e
--      agendamentos por usuário) exigem a marcação pessoa a pessoa
--      `pode_autorizar` + perfil admin/gestor. O supervisor entra na lista
--      de perfis — a marcação individual continua obrigatória.
--
-- O QUE NÃO MUDA
--   - Hoje só existe um usuário com papel supervisor, de teste e inativo.
--     Nada muda para quem usa o sistema até a gestão trocar perfis em Equipe.
--   - Admin, gestor, financeiro e caixa continuam exatamente como estão.
--
-- Idempotente: pode ser rodada mais de uma vez.
-- ============================================================================

-- 1) Gravação em tabelas financeiras sem o supervisor -----------------------
DO $$
DECLARE
  t text;
  papeis constant text :=
    'has_any_role(auth.uid(), clinica_id, ARRAY[''admin''::app_role, ''gestor''::app_role, ''financeiro''::app_role, ''caixa''::app_role])';
BEGIN
  FOREACH t IN ARRAY ARRAY['boletos', 'fin_atendimentos', 'fin_notas_pacientes', 'nfse', 'pagamento_splits']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_insert_roles') THEN
      EXECUTE format('ALTER POLICY %I ON public.%I WITH CHECK (%s)', t || '_insert_roles', t, papeis);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_policies
               WHERE schemaname = 'public' AND tablename = t AND policyname = t || '_update_roles') THEN
      EXECUTE format('ALTER POLICY %I ON public.%I USING (%s) WITH CHECK (%s)', t || '_update_roles', t, papeis, papeis);
    END IF;
  END LOOP;
END $$;

-- 2) e 3) Ajuste pontual da lista de papéis dentro das funções ---------------
-- A definição é lida do próprio banco e só a lista de papéis é trocada, para
-- não reescrever (e arriscar divergir) o corpo inteiro de cada função.
-- CREATE OR REPLACE preserva dono e permissões de execução.
DO $$
DECLARE
  f record;
  def text;
  novo text;
BEGIN
  -- 2) desfazer baixa: sem supervisor
  FOR f IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'desfazer_baixa_atendimento'
  LOOP
    def := pg_get_functiondef(f.oid);
    novo := replace(def,
      $q$array['admin','gestor','supervisor','financeiro','caixa']$q$,
      $q$array['admin','gestor','financeiro','caixa']$q$);
    IF novo <> def THEN
      EXECUTE novo;
    END IF;
  END LOOP;

  -- 3) relatórios de produtividade: supervisor entra (com pode_autorizar)
  FOR f IN
    SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'rel_marcacoes_por_atendente',
        'rel_agendamentos_marcados',
        'rel_agendamentos_por_usuario',
        'rel_agendamentos_por_usuario_dia',
        'rel_agendamentos_por_usuario_lista'
      )
  LOOP
    def := pg_get_functiondef(f.oid);
    novo := replace(def,
      $q$role IN ('admin', 'gestor')$q$,
      $q$role IN ('admin', 'gestor', 'supervisor')$q$);
    IF novo <> def THEN
      EXECUTE novo;
    END IF;
  END LOOP;
END $$;

-- Compatibilidade de histórico: este identificador originalmente duplicava
-- 20260917144041_b618961f-ac79-4d95-977a-1eac1d3541fa.sql, aplicada pelo Lovable.
-- A definição canônica permanece INTACTA naquele arquivo, que vem antes deste.
-- Não recriar objetos, substituir funções, redistribuir conversas nem escrever
-- em supabase_migrations. Ambientes que já registraram este ID não o reexecutam.
-- Ambientes novos executam a canônica e depois apenas esta verificação.
-- Para histórico invertido (só este ID aplicado), ver docs/zap-os-distribuicao.md.
DO $reconciliar_fila_individual$
DECLARE
  _assinatura text;
  _gatilho record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_attribute a
    JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = to_regclass('public.atend_conversas')
      AND a.attname = 'fila_pendente' AND NOT a.attisdropped
      AND a.atttypid = 'boolean'::regtype AND a.attnotnull
      AND pg_get_expr(d.adbin, d.adrelid) = 'false'
  ) THEN
    RAISE EXCEPTION 'Fila individual incompleta: fila_pendente deve ser boolean NOT NULL DEFAULT false.'
      USING HINT = 'Confira a migração canônica 20260917144041 antes de prosseguir; não reaplique o SQL duplicado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index i
    WHERE i.indexrelid = to_regclass('public.atend_fila_individual_idx')
      AND i.indrelid = to_regclass('public.atend_conversas')
      AND i.indisvalid AND i.indisready AND i.indpred IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'Fila individual incompleta: índice atend_fila_individual_idx ausente ou inválido.';
  END IF;

  FOREACH _assinatura IN ARRAY ARRAY[
    'public.atend_normalizar_fila_individual()',
    'public.atend_resposta_inicia_fila_individual()',
    'public.atend_pool_canonico(uuid,uuid)',
    'public.atend_auto_assign_conversa_interno(uuid,uuid,uuid,text)',
    'public.atend_definir_presenca_manual(uuid,text,integer,uuid)',
    'public.atend_presenca_redistribui()',
    'public.atend_capacidade_liberada_redistribui()',
    'public.atend_distribuicao_snapshot(uuid,uuid,integer,text,text)',
    'public.atend_configurar_capacidade(uuid,uuid,integer)'
  ] LOOP
    IF to_regprocedure(_assinatura) IS NULL THEN
      RAISE EXCEPTION 'Fila individual incompleta: função % ausente.', _assinatura;
    END IF;
  END LOOP;

  FOR _gatilho IN SELECT * FROM (VALUES
    ('public.atend_conversas', 'trg_atend_normalizar_fila_individual',
      'public.atend_normalizar_fila_individual()', 23),
    ('public.atend_conversas', 'trg_atend_capacidade_liberada_redistribui',
      'public.atend_capacidade_liberada_redistribui()', 17),
    ('public.whatsapp_mensagens', 'trg_atend_resposta_inicia_fila_individual',
      'public.atend_resposta_inicia_fila_individual()', 21)
  ) AS g(tabela, nome, funcao, tipo) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_trigger t
      WHERE t.tgrelid = to_regclass(_gatilho.tabela) AND t.tgname = _gatilho.nome
        AND NOT t.tgisinternal AND t.tgenabled IN ('O', 'A')
        AND t.tgfoid = to_regprocedure(_gatilho.funcao) AND t.tgtype = _gatilho.tipo
    ) THEN
      RAISE EXCEPTION 'Fila individual incompleta: gatilho % ausente, desativado ou incompatível.', _gatilho.nome;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy p
    JOIN pg_catalog.pg_class c ON c.oid = p.polrelid
    WHERE p.polrelid = to_regclass('public.atend_conversas')
      AND p.polname = 'atend_fila_individual_privada' AND NOT p.polpermissive
      AND p.polcmd = '*' AND p.polqual IS NOT NULL AND p.polwithcheck IS NOT NULL
      AND c.relrowsecurity
      AND (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') = ANY(p.polroles)
  ) THEN
    RAISE EXCEPTION 'Fila individual incompleta: política restritiva ou RLS ausente/incompatível.';
  END IF;
END;
$reconciliar_fila_individual$;

-- Compatibilidade: SQL aplicado pelo Lovable como
-- 20260917170404_d758959e-1e5c-43ac-9994-9f30c52f6720.sql (canônica intacta).
-- Este ID não estava aplicado. Apenas conferir; não recriar objetos, alterar
-- leituras, substituir funções ou escrever no histórico de migrações.
DO $reconciliar_leitura_operacional$
DECLARE
  _assinatura text;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_class
    WHERE oid = to_regclass('public.atend_leitura_operacional') AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'Leitura operacional incompleta: tabela ou RLS ausente.'
      USING HINT = 'Confira a migração canônica 20260917170404; não reaplique o SQL duplicado.';
  END IF;

  FOREACH _assinatura IN ARRAY ARRAY[
    'public.atend_permite_leitura_operacional(uuid)',
    'public.atend_pode_ver_leitura(uuid,uuid)',
    'public.atend_registrar_leitura(uuid,uuid,uuid)',
    'public.atend_nao_lidas(uuid,uuid[])'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc
      WHERE oid = to_regprocedure(_assinatura) AND prosecdef
        AND 'search_path=public' = ANY(proconfig)
    ) THEN
      RAISE EXCEPTION 'Leitura operacional incompleta: função % ausente ou incompatível.', _assinatura;
    END IF;
  END LOOP;

  IF position('atend_leitura_operacional' IN pg_get_functiondef(
       'public.atend_registrar_leitura(uuid,uuid,uuid)'::regprocedure)) = 0
     OR position('atend_leitura_operacional' IN pg_get_functiondef(
       'public.atend_nao_lidas(uuid,uuid[])'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'Leitura operacional incompleta: rotinas antigas ainda estão ativas.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_index
    WHERE indexrelid = to_regclass('public.idx_atend_leitura_operacional_clinica')
      AND indrelid = to_regclass('public.atend_leitura_operacional') AND indisvalid AND indisready
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polrelid = to_regclass('public.atend_leitura_operacional')
      AND polname = 'leitura_operacional_select' AND polcmd = 'r' AND polqual IS NOT NULL
      AND (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') = ANY(polroles)
  ) THEN
    RAISE EXCEPTION 'Leitura operacional incompleta: índice ou política de leitura ausente.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime')
     AND NOT EXISTS (SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'atend_leitura_operacional') THEN
    RAISE EXCEPTION 'Leitura operacional incompleta: tabela ausente da publicação Realtime.';
  END IF;
END;
$reconciliar_leitura_operacional$;

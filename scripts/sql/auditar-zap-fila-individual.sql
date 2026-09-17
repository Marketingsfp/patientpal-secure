-- Auditoria somente leitura. Executar no ambiente explicitamente selecionado.
-- Não aplica migrações, não faz repair e não lê mensagens ou dados de pacientes.
BEGIN READ ONLY;

SELECT version
FROM supabase_migrations.schema_migrations
WHERE version IN ('20260917144041', '20260917230000')
ORDER BY version;

SELECT a.attname, format_type(a.atttypid, a.atttypmod) AS tipo, a.attnotnull,
       pg_get_expr(d.adbin, d.adrelid) AS valor_padrao
FROM pg_catalog.pg_attribute a
LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
WHERE a.attrelid = to_regclass('public.atend_conversas')
  AND a.attname = 'fila_pendente' AND NOT a.attisdropped;

SELECT pg_get_indexdef(i.indexrelid) AS definicao, i.indisvalid, i.indisready
FROM pg_catalog.pg_index i
WHERE i.indexrelid = to_regclass('public.atend_fila_individual_idx');

SELECT p.oid::regprocedure AS assinatura, pg_get_functiondef(p.oid) AS definicao,
       p.proacl AS privilegios
FROM pg_catalog.pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'atend_normalizar_fila_individual', 'atend_resposta_inicia_fila_individual',
    'atend_pool_canonico', 'atend_auto_assign_conversa_interno',
    'atend_definir_presenca_manual', 'atend_presenca_redistribui',
    'atend_capacidade_liberada_redistribui', 'atend_distribuicao_snapshot',
    'atend_configurar_capacidade'
  )
ORDER BY p.oid::regprocedure::text;

SELECT t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS definicao
FROM pg_catalog.pg_trigger t
WHERE t.tgname IN (
  'trg_atend_normalizar_fila_individual',
  'trg_atend_capacidade_liberada_redistribui',
  'trg_atend_resposta_inicia_fila_individual'
) AND t.tgrelid IN (
  to_regclass('public.atend_conversas'), to_regclass('public.whatsapp_mensagens')
) AND NOT t.tgisinternal
ORDER BY t.tgname;

SELECT c.relrowsecurity, p.polname, p.polpermissive, p.polcmd, p.polroles,
       pg_get_expr(p.polqual, p.polrelid) AS acesso,
       pg_get_expr(p.polwithcheck, p.polrelid) AS escrita
FROM pg_catalog.pg_class c
LEFT JOIN pg_catalog.pg_policy p
  ON p.polrelid = c.oid AND p.polname = 'atend_fila_individual_privada'
WHERE c.oid = to_regclass('public.atend_conversas');

COMMIT;

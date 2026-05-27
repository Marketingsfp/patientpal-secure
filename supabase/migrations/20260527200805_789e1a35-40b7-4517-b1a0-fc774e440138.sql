-- 1) Função auxiliar para remover acentos sem depender da extensão unaccent
CREATE OR REPLACE FUNCTION public.strip_accents(_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT translate(
    _text,
    'ÁÀÂÃÄÅáàâãäåÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÝŸýÿÇçÑñ',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuYYyyCcNn'
  );
$$;

-- 2) Atualiza o trigger existente para também remover acentos
CREATE OR REPLACE FUNCTION public.uppercase_text_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
DECLARE
  cols text[] := ARRAY[
    'nome','descricao','observacoes','observacao','endereco','bairro','cidade',
    'complemento','parentesco','funcao','razao_social','nome_fantasia',
    'responsavel','referencia','titulo','marca','modelo',
    'funcionario_nome','paciente_nome','medico_nome','logradouro'
  ];
  c text;
  v text;
  rec jsonb := to_jsonb(NEW);
BEGIN
  FOREACH c IN ARRAY cols LOOP
    IF (rec ? c) AND (rec->>c) IS NOT NULL AND length(rec->>c) > 0 THEN
      v := upper(public.strip_accents(rec->>c));
      rec := jsonb_set(rec, ARRAY[c], to_jsonb(v));
    END IF;
  END LOOP;
  NEW := jsonb_populate_record(NEW, rec);
  RETURN NEW;
END;
$function$;

-- 3) Atualiza dados já cadastrados.
-- Para cada tabela que já possui o trigger tg_uppercase_text_fields, executa
-- um UPDATE no-op (id = id) para forçar a normalização via trigger BEFORE UPDATE.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT c.relname AS table_name
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE n.nspname = 'public'
      AND NOT t.tgisinternal
      AND p.proname = 'uppercase_text_fields'
      AND EXISTS (
        SELECT 1 FROM information_schema.columns ic
        WHERE ic.table_schema = 'public'
          AND ic.table_name = c.relname
          AND ic.column_name = 'id'
      )
  LOOP
    EXECUTE format('UPDATE public.%I SET id = id', r.table_name);
  END LOOP;
END $$;
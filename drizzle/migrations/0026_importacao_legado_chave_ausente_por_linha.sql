-- Espelha a correção aplicada direto no banco em 16/10/2026 (etapa 5 da SFP parou na linha 461.500):
-- importacao_legado_lote e importacao_legado_pasta_lote passam a recusar o lote só quando ele tem linhas
-- e NENHUMA traz "chave". Linha sem "chave" (FOR JSON omite nulos) segue como pasta vazia.
-- Troca apenas a condição; o restante das funções fica igual. Já aplicado = nada muda.
DO $mig$
DECLARE
  f text; def text; novo text;
  antigo constant text := 'WHERE x ? ''d'' AND NOT (x->''d'') ? ''chave'') THEN';
  corrigido constant text := 'WHERE x ? ''d'' AND NOT (x->''d'') ? ''chave'') AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(_linhas, ''[]''::jsonb)) y WHERE y ? ''d'' AND (y->''d'') ? ''chave'') THEN';
BEGIN
  FOREACH f IN ARRAY ARRAY['public.importacao_legado_lote(uuid,integer,jsonb)',
                           'public.importacao_legado_pasta_lote(uuid,integer,jsonb)'] LOOP
    def := pg_get_functiondef(f::regprocedure);
    IF position(corrigido IN def) > 0 THEN CONTINUE; END IF;
    IF position(antigo IN def) = 0 THEN
      RAISE EXCEPTION 'Condição da chave não encontrada em %', f;
    END IF;
    novo := replace(def, antigo, corrigido);
    EXECUTE novo;
  END LOOP;
END
$mig$;
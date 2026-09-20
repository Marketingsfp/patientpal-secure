-- Autorizado: organizar o catálogo preservando fatos e padronizar SPF -> SFP.
-- Adição compatível: os clientes antigos continuam usando os campos existentes.
-- Rollback: reverter o aplicativo e restaurar SOMENTE os campos editoriais pelo
-- antes/depois de audit_log, com conferência de updated_at. Não apagar auditoria.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE public.nina_cat_servicos ADD COLUMN IF NOT EXISTS estrutura jsonb;
ALTER TABLE public.nina_cat_profissionais ADD COLUMN IF NOT EXISTS estrutura jsonb;
COMMENT ON COLUMN public.nina_cat_servicos.estrutura IS 'Metadados públicos de identificação e complementos por atendimento. Ausência significa desconhecido. Não contém notas internas.';
COMMENT ON COLUMN public.nina_cat_profissionais.estrutura IS 'Metadados públicos de identificação e complementos por consulta. Não altera vínculos nem regras ainda não confirmadas.';

DO $ddl$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['nina_cat_servicos','nina_cat_profissionais'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = ('public.' || t)::regclass AND conname = t || '_estrutura_objeto') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (estrutura IS NULL OR jsonb_typeof(estrutura) = ''object'')', t, t || '_estrutura_objeto');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND tgname = 'trg_audit_' || t) THEN
      EXECUTE format('CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger()', 'trg_audit_' || t, t);
    END IF;
  END LOOP;
END $ddl$;

-- Função temporária: números, booleanos, IDs, ordem e estrutura são preservados.
CREATE OR REPLACE FUNCTION pg_temp.nina_sfp(v jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE resultado jsonb;
BEGIN
  CASE jsonb_typeof(v)
    WHEN 'string' THEN RETURN to_jsonb(regexp_replace(v #>> '{}', '\mSPF\M', 'SFP', 'gi'));
    WHEN 'array' THEN
      SELECT coalesce(jsonb_agg(pg_temp.nina_sfp(value) ORDER BY ord), '[]') INTO resultado FROM jsonb_array_elements(v) WITH ORDINALITY AS e(value,ord);
    WHEN 'object' THEN
      SELECT coalesce(jsonb_object_agg(key,pg_temp.nina_sfp(value)), '{}') INTO resultado FROM jsonb_each(v);
    ELSE RETURN v;
  END CASE;
  RETURN resultado;
END $fn$;

DO $dados$
DECLARE t text; r record; antes jsonb; depois jsonb; coluna text; colunas text[]; estrutura_nova jsonb; texto_coluna text;
BEGIN
  FOREACH t IN ARRAY ARRAY['nina_cat_servicos','nina_cat_profissionais'] LOOP
    colunas := CASE WHEN t = 'nina_cat_servicos'
      THEN ARRAY['nome','valor_observacao','descricao_publica','preparo','restricoes','executantes','formas_pagamento','rascunho']
      ELSE ARRAY['nome','especialidades','horarios','tipo_atendimento','observacao_publica','aviso_dia','formas_pagamento','rascunho'] END;
    FOR r IN EXECUTE format('SELECT * FROM public.%I WHERE status <> ''ARQUIVADO'' FOR UPDATE', t) LOOP
      antes := to_jsonb(r); depois := antes;
      FOREACH coluna IN ARRAY colunas LOOP
        depois := jsonb_set(depois, ARRAY[coluna], coalesce(pg_temp.nina_sfp(antes->coluna),'null'::jsonb));
      END LOOP;
      coluna := CASE WHEN t = 'nina_cat_servicos' THEN 'descricao_publica' ELSE 'observacao_publica' END;
      texto_coluna := depois->>coluna;
      IF texto_coluna IS NOT NULL THEN
        depois := jsonb_set(depois, ARRAY[coluna], to_jsonb(regexp_replace(texto_coluna, '[ \t]+\|[ \t]+', E'\n', 'g')));
      END IF;
      -- Metadados iniciais refletem somente a seção e o marcador já publicados.
      estrutura_nova := coalesce(antes->'estrutura', 'null'::jsonb);
      IF estrutura_nova = 'null'::jsonb THEN
        estrutura_nova := jsonb_build_object('versao',1,'aliases','[]'::jsonb,
          'categoria',CASE WHEN t = 'nina_cat_profissionais' THEN 'consulta' ELSE 'exame_procedimento' END,
          'preparo_status',CASE WHEN coalesce(antes->>'preparo','') <> '' THEN 'informado' ELSE 'nao_informado' END,
          'convenios_status',CASE WHEN jsonb_typeof(antes->'convenios') = 'array' AND jsonb_array_length(antes->'convenios') > 0 THEN 'aceita' ELSE 'nao_informado' END,
          'complementos','[]'::jsonb);
        IF upper(btrim(depois->>'nome')) = 'SFP' OR EXISTS (SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(depois->'executantes')='array' THEN depois->'executantes' ELSE '[]'::jsonb END) e WHERE upper(btrim(e->>'nome'))='SFP') THEN
          estrutura_nova := estrutura_nova || '{"encaminhamento_humano":true}'::jsonb;
        END IF;
      END IF;
      depois := jsonb_set(depois, '{estrutura}', estrutura_nova);
      IF depois IS DISTINCT FROM antes THEN
        IF t = 'nina_cat_servicos' THEN
          UPDATE public.nina_cat_servicos SET nome=depois->>'nome', valor_observacao=depois->>'valor_observacao', descricao_publica=depois->>'descricao_publica',
            preparo=depois->>'preparo', restricoes=depois->>'restricoes', executantes=depois->'executantes', formas_pagamento=depois->'formas_pagamento',
            rascunho=nullif(depois->'rascunho','null'::jsonb), estrutura=estrutura_nova WHERE id=r.id;
        ELSE
          UPDATE public.nina_cat_profissionais SET nome=depois->>'nome', especialidades=depois->'especialidades', horarios=depois->'horarios',
            tipo_atendimento=depois->>'tipo_atendimento', observacao_publica=depois->>'observacao_publica', aviso_dia=depois->>'aviso_dia',
            formas_pagamento=depois->'formas_pagamento', rascunho=nullif(depois->'rascunho','null'::jsonb), estrutura=estrutura_nova WHERE id=r.id;
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $dados$;
NOTIFY pgrst, 'reload schema';
COMMIT;

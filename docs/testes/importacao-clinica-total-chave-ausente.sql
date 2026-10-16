-- Teste: linha SEM a propriedade "chave" no meio do lote (FOR JSON do SQL Server omite nulos).
-- Esperado: o lote passa e a linha vira "pasta vazia"; lote em que NENHUMA linha tem "chave" é recusado.
-- Vale para importacao_legado_lote (pessoas) e importacao_legado_pasta_lote (etapa 5).
-- Clínica fictícia; termina SEMPRE com erro de propósito ("TESTE OK ..." ou "FALHOU ..."), o que desfaz tudo.
DO $$
DECLARE
  adm uuid := (SELECT user_id FROM public.user_roles
                WHERE role = 'admin'::app_role_global AND clinica_id IS NULL LIMIT 1);
  c uuid; ex uuid; r jsonb; i int; recusou boolean;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', adm::text, true);
  INSERT INTO public.clinicas (nome) VALUES ('CLINICA TESTE SEM CHAVE') RETURNING id INTO c;

  ex := (public.importacao_legado_iniciar(c, 'profissionais', 'prof.jsonl', 1)).id;
  PERFORM public.importacao_legado_lote(ex, 1, '[{"n":1,"d":{"codigo_pessoa":"P1","nome":"PROF TESTE"}}]');
  PERFORM public.importacao_legado_concluir(ex);

  -- Lote só com linhas sem "chave": continua recusado (arquivo antigo).
  ex := (public.importacao_legado_iniciar(c, 'pessoas', 'pessoas_v2.jsonl', 1)).id;
  recusou := false;
  BEGIN
    PERFORM public.importacao_legado_lote(ex, 1, '[{"n":1,"d":{"codigo_pessoa":"1","nome":"SEM CHAVE TESTE"}}]');
  EXCEPTION WHEN OTHERS THEN recusou := SQLERRM LIKE '%sem o campo "chave"%';
  END;
  IF NOT recusou THEN RAISE EXCEPTION 'FALHOU: lote sem nenhuma chave deveria ser recusado'; END IF;

  -- Linha sem "chave" no meio do lote: aceita como pasta vazia.
  r := public.importacao_legado_lote(ex, 3, '[
   {"n":1,"d":{"codigo_pessoa":"1","nome":"ANA TESTE","chave":"500"}},
   {"n":2,"d":{"codigo_pessoa":"2","nome":"BIA TESTE"}},
   {"n":3,"d":{"codigo_pessoa":"3","nome":"CAIO TESTE","chave":"501"}}]');
  IF (SELECT count(*) FROM public.pacientes WHERE clinica_id = c) <> 3 THEN
    RAISE EXCEPTION 'FALHOU pessoas: %', r;
  END IF;
  PERFORM public.importacao_legado_numerar_pendentes(c, 100);
  PERFORM public.importacao_legado_concluir(ex);
  IF (SELECT string_agg(codigo_prontuario_anterior || '=' || codigo_prontuario, ',' ORDER BY codigo_prontuario_anterior)
        FROM public.pacientes WHERE clinica_id = c) <> '1=500,2=502,3=501' THEN
    RAISE EXCEPTION 'FALHOU numeração pessoas: %', (SELECT string_agg(codigo_prontuario_anterior || '=' || codigo_prontuario, ',')
        FROM public.pacientes WHERE clinica_id = c);
  END IF;

  -- Etapa 5: lote só sem "chave" recusado; linha sem "chave" no meio aceita.
  ex := (public.importacao_legado_iniciar(c, 'corrigir_pasta', 'pessoas_v2.jsonl', 1)).id;
  recusou := false;
  BEGIN
    PERFORM public.importacao_legado_pasta_lote(ex, 1, '[{"n":1,"d":{"codigo_pessoa":"2","nome":"BIA TESTE"}}]');
  EXCEPTION WHEN OTHERS THEN recusou := SQLERRM LIKE '%sem o campo "chave"%';
  END;
  IF NOT recusou THEN RAISE EXCEPTION 'FALHOU: etapa 5 sem nenhuma chave deveria ser recusada'; END IF;

  PERFORM public.importacao_legado_pasta_lote(ex, 3, '[
   {"n":1,"d":{"codigo_pessoa":"1","nome":"ANA TESTE","chave":"500"}},
   {"n":2,"d":{"codigo_pessoa":"2","nome":"BIA TESTE"}},
   {"n":3,"d":{"codigo_pessoa":"3","nome":"CAIO TESTE","chave":"501"}}]');
  i := 0;
  LOOP
    r := public.importacao_legado_pasta_aplicar(ex, 100);
    i := i + 1;
    EXIT WHEN r->>'fase' = 'aplicado' OR i > 20;
  END LOOP;
  IF r->>'fase' <> 'aplicado' THEN RAISE EXCEPTION 'FALHOU etapa 5 não terminou: %', r; END IF;
  IF (SELECT codigo_prontuario FROM public.pacientes WHERE clinica_id = c AND codigo_prontuario_anterior = '1') <> '500'
     OR (SELECT codigo_prontuario FROM public.pacientes WHERE clinica_id = c AND codigo_prontuario_anterior = '3') <> '501'
     OR (SELECT codigo_prontuario FROM public.pacientes WHERE clinica_id = c AND codigo_prontuario_anterior = '2') !~ '^\d+$' THEN
    RAISE EXCEPTION 'FALHOU etapa 5: %', (SELECT string_agg(codigo_prontuario_anterior || '=' || codigo_prontuario, ',')
        FROM public.pacientes WHERE clinica_id = c);
  END IF;
  RAISE EXCEPTION 'TESTE OK (desfeito): %', (SELECT string_agg(codigo_prontuario_anterior || '=' || codigo_prontuario, ',' ORDER BY codigo_prontuario_anterior)
        FROM public.pacientes WHERE clinica_id = c);
END $$;

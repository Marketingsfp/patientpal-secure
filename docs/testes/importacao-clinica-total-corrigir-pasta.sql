-- Teste da etapa 5 "Corrigir número da pasta". Clínica fictícia; termina SEMPRE com erro de propósito
-- ("TESTE OK ..." ou "FALHOU ..."), o que desfaz tudo.
DO $$
DECLARE
  adm uuid := (SELECT user_id FROM public.user_roles
                WHERE role = 'admin'::app_role_global AND clinica_id IS NULL LIMIT 1);
  c uuid; ex uuid; f text; r jsonb; v_pac5 uuid; v_med uuid; i int;
  v2 jsonb := '[
   {"n":1,"d":{"codigo_pessoa":"5","nome":"ANA TESTE","chave":"7"}},
   {"n":2,"d":{"codigo_pessoa":"7","nome":"BIA TESTE","chave":"5"}},
   {"n":3,"d":{"codigo_pessoa":"9","nome":"CAIO TESTE","chave":"0144598"}},
   {"n":4,"d":{"codigo_pessoa":"11","nome":"DANI TESTE","chave":"Ind"}},
   {"n":5,"d":{"codigo_pessoa":"13","nome":"EVA TESTE","chave":"300"}},
   {"n":6,"d":{"codigo_pessoa":"12","nome":"FABIO TESTE","chave":"300"}},
   {"n":7,"d":{"codigo_pessoa":"14","nome":"GIL NOVO","chave":"9000"}},
   {"n":8,"d":{"codigo_pessoa":"15","nome":"123","chave":"55"}},
   {"n":9,"d":{"codigo_pessoa":"16","nome":"HUGO TESTE","chave":"12345678"}}
  ]';
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', adm::text, true);
  PERFORM set_config('app.skip_telefone_check', '1', true);
  INSERT INTO public.clinicas (nome) VALUES ('CLINICA TESTE PASTA') RETURNING id INTO c;
  INSERT INTO public.pacientes (clinica_id, nome, codigo_prontuario) VALUES (c, 'JA EXISTIA TESTE', '9000');
  INSERT INTO public.medicos (clinica_id, nome) VALUES (c, 'DRA TESTE') RETURNING id INTO v_med;

  -- Etapas 1–4 como foram rodadas.
  ex := (public.importacao_legado_iniciar(c, 'profissionais', 'prof.jsonl', 1)).id;
  PERFORM public.importacao_legado_lote(ex, 1, '[{"n":1,"d":{"codigo_pessoa":"P1","nome":"PROF TESTE"}}]');
  PERFORM public.importacao_legado_concluir(ex);
  ex := (public.importacao_legado_iniciar(c, 'pessoas', 'pessoas.jsonl', 1)).id;
  PERFORM public.importacao_legado_lote(ex, 7, '[
   {"n":1,"d":{"codigo_pessoa":"5","nome":"ANA TESTE","chave":""}},
   {"n":2,"d":{"codigo_pessoa":"7","nome":"BIA TESTE","chave":""}},
   {"n":3,"d":{"codigo_pessoa":"9","nome":"CAIO TESTE","chave":""}},
   {"n":4,"d":{"codigo_pessoa":"11","nome":"DANI TESTE","chave":""}},
   {"n":5,"d":{"codigo_pessoa":"12","nome":"FABIO TESTE","chave":""}},
   {"n":6,"d":{"codigo_pessoa":"13","nome":"EVA TESTE","chave":""}},
   {"n":7,"d":{"codigo_pessoa":"20","nome":"IVO FORA","chave":""}}]');
  PERFORM public.importacao_legado_numerar_pendentes(c, 100);
  -- Reproduz o estado errado de hoje: número = codigo_pessoa.
  UPDATE public.pacientes SET codigo_prontuario = codigo_prontuario_anterior
   WHERE clinica_id = c AND origem = 'importacao_clinica_total';
  PERFORM public.importacao_legado_concluir(ex);
  ex := (public.importacao_legado_iniciar(c, 'prontuarios', 'pr.jsonl', 1)).id;
  PERFORM public.importacao_legado_lote(ex, 2, '[
   {"n":1,"d":{"codigo_prontuario":"900","codigo_cliente":"5","codigo_profissional":"P1","data":"2019-05-03T14:22:10","descricao":"x"}},
   {"n":2,"d":{"codigo_prontuario":"901","codigo_cliente":"999","descricao":"orfao"}}]');
  PERFORM public.importacao_legado_concluir(ex);
  ex := (public.importacao_legado_iniciar(c, 'observacoes', 'ob.jsonl', 1)).id;
  PERFORM public.importacao_legado_lote(ex, 1, '[{"n":1,"d":{"codigo_observacao":"1","codigo_pessoa":"7","observacao":"oi"}}]');
  PERFORM public.importacao_legado_concluir(ex);
  SELECT id INTO v_pac5 FROM public.pacientes WHERE clinica_id = c AND codigo_prontuario_anterior = '5';

  -- Etapa 5.
  ex := (public.importacao_legado_iniciar(c, 'corrigir_pasta', 'pessoas_v2.jsonl', 1)).id;
  PERFORM public.importacao_legado_pasta_lote(ex, 9, v2);
  i := 0;
  LOOP
    r := public.importacao_legado_pasta_aplicar(ex, 2);   -- pedaços pequenos de propósito
    i := i + 1;
    EXIT WHEN r->>'fase' = 'aplicado' OR i > 50;
  END LOOP;
  PERFORM public.importacao_legado_concluir(ex);

  f := (SELECT string_agg(coalesce(codigo_prontuario_anterior, '-') || '=' || codigo_prontuario, ','
                          ORDER BY coalesce(codigo_prontuario_anterior, '0')::int)
          FROM public.pacientes WHERE clinica_id = c);
  IF f <> '-=9000,5=7,7=5,9=144598,11=144599,12=300,13=144600,14=144601,16=144602,20=144603' THEN
    RAISE EXCEPTION 'FALHOU numeração: %', f;
  END IF;
  IF (SELECT proximo FROM public.prontuario_sequencia WHERE clinica_id = c) <> 144604 THEN
    RAISE EXCEPTION 'FALHOU sequência: %', (SELECT proximo FROM public.prontuario_sequencia WHERE clinica_id = c);
  END IF;
  IF (SELECT paciente_id FROM public.prontuarios WHERE clinica_id = c AND legado_id = '900') <> v_pac5 THEN
    RAISE EXCEPTION 'FALHOU vínculo do prontuário';
  END IF;
  IF (SELECT texto FROM public.paciente_observacoes_legado WHERE clinica_id = c AND legado_id = 'pessoa:11:chave') <> 'Ind' THEN
    RAISE EXCEPTION 'FALHOU chave original';
  END IF;
  IF (SELECT count(*) FROM public.importacao_legado_erros WHERE execucao_id = ex AND tipo = 'aviso') <> 5 THEN
    RAISE EXCEPTION 'FALHOU avisos';
  END IF;
  r := public.importacao_legado_problemas(c);
  IF r->'sem_cadastro'->0->>'nome' <> '123' OR (r->>'prontuarios_orfaos')::int <> 1 THEN
    RAISE EXCEPTION 'FALHOU problemas: %', r;
  END IF;
  r := public.importacao_legado_resumo(c);
  IF (r->>'pasta_novos')::int <> 2 OR (r->>'pasta_numeros_gerados')::int <> 5 THEN
    RAISE EXCEPTION 'FALHOU resumo: %', r;
  END IF;

  -- Rodar de novo não muda nada.
  r := public.importacao_legado_pasta_aplicar(ex, 100);
  PERFORM public.importacao_legado_iniciar(c, 'corrigir_pasta', 'pessoas_v2.jsonl', 1);
  IF (SELECT string_agg(coalesce(codigo_prontuario_anterior, '-') || '=' || codigo_prontuario, ','
                          ORDER BY coalesce(codigo_prontuario_anterior, '0')::int)
          FROM public.pacientes WHERE clinica_id = c) <> f THEN
    RAISE EXCEPTION 'FALHOU idempotência';
  END IF;

  -- Associar o profissional depois liga o prontuário já importado.
  PERFORM public.importacao_legado_associar_profissional(c, 'P1', v_med, false);
  r := public.importacao_legado_reaplicar_profissional(c, 'P1');
  IF (r->>'atualizados')::int <> 1
     OR (SELECT medico_id FROM public.prontuarios WHERE clinica_id = c AND legado_id = '900') <> v_med THEN
    RAISE EXCEPTION 'FALHOU médico: %', r;
  END IF;
  RAISE EXCEPTION 'TESTE OK (desfeito): %', f;
END $$;

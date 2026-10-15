-- Teste da importação Clínica Total: número da pasta (campo "chave").
-- Cria uma clínica fictícia e termina SEMPRE com erro de propósito ("TESTE OK ..." ou "FALHOU ..."),
-- o que desfaz tudo: nada fica gravado.
DO $$
DECLARE
  adm uuid := (SELECT user_id FROM public.user_roles
                WHERE role = 'admin'::app_role_global AND clinica_id IS NULL LIMIT 1);
  c uuid; ex uuid; f text; rej boolean := false;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', adm, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.jwt.claim.sub', adm::text, true);
  INSERT INTO public.clinicas (nome) VALUES ('CLINICA TESTE CHAVE') RETURNING id INTO c;
  ex := (public.importacao_legado_iniciar(c, 'profissionais', 'prof.jsonl', 1)).id;
  PERFORM public.importacao_legado_concluir(ex);
  ex := (public.importacao_legado_iniciar(c, 'pessoas', 'teste.jsonl', 1)).id;

  -- Pessoa 30 chega antes da 10 com a mesma pasta: a 10 (menor código) fica com o número.
  PERFORM public.importacao_legado_lote(ex, 7, '[
   {"n":1,"d":{"codigo_pessoa":"1","nome":"ANA TESTE","chave":"490020"}},
   {"n":2,"d":{"codigo_pessoa":"2","nome":"BIA TESTE","chave":" 0144598 "}},
   {"n":3,"d":{"codigo_pessoa":"3","nome":"CAIO TESTE","chave":""}},
   {"n":4,"d":{"codigo_pessoa":"4","nome":"DANI TESTE","chave":"Ind"}},
   {"n":5,"d":{"codigo_pessoa":"30","nome":"EVA TESTE","chave":"777"}},
   {"n":6,"d":{"codigo_pessoa":"10","nome":"FABIO TESTE","chave":"0777"}},
   {"n":7,"d":{"codigo_pessoa":"5","nome":"GIL TESTE","chave":"0000"}}
  ]'::jsonb);

  -- Arquivo antigo sem "chave" é recusado.
  BEGIN
    PERFORM public.importacao_legado_lote(ex, 8, '[{"n":8,"d":{"codigo_pessoa":"9","nome":"SEM CHAVE"}}]'::jsonb);
  EXCEPTION WHEN OTHERS THEN rej := SQLERRM LIKE '%sem o campo "chave"%';
  END;
  IF NOT rej THEN RAISE EXCEPTION 'FALHOU: aceitou arquivo sem chave'; END IF;

  -- Concluir antes de numerar é recusado.
  rej := false;
  BEGIN PERFORM public.importacao_legado_concluir(ex);
  EXCEPTION WHEN OTHERS THEN rej := true; END;
  IF NOT rej THEN RAISE EXCEPTION 'FALHOU: concluiu com números pendentes'; END IF;

  PERFORM public.importacao_legado_numerar_pendentes(c, 2000);

  f := (SELECT string_agg(codigo_prontuario_anterior || '=' || codigo_prontuario, ',' ORDER BY codigo_prontuario_anterior::int)
          FROM public.pacientes WHERE clinica_id = c);
  -- 1 e 2 com a pasta (zeros à esquerda saem); 10 fica com 777; vazia/Ind/zerada (3,4,5) e a repetida (30)
  -- ganham número acima do maior (490020), pela ordem do código antigo.
  IF f <> '1=490020,2=144598,3=490021,4=490022,5=490023,10=777,30=490024' THEN
    RAISE EXCEPTION 'FALHOU numeração: %', f;
  END IF;
  IF (SELECT proximo FROM public.prontuario_sequencia WHERE clinica_id = c) <> 490025 THEN
    RAISE EXCEPTION 'FALHOU sequência';
  END IF;
  IF (SELECT texto FROM public.paciente_observacoes_legado WHERE clinica_id = c AND legado_id = 'pessoa:4:chave') <> 'Ind' THEN
    RAISE EXCEPTION 'FALHOU chave original guardada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.importacao_legado_erros WHERE clinica_id = c AND tipo = 'aviso'
                  AND chave = '30' AND motivo LIKE 'Pasta 777 repetida%') THEN
    RAISE EXCEPTION 'FALHOU aviso de repetida';
  END IF;
  -- Reenviar o mesmo arquivo não duplica nem renumera.
  PERFORM public.importacao_legado_lote(ex, 9, '[{"n":9,"d":{"codigo_pessoa":"30","nome":"EVA TESTE","chave":"777"}}]'::jsonb);
  IF (SELECT count(*) FROM public.pacientes WHERE clinica_id = c) <> 7
     OR (SELECT codigo_prontuario FROM public.pacientes WHERE clinica_id = c AND codigo_prontuario_anterior = '30') <> '490024' THEN
    RAISE EXCEPTION 'FALHOU reimportação';
  END IF;
  RAISE EXCEPTION 'TESTE OK (desfeito): %', f;
END $$;

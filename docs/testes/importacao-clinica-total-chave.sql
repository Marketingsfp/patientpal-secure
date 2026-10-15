-- Teste da importação Clínica Total: número da pasta (campo "chave").
-- Usa uma clínica fictícia criada aqui dentro e desfaz tudo no final (ROLLBACK).
-- Rodar: psql -v ON_ERROR_STOP=1 -f docs/testes/importacao-clinica-total-chave.sql
BEGIN;
SELECT user_id AS adm FROM public.user_roles
 WHERE role = 'admin'::app_role_global AND clinica_id IS NULL LIMIT 1 \gset
INSERT INTO public.clinicas (nome) VALUES ('CLINICA TESTE CHAVE') RETURNING id AS cli \gset
SELECT set_config('request.jwt.claims', json_build_object('sub', :'adm', 'role', 'authenticated')::text, true);
SET LOCAL ROLE authenticated;

-- Pessoa 30 chega antes da 10 com a mesma pasta: a 10 (menor código) fica com o número.
SELECT (public.importacao_legado_iniciar(:'cli', 'pessoas', 'teste.jsonl', 1)).id AS ex \gset
SELECT public.importacao_legado_lote(:'ex', 7, '[
 {"n":1,"d":{"codigo_pessoa":"1","nome":"ANA TESTE","chave":"490020"}},
 {"n":2,"d":{"codigo_pessoa":"2","nome":"BIA TESTE","chave":" 0144598 "}},
 {"n":3,"d":{"codigo_pessoa":"3","nome":"CAIO TESTE","chave":""}},
 {"n":4,"d":{"codigo_pessoa":"4","nome":"DANI TESTE","chave":"Ind"}},
 {"n":5,"d":{"codigo_pessoa":"30","nome":"EVA TESTE","chave":"777"}},
 {"n":6,"d":{"codigo_pessoa":"10","nome":"FABIO TESTE","chave":"0777"}},
 {"n":7,"d":{"codigo_pessoa":"5","nome":"GIL TESTE","chave":"0000"}}
]'::jsonb) IS NOT NULL AS lote_ok;

-- Arquivo antigo sem "chave" é recusado.
DO $$ BEGIN
  PERFORM public.importacao_legado_lote(
    (SELECT id FROM public.importacao_legado_execucoes WHERE arquivo_nome = 'teste.jsonl' ORDER BY created_at DESC LIMIT 1),
    8, '[{"n":8,"d":{"codigo_pessoa":"9","nome":"SEM CHAVE"}}]'::jsonb);
  RAISE EXCEPTION 'FALHOU: aceitou arquivo sem chave';
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FALHOU%' THEN RAISE; END IF;
END $$;

SELECT public.importacao_legado_numerar_pendentes(:'cli', 2000);

DO $$
DECLARE c uuid := (SELECT id FROM public.clinicas WHERE nome = 'CLINICA TESTE CHAVE');
  f text;
BEGIN
  f := (SELECT string_agg(codigo_prontuario_anterior || '=' || codigo_prontuario, ',' ORDER BY codigo_prontuario_anterior::int)
          FROM public.pacientes WHERE clinica_id = c);
  -- 1 e 2 com a pasta; 10 fica com 777; 3,4,5 (vazia/Ind/zerada) e 30 (repetida) ganham 490021.. pela ordem do código.
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
  RAISE NOTICE 'OK: %', f;
END $$;
ROLLBACK;

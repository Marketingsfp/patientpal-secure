DO $$
DECLARE c uuid; un uuid;
BEGIN
  INSERT INTO public.clinicas (id, nome, ativo)
  VALUES ('00000000-0000-4000-8000-0000000000a1'::uuid, '[HOMOLOG QA] Catálogo Nina', true)
  RETURNING id INTO c;

  INSERT INTO public.unidades (clinica_id, nome, ativo)
  VALUES (c, 'Unidade Centro QA', true) RETURNING id INTO un;

  INSERT INTO public.nina_cat_servicos (clinica_id, nome, valor, descricao_publica, preparo, restricoes, nota_interna, executantes, formas_pagamento, status, publicado_em)
  VALUES (c, 'ULTRASSOM QA ABDOME', 200,
    'Exame de imagem do abdome total.',
    'Jejum de 8 horas e bexiga cheia.',
    'Idade mínima 12 anos.',
    'SEGREDO INTERNO QA: margem negociada com o parceiro.',
    '[{"nome":"Dra. Fictícia Alfa","horarios":"Terça 14h","observacao":null}]'::jsonb,
    '[{"forma":"Dinheiro","valor":200,"condicao":null,"observacao":null},{"forma":"Cartão","valor":250,"condicao":null,"observacao":null}]'::jsonb,
    'PUBLICADO', now());

  INSERT INTO public.nina_cat_servicos (clinica_id, nome, valor, descricao_publica, formas_pagamento, status)
  VALUES (c, 'TOMOGRAFIA QA RASCUNHO', 900, 'Não deve aparecer.',
    '[{"forma":"Dinheiro","valor":900}]'::jsonb, 'RASCUNHO');

  INSERT INTO public.nina_cat_servicos (clinica_id, nome, valor, descricao_publica, formas_pagamento, status, publicado_em)
  VALUES (c, 'RAIO X QA ARQUIVADO', 80, 'Não deve aparecer.',
    '[{"forma":"Dinheiro","valor":80}]'::jsonb, 'ARQUIVADO', now());

  INSERT INTO public.nina_cat_servicos (clinica_id, nome, valor, descricao_publica, formas_pagamento, rascunho, status, publicado_em)
  VALUES (c, 'ELETROCARDIOGRAMA QA', 60, 'Versão publicada vigente.',
    '[{"forma":"Dinheiro","valor":60}]'::jsonb,
    '{"nome":"ELETROCARDIOGRAMA QA","valor":999,"descricao_publica":"VERSAO EM REVISAO NAO PUBLICADA"}'::jsonb,
    'PUBLICADO', now());

  INSERT INTO public.nina_cat_profissionais (clinica_id, unidade_id, nome, especialidades, atende_consultorio, formas_pagamento, convenios, horarios, tipo_atendimento, observacao_publica, aviso_dia, aviso_valido_de, aviso_valido_ate, nota_interna, status, publicado_em)
  VALUES (c, un, 'Dr. Fictício Beta',
    '[{"nome":"Dermatologia"}]'::jsonb, true,
    '[{"forma":"Dinheiro","valor":130,"condicao":"Consulta Dermatologia"},{"forma":"Cartão","valor":160,"condicao":"Consulta Dermatologia"}]'::jsonb,
    '[{"nome":"Convênio QA Saúde"}]'::jsonb,
    '[{"dia":"Quinta","hora":"14:00","recorrencia":"quinzenal"},{"dia":"Sábado","hora":null,"recorrencia":null}]'::jsonb,
    'Consulta', 'Atende adultos.', 'Agenda reduzida nesta semana.',
    current_date - 1, current_date + 5,
    'SEGREDO INTERNO QA: profissional em negociação de repasse.', 'PUBLICADO', now());

  INSERT INTO public.nina_cat_profissionais (clinica_id, nome, especialidades, formas_pagamento, tipo_atendimento, aviso_dia, aviso_valido_de, aviso_valido_ate, status, publicado_em)
  VALUES (c, 'Dra. Fictícia Gama', '[{"nome":"Dermatologia"}]'::jsonb,
    '[{"forma":"Dinheiro","valor":140,"condicao":"Consulta Dermatologia"}]'::jsonb,
    'Consulta', 'AVISO VENCIDO QA NAO DEVE APARECER',
    current_date - 30, current_date - 10, 'PUBLICADO', now());

  INSERT INTO public.nina_cat_profissionais (clinica_id, nome, especialidades, status)
  VALUES (c, 'Dr. Fictício Delta Rascunho', '[{"nome":"Dermatologia"}]'::jsonb, 'RASCUNHO');

  INSERT INTO public.clinica_feature_flags (clinica_id, flag_key, ativo)
  VALUES (c, 'nina_catalogo_fonte_enabled', true);
END $$;
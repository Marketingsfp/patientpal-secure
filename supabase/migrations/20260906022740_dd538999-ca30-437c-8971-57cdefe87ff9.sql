-- Migração pontual planilha -> catálogo da Nina (clínica Policlínica Menino Jesus).
-- Idempotente: só cria o que ainda não existe com o mesmo nome normalizado.
-- Nada é publicado; nada da planilha é apagado.

WITH base AS (
  SELECT r.linha_origem,
         NULLIF(btrim(r.bruto->>'col_0'),'') AS nome_raw,
         NULLIF(btrim(r.bruto->>'col_1'),'') AS dias,
         NULLIF(btrim(r.bruto->>'col_2'),'') AS prof,
         NULLIF(btrim(r.bruto->>'col_3'),'') AS idade,
         r.preco_dinheiro AS pd,
         r.preco_cartao AS pc,
         NULLIF(btrim(r.bruto->>'col_6'),'') AS obs,
         NULLIF(btrim(r.bruto->>'col_7'),'') AS ate,
         NULLIF(btrim(coalesce(r.preparo,'')),'') AS preparo
  FROM public.nina_kb_registros r
  JOIN public.nina_kb_bases b ON b.id = r.base_id AND b.status = 'ATIVA'
  WHERE r.clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
), grp AS (
  SELECT *, sum(CASE WHEN nome_raw IS NOT NULL THEN 1 ELSE 0 END) OVER (ORDER BY linha_origem) AS g,
         sum(CASE WHEN dias = 'DIAS E HORÁRIOS' THEN 1 ELSE 0 END) OVER (ORDER BY linha_origem) AS gsec
  FROM base
), nomeado AS (
  SELECT *,
         first_value(nome_raw) OVER (PARTITION BY g ORDER BY linha_origem) AS nome,
         first_value(CASE WHEN dias = 'DIAS E HORÁRIOS' THEN nome_raw END)
           OVER (PARTITION BY gsec ORDER BY linha_origem) AS especialidade
  FROM grp
), linhas AS (
  SELECT * FROM nomeado
  WHERE dias IS DISTINCT FROM 'DIAS E HORÁRIOS' AND nome IS NOT NULL
),
/* ---------------- Exames e procedimentos ---------------- */
exames AS (SELECT * FROM linhas WHERE nome NOT ILIKE 'CONSULTA%'),
exames_ok AS (
  SELECT nome FROM exames
  GROUP BY nome
  HAVING count(DISTINCT coalesce(pd::text,'-') || '|' || coalesce(pc::text,'-')) = 1
),
exames_agg AS (
  SELECT e.nome,
         max(e.pd) AS pd,
         max(e.pc) AS pc,
         max(e.preparo) AS preparo,
         max(NULLIF(e.idade,'-')) AS idade,
         string_agg(DISTINCT e.linha_origem::text, ', ' ORDER BY e.linha_origem::text) AS linhas,
         jsonb_agg(
           jsonb_build_object(
             'medico_id', (SELECT m.id FROM public.medicos m
                            WHERE m.clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
                              AND lower(unaccent(m.nome)) = lower(unaccent(e.prof)) LIMIT 1),
             'nome', e.prof,
             'horarios', left(concat_ws(' — ', e.dias, e.obs,
                          CASE WHEN e.ate IS NOT NULL THEN 'Pode chegar até: ' || e.ate END), 200),
             'observacao', NULL
           ) ORDER BY e.linha_origem
         ) FILTER (WHERE e.prof IS NOT NULL) AS executantes
  FROM exames e
  JOIN exames_ok ok ON ok.nome = e.nome
  GROUP BY e.nome
)
INSERT INTO public.nina_cat_servicos
  (clinica_id, procedimento_id, nome, valor, valor_observacao, descricao_publica,
   preparo, restricoes, nota_interna, executantes, formas_pagamento, status)
SELECT '7570ddde-8c1c-4b55-ba72-cf12b2a6c940',
       (SELECT p.id FROM public.procedimentos p
          WHERE p.clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
            AND lower(unaccent(p.nome)) = lower(unaccent(a.nome)) LIMIT 1),
       a.nome,
       NULL,
       NULL,
       NULL,
       a.preparo,
       CASE WHEN a.idade IS NOT NULL THEN 'Idade mínima informada na planilha: ' || a.idade END,
       'Migrado da planilha da Nina (aba Especialidades, linha(s) ' || a.linhas || '). Revisar antes de publicar.',
       coalesce(a.executantes, '[]'::jsonb),
       (
         CASE WHEN a.pd IS NOT NULL THEN jsonb_build_array(
                jsonb_build_object('forma','Dinheiro','valor',a.pd,'condicao',NULL,'observacao',NULL))
              ELSE '[]'::jsonb END
         ||
         CASE WHEN a.pc IS NOT NULL THEN jsonb_build_array(
                jsonb_build_object('forma','Cartão','valor',a.pc,'condicao',NULL,'observacao',NULL))
              ELSE '[]'::jsonb END
       ),
       'RASCUNHO'
FROM exames_agg a
WHERE NOT EXISTS (
  SELECT 1 FROM public.nina_cat_servicos s
   WHERE s.clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
     AND lower(unaccent(s.nome)) = lower(unaccent(a.nome))
);

/* ---------------- Consultas e profissionais ---------------- */
WITH base AS (
  SELECT r.linha_origem,
         NULLIF(btrim(r.bruto->>'col_0'),'') AS nome_raw,
         NULLIF(btrim(r.bruto->>'col_1'),'') AS dias,
         NULLIF(btrim(r.bruto->>'col_2'),'') AS prof,
         NULLIF(btrim(r.bruto->>'col_3'),'') AS idade,
         r.preco_dinheiro AS pd,
         r.preco_cartao AS pc,
         NULLIF(btrim(r.bruto->>'col_6'),'') AS obs,
         NULLIF(btrim(r.bruto->>'col_7'),'') AS ate
  FROM public.nina_kb_registros r
  JOIN public.nina_kb_bases b ON b.id = r.base_id AND b.status = 'ATIVA'
  WHERE r.clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
), grp AS (
  SELECT *, sum(CASE WHEN nome_raw IS NOT NULL THEN 1 ELSE 0 END) OVER (ORDER BY linha_origem) AS g,
         sum(CASE WHEN dias = 'DIAS E HORÁRIOS' THEN 1 ELSE 0 END) OVER (ORDER BY linha_origem) AS gsec
  FROM base
), nomeado AS (
  SELECT *,
         first_value(nome_raw) OVER (PARTITION BY g ORDER BY linha_origem) AS nome,
         first_value(CASE WHEN dias = 'DIAS E HORÁRIOS' THEN nome_raw END)
           OVER (PARTITION BY gsec ORDER BY linha_origem) AS especialidade
  FROM grp
), consultas AS (
  SELECT * FROM nomeado
  WHERE dias IS DISTINCT FROM 'DIAS E HORÁRIOS' AND nome ILIKE 'CONSULTA%' AND prof IS NOT NULL
), agg AS (
  SELECT c.prof,
         string_agg(DISTINCT c.linha_origem::text, ', ' ORDER BY c.linha_origem::text) AS linhas,
         jsonb_agg(DISTINCT jsonb_build_object(
           'id', (SELECT e.id FROM public.especialidades e
                   WHERE lower(unaccent(e.nome)) = lower(unaccent(c.especialidade)) LIMIT 1),
           'nome', initcap(lower(c.especialidade))
         )) FILTER (WHERE c.especialidade IS NOT NULL) AS especialidades,
         string_agg(
           left(concat_ws(' — ', initcap(lower(c.nome)), c.dias, c.obs,
             CASE WHEN c.ate IS NOT NULL THEN 'Pode chegar até: ' || c.ate END,
             CASE WHEN NULLIF(c.idade,'-') IS NOT NULL THEN 'Idade mínima: ' || c.idade END), 300),
           E'\n' ORDER BY c.linha_origem) AS obs_publica,
         jsonb_agg(jsonb_build_object('forma','Dinheiro','valor',c.pd,
                     'condicao', initcap(lower(c.nome)),'observacao',NULL) ORDER BY c.linha_origem)
           FILTER (WHERE c.pd IS NOT NULL)
         ||
         coalesce(jsonb_agg(jsonb_build_object('forma','Cartão','valor',c.pc,
                     'condicao', initcap(lower(c.nome)),'observacao',NULL) ORDER BY c.linha_origem)
           FILTER (WHERE c.pc IS NOT NULL), '[]'::jsonb) AS formas
  FROM consultas c
  GROUP BY c.prof
)
INSERT INTO public.nina_cat_profissionais
  (clinica_id, medico_id, nome, especialidades, atende_consultorio, formas_pagamento,
   convenios, horarios, tipo_atendimento, observacao_publica, nota_interna, status)
SELECT '7570ddde-8c1c-4b55-ba72-cf12b2a6c940',
       (SELECT m.id FROM public.medicos m
         WHERE m.clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
           AND lower(unaccent(m.nome)) = lower(unaccent(a.prof)) LIMIT 1),
       a.prof,
       coalesce(a.especialidades, '[]'::jsonb),
       NULL,
       coalesce(a.formas, '[]'::jsonb),
       '[]'::jsonb,
       '[]'::jsonb,
       'Consulta',
       a.obs_publica,
       'Migrado da planilha da Nina (aba Especialidades, linha(s) ' || a.linhas || '). Dias e horários vieram como texto: estruturar nos campos de horário antes de publicar.',
       'RASCUNHO'
FROM agg a
WHERE NOT EXISTS (
  SELECT 1 FROM public.nina_cat_profissionais p
   WHERE p.clinica_id = '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
     AND lower(unaccent(p.nome)) = lower(unaccent(a.prof))
);
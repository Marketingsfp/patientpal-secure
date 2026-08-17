-- =====================================================================
-- DIAGNÓSTICO: contratos que pagam por mais pessoas do que têm vinculadas
-- =====================================================================
-- SOMENTE LEITURA. Nenhuma consulta deste arquivo grava dados.
--
-- CONTEXTO
-- O contrato (public.contratos_assinatura) não guarda um campo
-- "quantidade de pessoas do plano". A capacidade contratada é implícita:
-- ela vem da faixa de preço por vidas do convênio
-- (public.cb_convenio_faixas), casando o valor_mensal do contrato com o
-- valor_mensal da faixa. Exemplo real da clínica:
--
--   CARTÃO CONSULTA            1=110  2=155  3=180  4=205  5=230  6=255
--   CARTÃO CONSULTA + SEGUROS  1=120  2=175  3=210  4=245  5=280  6=295
--
-- Logo, um contrato de R$ 245,00 no "CARTÃO CONSULTA + SEGUROS" está
-- pagando a faixa de 4 vidas. Se ele tem 0 dependentes ativos em
-- public.contrato_dependentes, sobram 3 vagas órfãs.
--
-- O titular conta como uma vida, EXCETO quando
-- contratos_assinatura.titular_apenas_financeiro = true (o titular só
-- paga, não usa o benefício).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1) PLACAR GERAL
-- ---------------------------------------------------------------------
WITH base AS (
  SELECT
    c.id,
    (SELECT f.vidas_de
       FROM public.cb_convenio_faixas f
      WHERE f.convenio_id = c.convenio_id
        AND f.valor_mensal = c.valor_mensal
      ORDER BY f.vidas_de
      LIMIT 1) AS vidas_esperadas,
    (CASE WHEN c.titular_apenas_financeiro THEN 0 ELSE 1 END)
      + (SELECT count(*)
           FROM public.contrato_dependentes d
          WHERE d.contrato_id = c.id
            AND d.ativo
            AND d.excluido_em IS NULL) AS vidas_atuais
  FROM public.contratos_assinatura c
  WHERE c.status = 'ativo'
    AND c.convenio_id IS NOT NULL
    AND NOT c.teste
)
SELECT
  count(*)                                                              AS contratos_ativos_com_convenio,
  count(*) FILTER (WHERE vidas_esperadas IS NULL)                       AS sem_faixa_correspondente,
  count(*) FILTER (WHERE vidas_esperadas > vidas_atuais)                AS faltando_pessoas,
  count(*) FILTER (WHERE vidas_esperadas = vidas_atuais)                AS ok,
  count(*) FILTER (WHERE vidas_esperadas < vidas_atuais)                AS sobrando_pessoas,
  sum(GREATEST(coalesce(vidas_esperadas, 0) - vidas_atuais, 0))         AS total_vagas_orfas
FROM base;


-- ---------------------------------------------------------------------
-- 2) LISTA DE TRABALHO — um contrato por linha, do pior para o melhor
--    É esta lista que a recepção usa para corrigir em lote.
-- ---------------------------------------------------------------------
WITH base AS (
  SELECT
    c.id,
    c.numero,
    c.paciente_id,
    c.paciente_nome,
    c.valor_mensal,
    c.clinica_id,
    cv.nome AS convenio,
    (SELECT f.vidas_de
       FROM public.cb_convenio_faixas f
      WHERE f.convenio_id = c.convenio_id
        AND f.valor_mensal = c.valor_mensal
      ORDER BY f.vidas_de
      LIMIT 1) AS vidas_esperadas,
    (CASE WHEN c.titular_apenas_financeiro THEN 0 ELSE 1 END)
      + (SELECT count(*)
           FROM public.contrato_dependentes d
          WHERE d.contrato_id = c.id
            AND d.ativo
            AND d.excluido_em IS NULL) AS vidas_atuais
  FROM public.contratos_assinatura c
  LEFT JOIN public.cb_convenios cv ON cv.id = c.convenio_id
  WHERE c.status = 'ativo'
    AND c.convenio_id IS NOT NULL
    AND NOT c.teste
)
SELECT
  b.numero                         AS contrato,
  b.paciente_nome                  AS titular,
  b.convenio,
  b.valor_mensal,
  b.vidas_esperadas,
  b.vidas_atuais,
  b.vidas_esperadas - b.vidas_atuais AS vagas_orfas,
  p.cpf,
  p.telefone,
  p.logradouro,
  p.numero                         AS num_casa,
  p.bairro,
  -- quantos pacientes ativos da mesma clínica dividem o telefone do titular
  (SELECT count(*)
     FROM public.pacientes q
    WHERE q.clinica_id = b.clinica_id
      AND q.ativo
      AND q.id <> p.id
      AND length(regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g')) >= 10
      AND regexp_replace(coalesce(q.telefone, ''),  '\D', '', 'g')
        = regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g')
  ) AS candidatos_mesmo_telefone
FROM base b
JOIN public.pacientes p ON p.id = b.paciente_id
WHERE b.vidas_esperadas IS NOT NULL
  AND b.vidas_esperadas > b.vidas_atuais
ORDER BY vagas_orfas DESC, b.paciente_nome;


-- ---------------------------------------------------------------------
-- 3) CANDIDATOS A DEPENDENTE, por telefone compartilhado
--    SUGESTÃO, não verdade. Serve para a recepção conferir, não para
--    vincular automaticamente. Ver docs de análise: a taxa de acerto
--    não é auditável, porque a planilha de rateios original não está
--    no banco.
-- ---------------------------------------------------------------------
WITH base AS (
  SELECT
    c.id, c.numero, c.paciente_id, c.paciente_nome, c.clinica_id,
    (SELECT f.vidas_de
       FROM public.cb_convenio_faixas f
      WHERE f.convenio_id = c.convenio_id
        AND f.valor_mensal = c.valor_mensal
      ORDER BY f.vidas_de LIMIT 1)
    - ((CASE WHEN c.titular_apenas_financeiro THEN 0 ELSE 1 END)
       + (SELECT count(*) FROM public.contrato_dependentes d
           WHERE d.contrato_id = c.id AND d.ativo AND d.excluido_em IS NULL)) AS vagas_orfas
  FROM public.contratos_assinatura c
  WHERE c.status = 'ativo' AND c.convenio_id IS NOT NULL AND NOT c.teste
)
SELECT
  b.numero        AS contrato,
  b.paciente_nome AS titular,
  b.vagas_orfas,
  q.id            AS candidato_id,
  q.nome          AS candidato_nome,
  q.data_nascimento,
  q.telefone
FROM base b
JOIN public.pacientes p ON p.id = b.paciente_id
JOIN public.pacientes q
  ON q.clinica_id = b.clinica_id
 AND q.ativo
 AND q.id <> p.id
 AND regexp_replace(coalesce(q.telefone, ''), '\D', '', 'g')
   = regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g')
WHERE b.vagas_orfas > 0
  AND length(regexp_replace(coalesce(p.telefone, ''), '\D', '', 'g')) >= 10
  -- não sugerir quem já é dependente de qualquer contrato ativo
  AND NOT EXISTS (
    SELECT 1
      FROM public.contrato_dependentes d
      JOIN public.contratos_assinatura c2 ON c2.id = d.contrato_id
     WHERE d.paciente_id = q.id AND d.ativo AND c2.status = 'ativo')
ORDER BY b.paciente_nome, q.nome;


-- ---------------------------------------------------------------------
-- 4) CONTRATOS SEM FAIXA CORRESPONDENTE
--    Pagam um valor que não bate com nenhuma faixa do convênio, então
--    não dá para saber a capacidade contratada. Precisam de decisão
--    humana antes de qualquer coisa.
-- ---------------------------------------------------------------------
SELECT
  c.numero        AS contrato,
  c.paciente_nome AS titular,
  cv.nome         AS convenio,
  c.valor_mensal,
  (SELECT string_agg(f.vidas_de || ' vida(s) = ' || f.valor_mensal, ' | ' ORDER BY f.vidas_de)
     FROM public.cb_convenio_faixas f
    WHERE f.convenio_id = c.convenio_id) AS faixas_do_convenio,
  (SELECT count(*) FROM public.contrato_dependentes d
    WHERE d.contrato_id = c.id AND d.ativo AND d.excluido_em IS NULL) AS deps_ativos
FROM public.contratos_assinatura c
LEFT JOIN public.cb_convenios cv ON cv.id = c.convenio_id
WHERE c.status = 'ativo'
  AND c.convenio_id IS NOT NULL
  AND NOT c.teste
  AND NOT EXISTS (
    SELECT 1 FROM public.cb_convenio_faixas f
     WHERE f.convenio_id = c.convenio_id AND f.valor_mensal = c.valor_mensal)
ORDER BY c.valor_mensal DESC;


-- ---------------------------------------------------------------------
-- 5) CONTRATOS COM PESSOAS A MAIS (cobrança abaixo do devido)
-- ---------------------------------------------------------------------
WITH base AS (
  SELECT c.id, c.numero, c.paciente_nome, c.valor_mensal, c.convenio_id,
    (SELECT f.vidas_de FROM public.cb_convenio_faixas f
      WHERE f.convenio_id = c.convenio_id AND f.valor_mensal = c.valor_mensal
      ORDER BY f.vidas_de LIMIT 1) AS vidas_esperadas,
    (CASE WHEN c.titular_apenas_financeiro THEN 0 ELSE 1 END)
      + (SELECT count(*) FROM public.contrato_dependentes d
          WHERE d.contrato_id = c.id AND d.ativo AND d.excluido_em IS NULL) AS vidas_atuais
  FROM public.contratos_assinatura c
  WHERE c.status = 'ativo' AND c.convenio_id IS NOT NULL AND NOT c.teste
)
SELECT b.numero AS contrato, b.paciente_nome AS titular, b.valor_mensal,
       b.vidas_esperadas, b.vidas_atuais,
       (SELECT f.valor_mensal FROM public.cb_convenio_faixas f
         WHERE f.convenio_id = b.convenio_id
           AND b.vidas_atuais >= f.vidas_de
           AND (f.vidas_ate IS NULL OR b.vidas_atuais <= f.vidas_ate)
         LIMIT 1) AS valor_correto_pela_faixa
FROM base b
WHERE b.vidas_esperadas IS NOT NULL
  AND b.vidas_esperadas < b.vidas_atuais
ORDER BY b.vidas_atuais - b.vidas_esperadas DESC;

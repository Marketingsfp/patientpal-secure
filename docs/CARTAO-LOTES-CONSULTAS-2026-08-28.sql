-- ===================================================================
-- Cartão Benefícios — consultas dos 3 lotes a regularizar
-- Gerado em 28/08/2026.
--
-- TODAS AS CONSULTAS ABAIXO SÃO SOMENTE LEITURA (SELECT).
-- Nenhuma delas altera nada. Podem ser rodadas à vontade no SQL editor.
--
-- Elas são a definição EXATA de cada lote. Os arquivos .csv entregues
-- junto são a foto do dia 28/08 — se quiser reconferir depois (ou ver
-- quanto já foi regularizado), rode a consulta correspondente de novo.
-- ===================================================================


-- -------------------------------------------------------------------
-- LOTE A — 213 contratos da planilha de rateios MJ (11/06/2026)
--
-- Como se identificam: contratos ATIVOS cuja mensalidade é menor que
-- R$ 20,00 — porque a importação gravou a FATIA da pessoa no rateio em
-- vez do valor do plano. Todos trazem a observação "IMPORTADO DA
-- PLANILHA DE RATEIOS MJ".
--
-- Por que importa: nenhum deles pagou uma única parcela, e a parcela
-- mais recente venceu em julho/2026. Passando de 5 dias de atraso o
-- cartão não vale, então essas pessoas são cobradas como Particular no
-- balcão. A coluna `tem_outro_cartao_valido` mostra quem tem saída por
-- outro cartão (só 6 das 213 têm).
-- -------------------------------------------------------------------
SELECT
  c.numero                                            AS contrato,
  c.paciente_nome                                     AS paciente,
  COALESCE(NULLIF(btrim(p.codigo_prontuario_anterior), ''), p.codigo_prontuario) AS prontuario,
  p.cpf,
  c.valor_mensal,
  c.data_inicio                                       AS inicio,
  (SELECT min(m.vencimento) FROM contrato_mensalidades m
    WHERE m.contrato_id = c.id AND m.numero_parcela > 0
      AND m.status NOT IN ('pago', 'cancelado'))      AS proximo_vencimento,
  (SELECT count(*) FROM contrato_mensalidades m
    WHERE m.contrato_id = c.id AND m.numero_parcela > 0
      AND m.status NOT IN ('pago', 'cancelado')
      AND m.vencimento < CURRENT_DATE)                AS parcelas_vencidas,
  CASE WHEN EXISTS (
    SELECT 1 FROM contrato_dependentes d
      JOIN contratos_assinatura o ON o.id = d.contrato_id
     WHERE d.paciente_id = c.paciente_id AND d.ativo
       AND o.status = 'ativo' AND o.convenio_id IS NOT NULL
       AND o.data_inicio > c.data_inicio
  ) THEN 'SIM' ELSE 'NAO' END                         AS tem_outro_cartao_valido
FROM contratos_assinatura c
LEFT JOIN pacientes p ON p.id = c.paciente_id
WHERE c.status = 'ativo'
  AND c.valor_mensal > 0
  AND c.valor_mensal < 20
ORDER BY c.paciente_nome;


-- -------------------------------------------------------------------
-- LOTE B — 505 pessoas em contrato ativo SEM convênio vinculado
--          (245 titulares + 260 dependentes)
--
-- Como se identificam: contrato ATIVO com `convenio_id` nulo. Sem
-- convênio o sistema não encontra tabela de preço nenhuma e o paciente
-- é cobrado como Particular, mesmo tendo cartão.
--
-- Este lote é o mesmo que a aba "Sem convênio" da tela já mostra e já
-- sabe corrigir (ela só preenche o convênio; não gera mensalidade, não
-- muda valor, não cancela nada).
--
-- B.1 — os titulares
-- -------------------------------------------------------------------
SELECT
  c.numero        AS contrato,
  c.paciente_nome AS titular,
  COALESCE(NULLIF(btrim(p.codigo_prontuario_anterior), ''), p.codigo_prontuario) AS prontuario,
  c.valor_mensal,
  c.data_inicio   AS inicio,
  (SELECT count(*) FROM contrato_dependentes d
    WHERE d.contrato_id = c.id AND d.ativo)  AS dependentes_ativos
FROM contratos_assinatura c
LEFT JOIN pacientes p ON p.id = c.paciente_id
WHERE c.status = 'ativo' AND c.convenio_id IS NULL
ORDER BY c.paciente_nome;

-- B.2 — os dependentes pendurados nesses contratos
SELECT
  c.numero        AS contrato,
  c.paciente_nome AS titular,
  d.paciente_nome AS dependente,
  d.parentesco,
  COALESCE(NULLIF(btrim(p.codigo_prontuario_anterior), ''), p.codigo_prontuario) AS prontuario_dependente
FROM contrato_dependentes d
JOIN contratos_assinatura c ON c.id = d.contrato_id
LEFT JOIN pacientes p ON p.id = d.paciente_id
WHERE d.ativo AND c.status = 'ativo' AND c.convenio_id IS NULL
ORDER BY c.paciente_nome, d.paciente_nome;


-- -------------------------------------------------------------------
-- LOTE C — 164 contratos da importação de 18/08/2026 sem cobrança
--
-- Como se identificam: contratos ATIVOS criados em 18/08/2026 que não
-- têm NENHUMA linha em contrato_mensalidades.
--
-- Por que aconteceu: a tela "Importar planilha" não gera cobrança de
-- propósito (o código passa a lista de mensalidades vazia), porque a
-- ideia era lançar as parcelas depois, com os valores reais. O que
-- ficou pendente foi esse "depois".
--
-- Efeito prático: como não existe parcela, não existe parcela vencida —
-- o sistema entende que está tudo em dia e libera o desconto do cartão
-- integralmente. Ninguém está sendo cobrado e ninguém aparece na lista
-- de inadimplentes.
-- -------------------------------------------------------------------
SELECT
  c.numero        AS contrato,
  c.paciente_nome AS paciente,
  COALESCE(NULLIF(btrim(p.codigo_prontuario_anterior), ''), p.codigo_prontuario) AS prontuario,
  cv.nome         AS convenio,
  c.valor_mensal,
  c.data_inicio   AS inicio,
  c.dia_vencimento,
  c.num_parcelas  AS parcelas_previstas,
  (SELECT count(*) FROM contrato_dependentes d
    WHERE d.contrato_id = c.id AND d.ativo)  AS dependentes_ativos
FROM contratos_assinatura c
LEFT JOIN pacientes p  ON p.id  = c.paciente_id
LEFT JOIN cb_convenios cv ON cv.id = c.convenio_id
WHERE c.status = 'ativo'
  AND c.created_at::date = DATE '2026-08-18'
  AND NOT EXISTS (SELECT 1 FROM contrato_mensalidades m WHERE m.contrato_id = c.id)
ORDER BY c.paciente_nome;


-- -------------------------------------------------------------------
-- RESUMO — roda os três de uma vez e devolve só a contagem.
-- Serve para acompanhar quanto já foi regularizado ao longo do tempo.
-- -------------------------------------------------------------------
SELECT 'LOTE A - rateio MJ (mensalidade < R$ 20)' AS lote,
       count(*) AS pessoas
  FROM contratos_assinatura
 WHERE status = 'ativo' AND valor_mensal > 0 AND valor_mensal < 20
UNION ALL
SELECT 'LOTE B - titulares sem convenio',
       count(*)
  FROM contratos_assinatura
 WHERE status = 'ativo' AND convenio_id IS NULL
UNION ALL
SELECT 'LOTE B - dependentes sem convenio',
       count(*)
  FROM contrato_dependentes d
  JOIN contratos_assinatura c ON c.id = d.contrato_id
 WHERE d.ativo AND c.status = 'ativo' AND c.convenio_id IS NULL
UNION ALL
SELECT 'LOTE C - importacao 18/08 sem cobranca',
       count(*)
  FROM contratos_assinatura c
 WHERE c.status = 'ativo'
   AND c.created_at::date = DATE '2026-08-18'
   AND NOT EXISTS (SELECT 1 FROM contrato_mensalidades m WHERE m.contrato_id = c.id);

-- =====================================================================
-- Consulta a R$ 120,00 (dinheiro) / R$ 145,00 (Pix, débito e crédito)
-- HOMOLOGAÇÃO — 02/09/2026 · POLICLINICA MENINO JESUS
--
-- RESULTADO DA CONFERÊNCIA: NÃO HÁ NADA PARA RODAR.
--
-- A tabela de preços pedida JÁ ESTÁ valendo em produção. Foi aplicada em
-- 01/09/2026 às 09:36 (arquivos CONSULTA-CLINICO-GERAL-120-145-2026-09-01.sql
-- e CONSULTA-TODAS-ESPECIALIDADES-120-145-2026-09-01.sql), junto com o
-- reajuste de repasse médico de R$ 55,00 para R$ 60,00
-- (REPASSE-CONSULTA-120-DINHEIRO-60-2026-09-01.sql).
--
-- Este arquivo é só de LEITURA. Serve para a recepção conferir na tela.
-- Nenhum bloco aqui grava coisa alguma no banco.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOCO 1 — Os dois cadastros que atendem a consulta particular
-- Esperado: os dois em 120,00 / 145,00.
-- ---------------------------------------------------------------------
SELECT p.nome,
       p.valor_dinheiro, p.valor_dinheiro_pix, p.valor_padrao,
       p.valor_pix, p.valor_cartao, p.valor_cartao_credito, p.valor_cartao_debito,
       p.updated_at
FROM procedimentos p
WHERE p.id IN (
  'edb339e7-3f35-4daa-9886-1bfe56a48205',  -- CONSULTA (todas as especialidades)
  'aedfe1a8-bce7-4591-bf7b-e895103d8549'   -- CONSULTA CLINICA MEDICA (clínica médica)
);


-- ---------------------------------------------------------------------
-- BLOCO 2 — O que os atendimentos de 02/09 em diante vão cobrar
-- Esperado: CONSULTA e CONSULTA CLINICA MEDICA saindo 120,00 / 145,00.
-- CONSULTA 2 aparece em 130,00 / 155,00 — é outro serviço, ver BLOCO 4.
-- ---------------------------------------------------------------------
SELECT upper(coalesce(a.procedimento,'(vazio)')) AS servico,
       count(*) AS agendamentos,
       count(DISTINCT a.medico_id) AS medicos,
       max(p.valor_dinheiro)       AS preco_dinheiro,
       max(p.valor_cartao_credito) AS preco_cartao
FROM agendamentos a
LEFT JOIN LATERAL (
  SELECT pr.* FROM procedimentos pr
   WHERE pr.clinica_id = a.clinica_id
     AND upper(pr.nome) = upper(a.procedimento)
     AND pr.ativo
   ORDER BY pr.updated_at DESC, pr.id ASC
   LIMIT 1
) p ON true
WHERE a.inicio >= DATE '2026-09-02'
  AND a.status::text NOT LIKE 'cancel%'
  AND upper(coalesce(a.procedimento,'')) LIKE 'CONSULTA%'
GROUP BY 1
ORDER BY 2 DESC;


-- ---------------------------------------------------------------------
-- BLOCO 3 — Prova no dinheiro de verdade: o que já entrou no caixa
-- Esperado: consultas de 01/09 e 02/09 recebidas a 120,00 (dinheiro) e
-- 145,00 (Pix/débito/crédito). Valores de 10,00 e 60,00 são Cartão
-- Benefícios e convênio, não são a tabela particular.
-- ---------------------------------------------------------------------
SELECT date(l.created_at) AS dia, a.procedimento, l.forma_pagamento,
       l.valor, count(*) AS qtd
FROM fin_lancamentos l
JOIN agendamentos a ON a.id = l.agendamento_id
WHERE l.tipo = 'receita'
  AND l.created_at >= DATE '2026-09-01'
  AND upper(coalesce(a.procedimento,'')) LIKE 'CONSULTA%'
GROUP BY 1,2,3,4
ORDER BY 1 DESC, 5 DESC;


-- ---------------------------------------------------------------------
-- BLOCO 4 — O único serviço de consulta fora da tabela nova
--
-- CONSULTA 2 = R$ 130,00 dinheiro / R$ 155,00 cartão, do Dr. CARLOS
-- EDUARDO GONCALVES MONTEIRO (NEUROLOGIA), com 842 atendimentos marcados
-- de 02/09 em diante. Não é resto da tabela antiga: é um preço próprio,
-- MAIS ALTO que a tabela nova. Só deve mudar se o dono decidir.
-- ---------------------------------------------------------------------
SELECT m.nome AS medico, e.nome AS especialidade, count(*) AS agendamentos
FROM agendamentos a
JOIN medicos m ON m.id = a.medico_id
LEFT JOIN especialidades e ON e.id = m.especialidade_id
WHERE a.inicio >= DATE '2026-09-02'
  AND a.status::text NOT LIKE 'cancel%'
  AND upper(coalesce(a.procedimento,'')) LIKE 'CONSULTA 2%'
GROUP BY 1,2 ORDER BY 3 DESC;


-- =====================================================================
-- ATENÇÃO — O QUE **NÃO** SE DEVE RODAR
--
-- Um UPDATE em massa em "tudo que se chama CONSULTA" (categoria Consulta)
-- destruiria preços legítimos. Hoje, ativos no cadastro:
--
--   CONSULTA 2 ......................... 130,00 / 155,00  (neurologia)
--   CONSULTA NOTURNA ................... 130,00 / 155,00
--   CONSULTA DIFERENCIADA .............. 160,00 / 190,00
--   CONSULTA INTEGRATIVA ............... 160,00 / 160,00
--   CONSULTA INTEGRATIVA C/ PREVENTIVO . 212,00 / 220,00
--   CONSULTA TERAPEUTICA 1 e 2 ......... 290,00 / 290,00
--   CONSULTA DE RETORNO ................  45,00 /  49,50
--   CONSULTA DE EMERGENCIA (RECEITA) ...  50,00 /  55,00
--   CONSULTA DR FELIPE CESAR (REUMATO) . 160,00 / 190,00
--
-- Nivelar todos em 120/145 baixaria o preço de nove serviços diferentes,
-- inclusive os 842 atendimentos de neurologia já marcados.
-- Por isso o reajuste de 01/09 alterou UMA linha de cadastro, não uma
-- categoria inteira.
-- =====================================================================

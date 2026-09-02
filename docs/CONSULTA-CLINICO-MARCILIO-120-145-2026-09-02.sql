-- =====================================================================
-- CONSULTA CLINICO passa de R$ 110/130 para R$ 120,00 / R$ 145,00
-- Dr. MARCILIO QUINTAO DE SOUZA (GINECOLOGIA)
-- Preparado em 02/09/2026 - POLICLINICA MENINO JESUS
-- Numeros conferidos contra os dados de producao nesta mesma data.
--
-- =====================================================================
-- EXECUTADO EM 02/09/2026 as 07:39, com autorizacao do dono. Este arquivo
-- passa a ser tambem o registro do que foi rodado.
--
--   BLOCO 2 (preco) .......... 1 linha alterada. CONSULTA CLINICO saiu de
--            R$ 110,00 / R$ 130,00 para R$ 120,00 / R$ 145,00 nas sete
--            colunas de valor.
--   BLOCO 4 (servico padrao) . 1 linha alterada, tambem autorizada pelo
--            dono no mesmo pedido. O servico padrao do Dr. Marcilio, que
--            estava vazio, passou a ser CONSULTA (120/145). Com isso o
--            risco dos R$ 160,00 descrito no BLOCO 4 esta fechado.
--   REPASSE .................. nenhuma linha tocada, como previsto. O
--            Repasse Padrao dele continua R$ 60,00.
--
--   CONFERENCIA DEPOIS: os recebimentos JA FEITOS nao mudaram. Os
--            R$ 110,00 e R$ 130,00 de 24/08 e 31/08 continuam gravados
--            exatamente como estavam.
-- =====================================================================
--
-- POR QUE ESTE CADASTRO FICOU PARA TRAS
--   O reajuste de 01/09 mirou os cadastros CONSULTA e CONSULTA CLINICA
--   MEDICA. Existe um TERCEIRO cadastro, de nome parecido, CONSULTA
--   CLINICO (id 3b4a2f82...), que nao entrou naquele script e continuava
--   em R$ 110,00 / R$ 130,00 desde 19/08/2026.
--
-- QUEM USA
--   So o Dr. Marcilio. Conferido no banco:
--     - nenhum medico tinha CONSULTA CLINICO como servico padrao;
--     - de 01/08 ate 02/09, 12 atendimentos com paciente usam esse
--       cadastro, todos dele, gravados como "CONSULTA CLINICO
--       (GINECOLOGIA)".
--   Ou seja: este era o ultimo resto da tabela antiga ainda em uso, e a
--   correcao nao afeta nenhum outro medico.
--
-- A PROVA DE QUE ERA ISSO
--   Em 31/08 os pacientes dele foram recebidos a R$ 110,00 no dinheiro e
--   R$ 130,00 no debito, exatamente o preco deste cadastro.
--
-- REPASSE: NAO PRECISOU MEXER
--   Na grade do Dr. Marcilio a linha CONSULTA CLINICO esta EM BRANCO, e
--   celula em branco herda o Repasse Padrao dele, que ja e R$ 60,00
--   (atualizado em 01/09). Depois desta mudanca ele continua recebendo
--   R$ 60,00. Nenhuma linha de repasse foi alterada.
-- =====================================================================


-- ---------------------------------------------------------------------
-- BLOCO 1 - CONFERENCIA ANTES (so leitura)
-- Resultado obtido em 02/09 as 07:38: CONSULTA CLINICO com 110,00 no
-- dinheiro e 130,00 no cartao, atualizado pela ultima vez em 19/08/2026.
-- ---------------------------------------------------------------------
SELECT nome, ativo,
       valor_dinheiro, valor_dinheiro_pix, valor_padrao,
       valor_pix, valor_cartao, valor_cartao_credito, valor_cartao_debito,
       updated_at
FROM procedimentos
WHERE id = '3b4a2f82-11ed-4265-ab72-21c84495add8';


-- ---------------------------------------------------------------------
-- BLOCO 2 - ESCRITA (1 linha) - EXECUTADA
--
-- As sete colunas sao gravadas juntas porque o sistema monta o preco do
-- dinheiro com o primeiro valor maior que zero entre valor_dinheiro,
-- valor_dinheiro_pix e valor_padrao; e o preco de Pix/debito/credito com
-- o primeiro maior que zero entre valor_cartao_credito,
-- valor_cartao_debito, valor_cartao e valor_padrao. Deixar uma delas para
-- tras faz o preco velho reaparecer em um dos caminhos de cobranca.
--
-- Resultado: 1 linha atualizada.
-- ---------------------------------------------------------------------
UPDATE procedimentos
   SET valor_dinheiro       = 120.00,
       valor_dinheiro_pix   = 120,
       valor_padrao         = 120,
       valor_pix            = 145.00,
       valor_cartao         = 145,
       valor_cartao_credito = 145.00,
       valor_cartao_debito  = 145.00,
       updated_at           = now()
 WHERE id = '3b4a2f82-11ed-4265-ab72-21c84495add8'
   AND nome = 'CONSULTA CLINICO';


-- ---------------------------------------------------------------------
-- BLOCO 3 - CONFERENCIA DEPOIS (so leitura)
-- Resultado obtido: as sete colunas em 120,00 / 145,00, com updated_at
-- 02/09/2026 07:39.
-- ---------------------------------------------------------------------
SELECT nome, valor_dinheiro, valor_dinheiro_pix, valor_padrao,
       valor_pix, valor_cartao, valor_cartao_credito, valor_cartao_debito,
       updated_at
FROM procedimentos
WHERE id = '3b4a2f82-11ed-4265-ab72-21c84495add8';


-- =====================================================================
-- BLOCO 4 - SERVICO PADRAO DO MEDICO
-- Autorizado pelo dono e EXECUTADO em 02/09/2026.
--
--   O Dr. Marcilio estava SEM servico padrao na ficha. Por isso os
--   horarios livres da agenda dele ficam gravados so como "GINECOLOGIA",
--   que nao existe no cadastro de servicos. Se uma recepcionista marcasse
--   um paciente num desses horarios e nao trocasse o servico na mao, o
--   sistema procurava por aproximacao, achava "GINECOLOGIA INTEGRATIVA" e
--   oferecia R$ 160,00 - nem 110/130, nem 120/145.
--
--   Isso nunca chegou a acontecer (nao havia nenhum recebimento gravado
--   como "GINECOLOGIA"), porque na pratica a recepcao troca o servico ao
--   marcar. O padrao abaixo fecha esse risco de vez.
--
--   Resultado: 1 linha atualizada. Servico padrao agora = CONSULTA
--   (120/145).
-- =====================================================================
UPDATE medicos
   SET procedimento_padrao_id = 'edb339e7-3f35-4daa-9886-1bfe56a48205',
       procedimento_padrao_em_branco = false
 WHERE id = 'de89ddc5-15ae-4dae-863e-b00562dc8b1d'
   AND procedimento_padrao_id IS NULL;


-- ---------------------------------------------------------------------
-- BLOCO 5 - CONFERENCIA FINAL (so leitura)
-- Resultado obtido: servico padrao CONSULTA a 120,00 / 145,00; cadastro
-- CONSULTA CLINICO a 120,00 / 145,00; Repasse Padrao R$ 60,00.
-- ---------------------------------------------------------------------
SELECT m.nome AS medico, e.nome AS especialidade,
       pp.nome AS servico_padrao_agora,
       pp.valor_dinheiro AS padrao_dinheiro,
       pp.valor_cartao_credito AS padrao_cartao,
       cc.valor_dinheiro AS consulta_clinico_dinheiro,
       cc.valor_cartao_credito AS consulta_clinico_cartao,
       m.valor_repasse_padrao AS repasse_padrao
FROM medicos m
LEFT JOIN especialidades e ON e.id = m.especialidade_id
LEFT JOIN procedimentos pp ON pp.id = m.procedimento_padrao_id
CROSS JOIN procedimentos cc
WHERE m.id = 'de89ddc5-15ae-4dae-863e-b00562dc8b1d'
  AND cc.id = '3b4a2f82-11ed-4265-ab72-21c84495add8';


-- =====================================================================
-- O PASSADO FICOU INTOCADO
--   Atendimento JA PAGO nao muda: o valor recebido fica gravado na linha
--   do financeiro (fin_lancamentos.valor) e nenhuma mudanca de cadastro
--   reescreve isso. Conferido depois da execucao: os recebimentos de
--   R$ 110,00 e R$ 130,00 de 24/08 e 31/08 continuam como estavam, no
--   caixa e nos relatorios.
--
--   PENDENCIA CONHECIDA: existe 1 atendimento de agosto ainda NAO pago
--   com este servico. Se ele for quitado agora, sera cobrado R$ 120,00 /
--   R$ 145,00, porque o preco e lido no momento do pagamento. Se a
--   clinica quiser honrar R$ 110,00 nele, o valor precisa ser digitado a
--   mao na tela de cobranca.
-- =====================================================================


-- =====================================================================
-- COMO DESFAZER (so rodar se precisar voltar atras)
-- =====================================================================
-- UPDATE procedimentos
--    SET valor_dinheiro       = 110.00,
--        valor_dinheiro_pix   = 110,
--        valor_padrao         = 110,
--        valor_pix            = 130.00,
--        valor_cartao         = 130,
--        valor_cartao_credito = 130.00,
--        valor_cartao_debito  = 130.00,
--        updated_at           = now()
--  WHERE id = '3b4a2f82-11ed-4265-ab72-21c84495add8';
--
-- UPDATE medicos
--    SET procedimento_padrao_id = NULL,
--        procedimento_padrao_em_branco = true
--  WHERE id = 'de89ddc5-15ae-4dae-863e-b00562dc8b1d';

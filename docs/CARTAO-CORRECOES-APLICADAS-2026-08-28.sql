-- ===================================================================
-- Cartão Benefícios — correções JÁ APLICADAS no banco em 28/08/2026
--
-- ESTE ARQUIVO É REGISTRO, NÃO É PARA RODAR DE NOVO.
-- Os dois comandos abaixo já foram executados e conferidos. Estão aqui
-- para ficar rastreável o que foi mexido, e como desfazer se precisar.
--
-- Autorizados por João Pedro em 28/08/2026.
-- ===================================================================


-- -------------------------------------------------------------------
-- 1) Convênio cadastrado com nome de paciente
--
-- Alguém digitou o nome de uma paciente no campo do NOME do convênio,
-- criando um convênio ativo, sem nenhuma regra de preço, que aparecia
-- na lista na hora de vender um cartão. Se fosse escolhido por engano,
-- o paciente ficaria com um cartão que não dá desconto nenhum.
--
-- Foi INATIVADO, não excluído — o registro fica no histórico e dá para
-- reverter. Antes de aplicar foi conferido que ele não tinha NENHUM
-- contrato ligado (de qualquer status) e NENHUMA regra cadastrada.
-- -------------------------------------------------------------------
UPDATE cb_convenios
   SET ativo = false
 WHERE id = '9f06ee80-5a1c-4305-b59b-585b55f73303'
   AND nome = 'karina cristina santana freires';
-- Resultado: 1 linha. Convênios ativos passaram de 5 para 4.
--
-- Para desfazer:
--   UPDATE cb_convenios SET ativo = true
--    WHERE id = '9f06ee80-5a1c-4305-b59b-585b55f73303';


-- -------------------------------------------------------------------
-- 2) Duas parcelas com o status escrito no feminino
--
-- Contrato 20260642 (ISABEL LIMA LEITE), cancelado em 20/07/2026.
-- As parcelas 11 e 12 ficaram com status 'cancelada' em vez de
-- 'cancelado'. O sistema inteiro compara com 'cancelado', então essas
-- duas parcelas de R$ 155,00 (R$ 310,00 no total) continuavam contando
-- como EM ABERTO em todas as telas, num contrato já cancelado.
--
-- Nenhuma das duas tinha pagamento nem lançamento financeiro ligado —
-- a correção é só de grafia, não mexe em dinheiro.
-- -------------------------------------------------------------------
UPDATE contrato_mensalidades
   SET status = 'cancelado'
 WHERE id IN (
         '66655669-6bce-401f-9ab8-170093bcf197',  -- parcela 11, venc. 25/07/2026
         '7973d376-8987-4593-a795-2ea0aaa00369'   -- parcela 12, venc. 25/08/2026
       )
   AND status = 'cancelada';
-- Resultado: 2 linhas. Parcelas com status 'cancelada' passaram de 2 para 0.
--
-- Para desfazer:
--   UPDATE contrato_mensalidades SET status = 'cancelada'
--    WHERE id IN ('66655669-6bce-401f-9ab8-170093bcf197',
--                 '7973d376-8987-4593-a795-2ea0aaa00369');


-- -------------------------------------------------------------------
-- Conferência rodada depois das duas correções (somente leitura)
-- -------------------------------------------------------------------
SELECT 'convenios ativos com nome de paciente' AS checagem, count(*)::text AS resultado
  FROM cb_convenios WHERE ativo AND nome ILIKE '%karina%'          -- deu 0
UNION ALL
SELECT 'parcelas com status cancelada', count(*)::text
  FROM contrato_mensalidades WHERE status = 'cancelada'            -- deu 0
UNION ALL
SELECT 'parcelas com status cancelado', count(*)::text
  FROM contrato_mensalidades WHERE status = 'cancelado'            -- deu 1462 (era 1460)
UNION ALL
SELECT 'convenios ativos no total', count(*)::text
  FROM cb_convenios WHERE ativo;                                   -- deu 4 (era 5)


-- -------------------------------------------------------------------
-- NÃO FOI MEXIDO (aguardando alinhamento com diretoria/recepção):
--   - Lote A: 213 contratos do rateio MJ
--   - Lote B: 505 pessoas sem convênio vinculado
--   - Lote C: 164 contratos da importação de 18/08 sem cobrança
--   - As ~105 parcelas marcadas como pagas com data no futuro
--   - Os 79 contratos ativos já passados da data de término
--   - Os 6 casos de cobrança dupla de 27/08
-- Ver docs/CARTAO-LOTES-CONSULTAS-2026-08-28.sql e a auditoria do dia.
-- -------------------------------------------------------------------

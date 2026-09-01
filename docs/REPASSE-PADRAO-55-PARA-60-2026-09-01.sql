-- =====================================================================
-- REPASSE PADRAO DO MEDICO (cadastro geral): R$ 55,00  ->  R$ 60,00
-- Campo `medicos.valor_repasse_padrao` - o que aparece na aba "Repasse"
-- do perfil do profissional, no quadro REPASSE PADRAO.
--
-- Preparado em 01/09/2026 - POLICLINICA MENINO JESUS
-- Numeros conferidos contra os dados de producao nesta mesma data.
--
-- =====================================================================
-- EXECUTADO EM 01/09/2026, com autorizacao do dono. Este arquivo passa a
-- ser tambem o registro do que foi rodado.
--
--   ETAPA 1 (congelamento do passado) ... 2.885 atendimentos congelados,
--            dos quais 1.389 ja pagos aos medicos. Nenhum ficou de fora.
--            2.683 congelados em R$ 55,00 e 202 congelados no valor pago
--            (menores que R$ 55,00). Total travado: R$ 156.200,00.
--   ETAPA 2 (cadastro) ................. 53 medicos passaram de R$ 55,00
--            para R$ 60,00. Somados aos 3 que ja estavam, sao 56 medicos
--            em R$ 60,00 (45 ativos). Nenhum medico ficou em R$ 55,00.
--            Copia de seguranca com os 155 medicos do cadastro.
--   ETAPA 3 (conferencia) .............. 0 repasses ja pagos mudaram de
--            valor; 0 congelados viraram R$ 60,00; 0 sobreposicao com a
--            trava da mudanca anterior, que segue intacta (1.951 em
--            R$ 55,00).
--
--   NAO FORAM TOCADOS: os medicos com repasse padrao por percentual
--   (70%, 50%, 40%, 30%...), os 3 em R$ 0,00 e os valores negociados caso
--   a caso (R$ 175,00, R$ 145,00, R$ 77,00, R$ 72,80, R$ 18,00, R$ 10,00).
--   Tambem ficaram de fora da trava 386 atendimentos antigos que usam o
--   repasse de cartao beneficio do medico, e nao o padrao.
-- =====================================================================
--
-- COMO RODAR
--   Rode UM BLOCO DE CADA VEZ, na ordem, no SQL editor do Lovable.
--   As ETAPAS 0 e 3 sao so leitura (nao gravam nada).
--   As ETAPAS 1 e 2 gravam. Cada uma abre e fecha sozinha (BEGIN/COMMIT).
--   Se qualquer etapa der erro, PARE e nao rode a seguinte.
-- =====================================================================


-- =====================================================================
-- O QUE FOI ENCONTRADO NO BANCO (por que o script e assim)
-- =====================================================================
--
-- 1) QUEM ESTA EM R$ 55,00
--    53 medicos tem o repasse padrao gravado como valor fixo de R$ 55,00
--    (42 ativos e 11 inativos). Sao esses que passam para R$ 60,00.
--
-- 2) O REPASSE PADRAO NAO E SO DA CONSULTA
--    Ele e o ultimo degrau da heranca: vale para QUALQUER servico do medico
--    que nao tenha linha propria nem linha de categoria na grade de Repasse
--    Individual. Exame, procedimento e consulta usam o mesmo padrao.
--    Isso e o que o proprio sistema diz na tela: "Usado quando o servico
--    abaixo nao tem tipo/valor preenchido".
--
-- 3) O MESMO RISCO RETROATIVO DA MUDANCA ANTERIOR
--    O repasse continua sendo calculado na hora, nao gravado. Existem
--    2.885 atendimentos ANTERIORES a 01/09/2026 que caem no repasse
--    padrao, e 1.389 deles JA FORAM PAGOS AOS MEDICOS. Sem a ETAPA 1,
--    todos passariam a exibir o valor novo - inclusive nos comprovantes
--    de repasse ja impressos e assinados.
--
-- 4) O REPASSE PADRAO E LIMITADO AO VALOR PAGO
--    A regra do sistema e "o fixo nunca passa do que entrou": num
--    atendimento de R$ 45,00, o medico com padrao de R$ 55,00 recebe
--    R$ 45,00, nao R$ 55,00. Dos 2.885 atendimentos a congelar, 202 estao
--    nessa situacao. Por isso a ETAPA 1 congela cada um pelo MENOR valor
--    entre R$ 55,00 e o que o paciente pagou - e nao um 55,00 chapado,
--    que inflaria esses 202.
--
-- 5) QUEM USA CARTAO BENEFICIOS NAO ENTRA NA TRAVA
--    Outros 386 atendimentos antigos parecem cair no padrao, mas nao caem:
--    sao pagamentos por cartao beneficio (ou de valor zero), e nesses casos
--    o sistema usa o repasse de cartao beneficio cadastrado no medico, que
--    nao esta sendo alterado. Ficam de fora da ETAPA 1 de proposito -
--    congela-los gravaria um valor que hoje nao e o deles.
--
-- 6) QUEM NAO E TOCADO (nao esta em R$ 55,00)
--    Nao entram no script os medicos com repasse padrao por PERCENTUAL
--    (70%, 50%, 40%, 30%...), os que ja estao em R$ 60,00, os que estao
--    em R$ 0,00 de proposito e os valores negociados caso a caso
--    (R$ 175,00, R$ 145,00, R$ 77,00, R$ 72,80, R$ 18,00, R$ 10,00).
--    O filtro e exatamente "valor fixo igual a 55,00", como pedido.
-- =====================================================================



-- =====================================================================
-- ETAPA 0 - CONFERENCIA ANTES  (so leitura, nao grava nada)
-- =====================================================================

-- 0.1  Quantos medicos estao em cada repasse padrao hoje.
--      ESPERADO: 53 medicos em 'valor' 55.00 (42 ativos).
SELECT tipo_repasse,
       valor_repasse_padrao      AS valor_fixo,
       percentual_repasse_padrao AS percentual,
       count(*)                        AS medicos,
       count(*) FILTER (WHERE ativo)   AS ativos
FROM medicos
GROUP BY 1, 2, 3
ORDER BY medicos DESC;

-- 0.2  O passado que a ETAPA 1 vai congelar.
--      ESPERADO: 2.885 atendimentos, 1.389 ja pagos, 202 limitados pelo valor.
WITH proc_tipo AS (
  SELECT upper(nome) AS servico, max(upper(tipo)) AS tipo
  FROM procedimentos GROUP BY 1
)
SELECT count(*)                                          AS a_congelar,
       count(*) FILTER (WHERE l.repasse_pago)            AS ja_pagos_ao_medico,
       count(*) FILTER (WHERE NOT l.repasse_pago)        AS em_aberto,
       count(*) FILTER (WHERE l.valor < 55)              AS limitados_pelo_valor_pago,
       count(DISTINCT m.id)                              AS medicos,
       sum(least(55.00, l.valor))                        AS soma_congelada
FROM fin_lancamentos l
JOIN agendamentos a ON a.id = l.agendamento_id
JOIN medicos m ON m.id = coalesce(l.medico_id, a.medico_id)
LEFT JOIN proc_tipo pt ON pt.servico = upper(a.procedimento)
WHERE l.tipo = 'receita'
  AND l.valor_medico_override IS NULL
  AND a.inicio < TIMESTAMP '2026-09-01 00:00:00'
  AND l.valor > 0
  AND m.tipo_repasse = 'valor'
  AND m.valor_repasse_padrao = 55.00
  AND coalesce(l.convenio_modalidade, '') NOT IN ('cartao_consulta', 'cartao_desconto')
  AND NOT (l.convenio_modalidade IS NULL AND (
             upper(coalesce(l.descricao, '')) LIKE '%CART%O CONSULTA%'
          OR upper(coalesce(l.descricao, '')) LIKE '%CONSULTA CART%O%'
          OR upper(coalesce(l.descricao, '')) LIKE '%CART%O DESCONTO%'))
  AND NOT EXISTS (SELECT 1 FROM medico_convenios mc
                   WHERE mc.medico_id = m.id AND mc.ativo
                     AND upper(mc.nome) = upper(a.procedimento))
  AND NOT EXISTS (SELECT 1 FROM medico_convenios mc
                   WHERE mc.medico_id = m.id AND mc.ativo
                     AND mc.nome = '__CAT__:' || pt.tipo);



-- =====================================================================
-- ETAPA 1 - TRAVA DE SEGURANCA: CONGELAR O PASSADO   *** GRAVA ***
--
-- Roda ANTES da ETAPA 2. Grava em cada atendimento anterior a 01/09/2026
-- que cai no repasse padrao o valor que a regra da HOJE - que e o MENOR
-- entre R$ 55,00 e o que o paciente pagou.
--
-- Sao dois comandos: o 1.A monta a lista (que e tambem a copia de
-- seguranca do rollback); o 1.B grava.
-- ESPERADO: "INSERT 0 2885" no 1.A e "UPDATE 2885" no 1.B.
-- =====================================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS backup;

CREATE TABLE IF NOT EXISTS backup.repasse_padrao_20260901_congelados (
  lancamento_id    uuid PRIMARY KEY,
  override_gravado numeric NOT NULL,
  congelado_em     timestamptz NOT NULL DEFAULT now()
);

-- 1.A  Monta a lista.
INSERT INTO backup.repasse_padrao_20260901_congelados (lancamento_id, override_gravado)
WITH proc_tipo AS (
  SELECT upper(nome) AS servico, max(upper(tipo)) AS tipo
  FROM procedimentos GROUP BY 1
)
SELECT l.id,
       least(55.00, l.valor)          -- TRAVA: o fixo nunca passa do que entrou
FROM fin_lancamentos l
JOIN agendamentos a ON a.id = l.agendamento_id
JOIN medicos m ON m.id = coalesce(l.medico_id, a.medico_id)
LEFT JOIN proc_tipo pt ON pt.servico = upper(a.procedimento)
WHERE l.tipo = 'receita'
  AND l.valor_medico_override IS NULL              -- nao mexe em quem ja tem valor a mao
  AND a.inicio < TIMESTAMP '2026-09-01 00:00:00'   -- TRAVA: so o passado
  AND l.valor > 0                                  -- valor zero cai no cartao beneficios
  AND m.tipo_repasse = 'valor'
  AND m.valor_repasse_padrao = 55.00
  AND coalesce(l.convenio_modalidade, '') NOT IN ('cartao_consulta', 'cartao_desconto')
  AND NOT (l.convenio_modalidade IS NULL AND (
             upper(coalesce(l.descricao, '')) LIKE '%CART%O CONSULTA%'
          OR upper(coalesce(l.descricao, '')) LIKE '%CONSULTA CART%O%'
          OR upper(coalesce(l.descricao, '')) LIKE '%CART%O DESCONTO%'))
  AND NOT EXISTS (SELECT 1 FROM medico_convenios mc     -- nao tem linha propria
                   WHERE mc.medico_id = m.id AND mc.ativo
                     AND upper(mc.nome) = upper(a.procedimento))
  AND NOT EXISTS (SELECT 1 FROM medico_convenios mc     -- nem linha de categoria
                   WHERE mc.medico_id = m.id AND mc.ativo
                     AND mc.nome = '__CAT__:' || pt.tipo)
ON CONFLICT (lancamento_id) DO NOTHING;

-- 1.B  Grava o valor congelado.
UPDATE fin_lancamentos l
   SET valor_medico_override = b.override_gravado,
       updated_at            = now()
  FROM backup.repasse_padrao_20260901_congelados b
 WHERE l.id = b.lancamento_id
   AND l.valor_medico_override IS NULL;   -- permite rodar de novo sem efeito

COMMIT;



-- =====================================================================
-- ETAPA 2 - O CADASTRO: REPASSE PADRAO DE R$ 60,00   *** GRAVA ***
--
-- Depois disto, a aba "Repasse" do perfil de cada um desses medicos passa
-- a exibir R$ 60,00 no quadro REPASSE PADRAO.
--
-- ESPERADO: "UPDATE 53".
-- =====================================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS backup;

CREATE TABLE IF NOT EXISTS backup.medicos_repasse_padrao_20260901 AS
SELECT id, nome, ativo, tipo_repasse, valor_repasse_padrao, percentual_repasse_padrao,
       now() AS copiado_em
FROM medicos;

UPDATE medicos
   SET valor_repasse_padrao = 60.00,
       updated_at           = now()
 WHERE tipo_repasse = 'valor'
   AND valor_repasse_padrao = 55.00;   -- TRAVA: so quem esta exatamente em 55,00

COMMIT;



-- =====================================================================
-- ETAPA 3 - CONFERENCIA DEPOIS  (so leitura, nao grava nada)
-- =====================================================================

-- 3.1  O cadastro agora.
--      ESPERADO: 56 medicos em 'valor' 60.00 (os 53 mudados mais os 3 que
--      ja estavam em 60,00) e NENHUM em 55,00.
SELECT tipo_repasse,
       valor_repasse_padrao AS valor_fixo,
       count(*)                      AS medicos,
       count(*) FILTER (WHERE ativo) AS ativos
FROM medicos
WHERE tipo_repasse = 'valor'
GROUP BY 1, 2
ORDER BY medicos DESC;

-- 3.2  A trava funcionou? O passado tem que continuar no valor de antes.
--      ESPERADO: 2.683 em 55,00 e 202 em valores menores (nenhum em 60,00).
SELECT l.valor_medico_override AS repasse_congelado,
       count(*)                AS lancamentos,
       count(*) FILTER (WHERE l.repasse_pago) AS dos_quais_ja_pagos
FROM fin_lancamentos l
WHERE l.id IN (SELECT lancamento_id FROM backup.repasse_padrao_20260901_congelados)
GROUP BY 1
ORDER BY 2 DESC;

-- 3.3  Nenhum repasse ja pago ao medico mudou de valor.
--      ESPERADO: 0 linhas.
SELECT l.id, l.data, l.descricao, b.override_gravado, l.valor_medico_override
FROM backup.repasse_padrao_20260901_congelados b
JOIN fin_lancamentos l ON l.id = b.lancamento_id
WHERE l.repasse_pago
  AND coalesce(l.valor_medico_override, -1) <> b.override_gravado;

-- 3.4  Conferencia cruzada: a mudanca anterior (consulta 55 -> 60) continua
--      intacta e nao houve sobreposicao entre as duas travas.
--      ESPERADO: 0 lancamentos em comum.
SELECT count(*) AS em_comum_entre_as_duas_travas
FROM backup.repasse_consulta_20260901_congelados c
JOIN backup.repasse_padrao_20260901_congelados p
  ON p.lancamento_id = c.lancamento_id;



-- =====================================================================
-- COMO DESFAZER  (rollback - tudo comentado, nada roda sem descomentar)
--
-- Desfaca na ordem inversa: ETAPA 2, depois ETAPA 1.
-- =====================================================================

-- ---------------------------------------------------------------------
-- R.2  Desfaz a ETAPA 2 (volta o cadastro para R$ 55,00)
--      Opcao A - restaura pela copia de seguranca (preferida):
-- ---------------------------------------------------------------------
-- UPDATE medicos m
--    SET tipo_repasse              = b.tipo_repasse,
--        valor_repasse_padrao      = b.valor_repasse_padrao,
--        percentual_repasse_padrao = b.percentual_repasse_padrao,
--        updated_at                = now()
--   FROM backup.medicos_repasse_padrao_20260901 b
--  WHERE m.id = b.id;
--
--      Opcao B - sem a copia, na mao:
-- UPDATE medicos
--    SET valor_repasse_padrao = 55.00, updated_at = now()
--  WHERE tipo_repasse = 'valor' AND valor_repasse_padrao = 60.00;
--      ATENCAO na opcao B: ela tambem mexeria nos 3 medicos que ja estavam
--      em R$ 60,00 antes deste script. Prefira a opcao A.

-- ---------------------------------------------------------------------
-- R.1  Desfaz a ETAPA 1 (destrava o passado, voltando ao calculo ao vivo)
--      ATENCAO: so faz sentido depois de rodar R.2.
-- ---------------------------------------------------------------------
-- UPDATE fin_lancamentos l
--    SET valor_medico_override = NULL,
--        updated_at            = now()
--   FROM backup.repasse_padrao_20260901_congelados b
--  WHERE l.id = b.lancamento_id
--    AND l.valor_medico_override = b.override_gravado;

-- ---------------------------------------------------------------------
-- R.0  Limpeza das copias de seguranca - so depois de tudo conferido.
-- ---------------------------------------------------------------------
-- DROP TABLE IF EXISTS backup.repasse_padrao_20260901_congelados;
-- DROP TABLE IF EXISTS backup.medicos_repasse_padrao_20260901;

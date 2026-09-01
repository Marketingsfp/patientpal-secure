-- =====================================================================
-- REPASSE MEDICO DA CONSULTA: R$ 55,00  ->  R$ 60,00
-- Consulta particular que passou a custar R$ 120,00 (dinheiro) / R$ 145,00
-- (Pix, debito e credito) em 01/09/2026.
--
-- Preparado em 01/09/2026 - POLICLINICA MENINO JESUS
-- Numeros conferidos contra os dados de producao nesta mesma data.
--
-- =====================================================================
-- EXECUTADO EM 01/09/2026, com autorizacao do dono. Este arquivo passa a
-- ser tambem o registro do que foi rodado.
--
--   ETAPA 1 (congelamento do passado) ... 1.951 lancamentos congelados em
--            R$ 55,00, dos quais 449 ja pagos aos medicos. Nenhum ficou
--            de fora. Conferido: os 449 pagos continuam em R$ 55,00.
--   ETAPA 2 (nova regra) ............... 94 linhas passaram de R$ 55,00
--            para R$ 60,00, em 80 medicos. Copia de seguranca com 99
--            linhas (as 94 alteradas mais as 5 excecoes).
--   ETAPA 3 (repasse ja gravado) ....... 0 linhas, como previsto.
--   ETAPA 4 (conferencia) .............. as 5.703 consultas ja marcadas
--            de 01/09 em diante calculam R$ 60,00, em 9 medicos e 7
--            especialidades. Nenhuma cai fora da regra.
--
--   EXCECOES MANTIDAS COMO ESTAVAM, por decisao do dono (ANEXO A):
--     Dr. Alexandre de Figueiredo Queiroz .. R$ 0,00
--     Dr. Jorge Ribeiro .................... R$ 0,00
--     Dra. Priscila Ana Braga da S. Rocha .. 40%
--     Sao Francisco de Paula (clinica) ..... percentual em branco
--     CONSULTA OFTALMO ..................... R$ 72,80 e R$ 52,00
-- =====================================================================
--
-- COMO RODAR
--   Rode UM BLOCO DE CADA VEZ, na ordem, no SQL editor do Lovable.
--   As ETAPAS 0 e 4 sao so leitura (nao gravam nada).
--   As ETAPAS 1, 2 e 3 gravam. Cada uma abre e fecha sozinha (BEGIN/COMMIT).
--   Se qualquer etapa der erro, PARE e nao rode a seguinte.
-- =====================================================================


-- =====================================================================
-- O QUE FOI ENCONTRADO NO BANCO (por que o script e assim)
-- =====================================================================
--
-- 1) A REGRA DE REPASSE FICA NA TABELA `medico_convenios`
--    E a grade de repasse da ficha do medico: uma linha por medico e por
--    servico. Hoje existem 94 linhas ativas de CONSULTA / CONSULTA CLINICA
--    MEDICA, de 80 medicos, TODAS com repasse fixo de R$ 55,00.
--    Mudar essas 94 linhas para R$ 60,00 e a mudanca principal.
--
-- 2) O REPASSE DE CADA ATENDIMENTO NAO FICA GRAVADO - E CALCULADO NA HORA
--    A tabela `fin_lancamentos` (916.702 linhas) nao tem coluna de repasse.
--    O sistema le a regra e calcula o valor toda vez que abre a tela de
--    Atendimentos, o comprovante ou o relatorio de Rateio.
--    CONSEQUENCIA BOA: mudando a regra, todo atendimento de setembro em
--    diante ja sai com R$ 60,00 sozinho - nao e preciso reescrever nada.
--    CONSEQUENCIA RUIM (e e o risco real deste pedido): sem uma trava,
--    a mudanca tambem reescreveria o passado. Existem 1.951 consultas
--    ANTERIORES a 01/09 que ainda sao calculadas por essa regra, e
--    449 delas JA FORAM PAGAS AOS MEDICOS a R$ 55,00. Sem a ETAPA 1,
--    todas passariam a exibir R$ 60,00 - inclusive nos comprovantes de
--    repasse ja impressos e assinados. Seriam R$ 9.755,00 de repasse
--    retroativo criados do nada.
--    Por isso a ETAPA 1 vem ANTES da ETAPA 2 e e OBRIGATORIA.
--
-- 3) A TRAVA DO PASSADO E O CAMPO `valor_medico_override`
--    E o mesmo campo que a tela usa quando alguem digita o repasse a mao.
--    Gravando nele o valor que a regra da HOJE (R$ 55,00), aquele
--    atendimento fica congelado e nenhuma mudanca futura de regra o move.
--
-- 4) NAO EXISTE "REPASSE JA GERADO" PARA DATAS FUTURAS
--    `fin_atendimentos` (o modulo de atendimento externo, que e o unico
--    lugar onde o repasse fica gravado em coluna) nao tem NENHUMA linha de
--    01/09/2026 em diante - a ultima e de 29/08/2026. A ETAPA 3 existe
--    mesmo assim, com todas as travas, para o caso de aparecerem linhas
--    entre hoje e o dia em que o script for rodado. Hoje ela altera 0 linhas.
--
-- 5) DINHEIRO E CARTAO RECEBEM O MESMO R$ 60,00
--    A grade de repasse nao separa dinheiro de cartao: existe uma unica
--    coluna "Particular". Entao o fixo de R$ 60,00 vale tanto para a
--    consulta de R$ 120,00 (dinheiro) quanto para a de R$ 145,00 (Pix,
--    debito, credito). Isso e o que a recepcao ja vem fazendo na mao: os
--    8 lancamentos de consulta digitados hoje, 01/09, estao todos com
--    repasse de R$ 60,00, tanto os de R$ 120,00 quanto os de R$ 145,00.
--
-- 6) NAO DA PARA MIRAR PELO VALOR "R$ 120,00"
--    Existem dezenas de EXAMES que tambem custam R$ 120,00 em dinheiro
--    (ALDOSTERONA, CHUMBO, D-DIMERO, FENOBARBITAL, PERFIL REUMATOLOGICO...).
--    Um script que filtrasse "valor = 120 e dinheiro" mexeria no repasse
--    desses exames. Por isso TODO o script mira pelo NOME DO SERVICO
--    (CONSULTA e CONSULTA CLINICA MEDICA), nunca pelo valor.
--
-- 7) CASOS QUE FICARAM DE FORA (estao no ANEXO A, comentados)
--    - 2 medicos com repasse de consulta gravado como 0,00 de proposito;
--    - 1 medico por percentual (40%) e 1 cadastro que e clinica, nao medico;
--    - o servico CONSULTA OFTALMO, que tambem custa 120/145 mas tem
--      repasse negociado caso a caso (R$ 72,80 e R$ 52,00).
--    Nenhum deles e tocado pelas ETAPAS 1 a 3.
-- =====================================================================



-- =====================================================================
-- ETAPA 0 - CONFERENCIA ANTES  (so leitura, nao grava nada)
-- =====================================================================

-- 0.1  A regra hoje: quantas linhas, quantos medicos, qual valor.
--      ESPERADO: uma unica linha - 94 linhas, 80 medicos, valor 55.00.
SELECT tipo_repasse,
       valor                     AS repasse_atual,
       percentual,
       count(*)                  AS linhas,
       count(DISTINCT medico_id) AS medicos
FROM medico_convenios
WHERE ativo
  AND upper(nome) IN ('CONSULTA', 'CONSULTA CLINICA MEDICA')
GROUP BY 1, 2, 3
ORDER BY linhas DESC;

-- 0.2  O passado que precisa ser congelado pela ETAPA 1.
--      ESPERADO: 1.951 lancamentos, 449 ja pagos, soma R$ 107.305,00.
WITH regra AS (
  SELECT medico_id, upper(nome) AS servico, max(valor) AS valor
  FROM medico_convenios
  WHERE ativo
    AND upper(nome) IN ('CONSULTA', 'CONSULTA CLINICA MEDICA')
    AND tipo_repasse = 'valor'
    AND coalesce(valor, 0) > 0
  GROUP BY 1, 2
)
SELECT count(*)                                   AS lancamentos_a_congelar,
       count(*) FILTER (WHERE l.repasse_pago)     AS ja_pagos_ao_medico,
       count(*) FILTER (WHERE NOT l.repasse_pago) AS ainda_em_aberto,
       sum(r.valor)                               AS soma_repasse_congelado
FROM fin_lancamentos l
JOIN agendamentos a ON a.id = l.agendamento_id
JOIN regra r ON r.medico_id = coalesce(l.medico_id, a.medico_id)
            AND r.servico   = upper(a.procedimento)
WHERE l.tipo = 'receita'
  AND l.valor_medico_override IS NULL
  AND a.inicio < TIMESTAMP '2026-09-01 00:00:00'
  AND coalesce(l.convenio_modalidade, '') NOT IN ('cartao_consulta', 'cartao_desconto')
  AND upper(coalesce(l.descricao, '')) NOT LIKE '%CART%O CONSULTA%'
  AND upper(coalesce(l.descricao, '')) NOT LIKE '%CART%O DESCONTO%';

-- 0.3  Lancamentos de repasse gravados de 01/09/2026 em diante.
--      ESPERADO hoje: 0 linhas (a ultima data em fin_atendimentos e 29/08).
SELECT count(*) AS atendimentos_externos_de_setembro
FROM fin_atendimentos
WHERE data >= DATE '2026-09-01';



-- =====================================================================
-- ETAPA 1 - TRAVA DE SEGURANCA: CONGELAR O PASSADO   *** GRAVA ***
--
-- Roda ANTES da ETAPA 2. Grava em cada consulta anterior a 01/09/2026 o
-- repasse que a regra da HOJE (R$ 55,00), para que a mudanca da regra nao
-- reescreva atendimento nenhum de agosto para tras - nem os ja pagos aos
-- medicos, nem os que ainda estao em aberto.
--
-- Sao dois comandos: o 1.A monta a lista do que sera congelado (e essa mesma
-- lista e a copia de seguranca usada no rollback); o 1.B grava.
-- ESPERADO: "INSERT 0 1951" no 1.A e "UPDATE 1951" no 1.B.
-- =====================================================================
BEGIN;

-- Guarda-chuva do rollback: um lugar fora do `public` (nao exposto pela API
-- do site) com a lista exata do que esta etapa congelou.
CREATE SCHEMA IF NOT EXISTS backup;

CREATE TABLE IF NOT EXISTS backup.repasse_consulta_20260901_congelados (
  lancamento_id    uuid PRIMARY KEY,
  override_gravado numeric NOT NULL,
  congelado_em     timestamptz NOT NULL DEFAULT now()
);

-- 1.A  Monta a lista: cada consulta anterior a 01/09 e o repasse que a regra
--      da para ela hoje.
INSERT INTO backup.repasse_consulta_20260901_congelados (lancamento_id, override_gravado)
WITH regra AS (
  SELECT medico_id, upper(nome) AS servico, max(valor) AS valor
  FROM medico_convenios
  WHERE ativo
    AND upper(nome) IN ('CONSULTA', 'CONSULTA CLINICA MEDICA')
    AND tipo_repasse = 'valor'
    AND coalesce(valor, 0) > 0
  GROUP BY 1, 2
)
SELECT l.id, r.valor
FROM fin_lancamentos l
JOIN agendamentos a ON a.id = l.agendamento_id
JOIN regra r ON r.medico_id = coalesce(l.medico_id, a.medico_id)
            AND r.servico   = upper(a.procedimento)
WHERE l.tipo = 'receita'
  AND l.valor_medico_override IS NULL             -- nao mexe em quem ja tem valor a mao
  AND a.inicio < TIMESTAMP '2026-09-01 00:00:00'  -- TRAVA: so o passado
  AND coalesce(l.convenio_modalidade, '') NOT IN ('cartao_consulta', 'cartao_desconto')
  AND upper(coalesce(l.descricao, '')) NOT LIKE '%CART%O CONSULTA%'
  AND upper(coalesce(l.descricao, '')) NOT LIKE '%CART%O DESCONTO%'
ON CONFLICT (lancamento_id) DO NOTHING;

-- 1.B  Grava o valor congelado nos lancamentos da lista.
UPDATE fin_lancamentos l
   SET valor_medico_override = b.override_gravado,
       updated_at            = now()
  FROM backup.repasse_consulta_20260901_congelados b
 WHERE l.id = b.lancamento_id
   AND l.valor_medico_override IS NULL;   -- permite rodar de novo sem efeito

COMMIT;



-- =====================================================================
-- ETAPA 2 - A REGRA: REPASSE FIXO DE R$ 60,00 NA CONSULTA   *** GRAVA ***
--
-- Vale para todos os medicos e todas as especialidades que hoje usam o
-- repasse fixo de consulta. A partir daqui, toda consulta de 01/09 em
-- diante - de R$ 120,00 no dinheiro ou de R$ 145,00 no Pix/cartao -
-- calcula R$ 60,00 de repasse sozinha.
--
-- ESPERADO: "UPDATE 94".
-- =====================================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS backup;

-- Copia integral das linhas antes de mudar (e o rollback mais seguro).
CREATE TABLE IF NOT EXISTS backup.medico_convenios_20260901 AS
SELECT *, now() AS copiado_em
FROM medico_convenios
WHERE ativo
  AND upper(nome) IN ('CONSULTA', 'CONSULTA CLINICA MEDICA');

UPDATE medico_convenios
   SET valor      = 60.00,
       updated_at = now()
 WHERE ativo
   AND upper(nome) IN ('CONSULTA', 'CONSULTA CLINICA MEDICA')
   AND tipo_repasse = 'valor'
   AND coalesce(valor, 0) > 0       -- TRAVA: nao mexe em quem esta zerado de proposito
   AND coalesce(valor, 0) <> 60;    -- TRAVA: nao mexe em quem ja esta em 60 (permite rodar de novo)

COMMIT;



-- =====================================================================
-- ETAPA 3 - LANCAMENTOS DE REPASSE JA GRAVADOS, DE 01/09/2026 EM DIANTE
-- *** GRAVA ***
--
-- So a tabela `fin_atendimentos` (atendimento externo) guarda o repasse em
-- coluna. Hoje ela nao tem nenhuma linha de setembro, entao esta etapa
-- altera 0 linhas - ela existe para o caso de a recepcao lancar algo entre
-- hoje e o dia em que o script for rodado.
--
-- TRAVAS: so data >= 01/09/2026, so repasse ainda NAO pago ao medico, so o
-- servico CONSULTA / CONSULTA CLINICA MEDICA, so R$ 120,00 em dinheiro.
--
-- ESPERADO hoje: "UPDATE 0".
-- =====================================================================
BEGIN;

CREATE SCHEMA IF NOT EXISTS backup;

CREATE TABLE IF NOT EXISTS backup.fin_atendimentos_20260901 AS
SELECT *, now() AS copiado_em
FROM fin_atendimentos
WHERE data >= DATE '2026-09-01';

UPDATE fin_atendimentos
   SET valor_medico  = 60.00,
       valor_clinica = round(valor_total - 60.00, 2),
       updated_at    = now()
 WHERE data >= DATE '2026-09-01'         -- TRAVA: nada retroativo
   AND repasse_pago = false              -- TRAVA: nada ja pago ao medico
   AND upper(coalesce(procedimento, '')) IN ('CONSULTA', 'CONSULTA CLINICA MEDICA')
   AND valor_total = 120.00
   AND lower(coalesce(forma_pagamento, '')) LIKE '%dinheiro%'
   AND valor_medico <> 60.00;            -- permite rodar de novo sem efeito

COMMIT;



-- =====================================================================
-- ETAPA 4 - CONFERENCIA DEPOIS  (so leitura, nao grava nada)
-- =====================================================================

-- 4.1  A regra agora.
--      ESPERADO: 94 linhas, 80 medicos, valor 60.00.
SELECT tipo_repasse,
       valor                     AS repasse_agora,
       count(*)                  AS linhas,
       count(DISTINCT medico_id) AS medicos
FROM medico_convenios
WHERE ativo
  AND upper(nome) IN ('CONSULTA', 'CONSULTA CLINICA MEDICA')
GROUP BY 1, 2
ORDER BY linhas DESC;

-- 4.2  A trava funcionou? O passado tem que continuar em R$ 55,00.
--      ESPERADO: 1.951 linhas, todas com repasse congelado 55.00.
SELECT valor_medico_override AS repasse_congelado,
       count(*)              AS lancamentos
FROM fin_lancamentos
WHERE id IN (SELECT lancamento_id FROM backup.repasse_consulta_20260901_congelados)
GROUP BY 1
ORDER BY 2 DESC;

-- 4.3  Nenhum repasse ja pago ao medico mudou de valor.
--      ESPERADO: 0 linhas.
SELECT l.id, l.data, l.descricao, b.override_gravado, l.valor_medico_override
FROM backup.repasse_consulta_20260901_congelados b
JOIN fin_lancamentos l ON l.id = b.lancamento_id
WHERE l.repasse_pago
  AND coalesce(l.valor_medico_override, -1) <> b.override_gravado;

-- 4.4  Simulacao: o que o sistema vai calcular nas consultas ja marcadas
--      de 01/09 em diante, por medico. Todas devem sair em R$ 60,00.
SELECT m.nome                                  AS medico,
       coalesce(e.nome, '(sem especialidade)') AS especialidade,
       a.procedimento,
       count(*)                                AS consultas_marcadas,
       max(mc.valor)                           AS repasse_por_consulta
FROM agendamentos a
JOIN medicos m ON m.id = a.medico_id
LEFT JOIN especialidades e ON e.id = m.especialidade_id
LEFT JOIN medico_convenios mc
       ON mc.medico_id = a.medico_id
      AND mc.ativo
      AND upper(mc.nome) = upper(a.procedimento)
WHERE a.inicio >= TIMESTAMP '2026-09-01 00:00:00'
  AND a.status::text NOT LIKE 'cancel%'
  AND upper(coalesce(a.procedimento, '')) IN ('CONSULTA', 'CONSULTA CLINICA MEDICA')
GROUP BY 1, 2, 3
ORDER BY 4 DESC;



-- =====================================================================
-- ANEXO A - CASOS ESPECIAIS (NAO rodam junto; so se o dono mandar)
--
-- Nenhum destes e tocado pelas ETAPAS 1 a 3. Cada bloco esta comentado.
-- =====================================================================

-- A.1  DOIS MEDICOS COM REPASSE DE CONSULTA GRAVADO COMO R$ 0,00
--      ALEXANDRE DE FIGUEIREDO QUEIROZ e JORGE RIBEIRO.
--      No sistema, celula em branco herda o repasse padrao do medico, mas o
--      numero 0 digitado significa "esta consulta nao gera repasse". Foram
--      deixados como estao de proposito. Rodar o bloco abaixo passa os dois
--      a receber R$ 60,00 por consulta.
--
-- UPDATE medico_convenios
--    SET valor = 60.00, updated_at = now()
--  WHERE ativo
--    AND upper(nome) IN ('CONSULTA', 'CONSULTA CLINICA MEDICA')
--    AND tipo_repasse = 'valor'
--    AND coalesce(valor, 0) = 0;
--    -- esperado: UPDATE 2

-- A.2  UM MEDICO POR PERCENTUAL
--      PRISCILA ANA BRAGA DA SILVA ROCHA recebe 40% da consulta - hoje
--      R$ 48,00 no dinheiro (40% de 120) e R$ 58,00 no cartao (40% de 145).
--      Passar para o fixo de R$ 60,00 muda o acordo dela nas duas formas.
--
-- UPDATE medico_convenios
--    SET tipo_repasse = 'valor', valor = 60.00, percentual = NULL, updated_at = now()
--  WHERE ativo
--    AND upper(nome) IN ('CONSULTA', 'CONSULTA CLINICA MEDICA')
--    AND tipo_repasse = 'percentual'
--    AND coalesce(percentual, 0) > 0;
--    -- esperado: UPDATE 1

-- A.3  CADASTRO "SAO FRANCISCO DE PAULA"
--      Nao e medico, e a clinica parceira, cadastrada como prestador com
--      repasse por percentual em branco/zero. Recomendacao: NAO mexer -
--      colocar R$ 60,00 aqui criaria um repasse de R$ 60,00 por consulta
--      para a clinica parceira, que hoje nao existe.

-- A.4  SERVICO "CONSULTA OFTALMO"
--      Tambem custa R$ 120,00 / R$ 145,00, mas o repasse e negociado caso a
--      caso: JOAO HELIO VALENTIM recebe R$ 72,80 e MARINA ALMEIDA DIAS
--      recebe R$ 52,00. Padronizar em R$ 60,00 tira R$ 12,80 de um e da
--      R$ 8,00 ao outro. Fora do script por isso.
--
-- UPDATE medico_convenios
--    SET valor = 60.00, updated_at = now()
--  WHERE ativo AND upper(nome) = 'CONSULTA OFTALMO'
--    AND tipo_repasse = 'valor' AND coalesce(valor, 0) > 0;
--    -- esperado: UPDATE 2



-- =====================================================================
-- COMO DESFAZER  (rollback - tudo comentado, nada roda sem descomentar)
--
-- Desfaca na ordem inversa: ETAPA 3, depois 2, depois 1.
-- =====================================================================

-- ---------------------------------------------------------------------
-- R.3  Desfaz a ETAPA 3 (atendimentos externos de setembro)
-- ---------------------------------------------------------------------
-- UPDATE fin_atendimentos f
--    SET valor_medico  = b.valor_medico,
--        valor_clinica = b.valor_clinica,
--        updated_at    = now()
--   FROM backup.fin_atendimentos_20260901 b
--  WHERE f.id = b.id;

-- ---------------------------------------------------------------------
-- R.2  Desfaz a ETAPA 2 (volta a regra para R$ 55,00)
--      Opcao A - restaura pela copia de seguranca (preferida):
-- ---------------------------------------------------------------------
-- UPDATE medico_convenios mc
--    SET tipo_repasse = b.tipo_repasse,
--        valor        = b.valor,
--        percentual   = b.percentual,
--        updated_at   = now()
--   FROM backup.medico_convenios_20260901 b
--  WHERE mc.id = b.id;
--
--      Opcao B - sem a copia, na mao:
-- UPDATE medico_convenios
--    SET valor = 55.00, updated_at = now()
--  WHERE ativo
--    AND upper(nome) IN ('CONSULTA', 'CONSULTA CLINICA MEDICA')
--    AND tipo_repasse = 'valor'
--    AND valor = 60.00;

-- ---------------------------------------------------------------------
-- R.1  Desfaz a ETAPA 1 (destrava o passado, voltando ao calculo ao vivo)
--      ATENCAO: so faz sentido depois de rodar R.2. Se a regra estiver em
--      R$ 60,00 e voce destravar o passado, as 1.951 consultas antigas
--      passam a exibir R$ 60,00 - exatamente o problema que a ETAPA 1
--      existe para evitar.
-- ---------------------------------------------------------------------
-- UPDATE fin_lancamentos l
--    SET valor_medico_override = NULL,
--        updated_at            = now()
--   FROM backup.repasse_consulta_20260901_congelados b
--  WHERE l.id = b.lancamento_id
--    AND l.valor_medico_override = b.override_gravado;

-- ---------------------------------------------------------------------
-- R.0  Limpeza das copias de seguranca - so depois de tudo conferido.
--      Nao rode antes de ter certeza de que nao vai precisar voltar atras.
-- ---------------------------------------------------------------------
-- DROP TABLE IF EXISTS backup.repasse_consulta_20260901_congelados;
-- DROP TABLE IF EXISTS backup.medico_convenios_20260901;
-- DROP TABLE IF EXISTS backup.fin_atendimentos_20260901;

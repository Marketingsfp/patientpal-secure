# Caixa de LUAN CARLOS DE OLIVEIRA — 22/08/2026

Conferência feita em 24/08/2026, depois do fechamento gravado no banco.

## 1. Como o caixa ficou

| Campo | Valor |
|---|---|
| Situação | **FECHADO** |
| Aberto em | 22/08/2026 08:45 (abertura automática) |
| Fechado em | 22/08/2026 23:59 (data lançada para cair no dia certo) |
| Troco de abertura | R$ 0,00 |
| Valor informado (cupom físico) | **R$ 2.476,00** |
| Valor calculado (sistema) | **R$ 2.260,99** |
| Diferença | **+R$ 215,01 (sobra)** |

## 2. Conferência forma por forma

Somei os 35 movimentos do dia, um por um. Bate.

| Forma | Sistema | Cupom | Falta |
|---|---|---|---|
| Cartão crédito | 1.854,00 | 1.854,00 | — |
| PIX / Depósito | 335,00 | 335,00 | — |
| Cartão débito | 192,00 | 287,00 | 95,00 |
| Dinheiro | 1.357,99 | 1.478,00 | 120,01 |
| **Entradas** | **3.738,99** | **3.954,00** | **215,01** |
| Sangria | −1.478,00 | −1.478,00 | — |
| **SALDO** | **2.260,99** | **2.476,00** | **215,01** |

O total de entradas de 3.738,99 é exatamente o "TOTAL DO TURNO" que aparece na tela.

## 3. Os 95,00 de débito — resolvido, sem ação

Pagamento de EUTACIANA MARQUES REGIS ARAUJO, às 08:40, em cartão de débito.
Foi digitado no caixa da SUELLEN, não no do Luan. O caixa da Suellen fechou
conferido em 6.526,89 com diferença zero — ou seja, o dinheiro está na
clínica, só entrou pela gaveta errada.

Não foi transferido de propósito: caixa já fechado não se reescreve.

## 4. Os 120,01 de dinheiro — pista forte, precisa do cupom

A matemática aponta para um lançamento só, e com muita precisão.

O único valor do dia que termina em centavos quebrados é o de
**MARIA DAS GRACAS DE OLIVEIRA, às 09:15, CONSULTA — CONVÊNIO CARTÃO
CONSULTA, R$ 9,99 em dinheiro**.

Se essa consulta na verdade foi paga como particular (R$ 130,00), a conta
fecha exatamente:

    1.357,99  (dinheiro apurado pelo sistema)
    -    9,99  (tira o lançamento de 9,99)
    +  130,00  (põe a consulta particular)
    ---------
    = 1.478,00  (exatamente o dinheiro do cupom)

Nenhuma outra combinação de valores do dia produz a diferença de 120,01,
porque todos os outros lançamentos são valores redondos — só o 9,99 explica
o centavo.

Importante: o valor de R$ 9,99 **não é um defeito**. É o preço de consulta do
Cartão Consulta e aparece 193 vezes entre junho e agosto. O que precisa ser
verificado é se ESTA paciente, neste dia, tinha direito ao preço do cartão ou
se pagou os R$ 130,00 de particular.

**Como confirmar:** procurar MARIA DAS GRACAS DE OLIVEIRA no cupom impresso do
sistema antigo de 22/08. Se lá estiver R$ 130,00, é este o buraco.

**Se confirmar, o acerto é feito no caixa de hoje**, com histórico apontando
para o dia 22/08. O caixa de 22/08 está fechado e não pode ser reescrito.

## 5. Um detalhe para você saber

A hora de fechamento foi gravada como 22/08 às 23:59, embora o fechamento
tenha sido feito de fato em 24/08. Isso foi proposital, para o fechamento
cair no dia a que ele se refere e não bagunçar os relatórios. O fato de ter
sido fechado em 24/08, e por SQL, está escrito por extenso nas observações
do caixa.

## 6. Veredito

O fechamento está correto e honesto: fechou pelo valor do cupom físico
(2.476,00) e deixou a sobra de 215,01 registrada em vez de escondida. As duas
divergências estão explicadas por escrito dentro do próprio caixa, e nenhuma
delas é dinheiro perdido — 95,00 estão na gaveta da Suellen e 120,01 são um
recebimento que provavelmente foi digitado pelo preço errado.

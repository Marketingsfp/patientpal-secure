# Auditoria dos caixas, funcionário por funcionário — 24/08/2026

Segunda passada, agora organizada por pessoa. Consultado o banco de produção,
**somente leitura** — nada foi alterado. Os dois scripts de gravação que
preparei mais cedo **continuam sem ter sido rodados**: os 13 caixas abertos
listados aqui são exatamente os mesmos de antes.

---

## A resposta primeiro

**De 20/08 em diante, os caixas de todos os funcionários estão batendo.**
São 12 caixas fechados desde então, entre as cinco recepcionistas e o Luan:
**nenhum com sobra, nenhum com falta, nenhum com valor gravado diferente dos
movimentos.** Zero pendências.

| Período | Caixas fechados | Bateram | Com problema |
|---|---|---|---|
| Até 19/08 | 100 | 60 | 40 |
| **De 20/08 em diante** | **12** | **12** | **0** |

Tudo o que aparece abaixo é **anterior a 20/08** — e a maior parte não é
dinheiro faltando, é resíduo de duas falhas do sistema que já foram corrigidas.

---

## Placar por pessoa

| Funcionária | Caixas | Perfeitos | Falta/sobra real | Resíduo do sistema | Abertos |
|---|---|---|---|---|---|
| NICOLE FROTA MAGALHAES | 24 | 17 | 2 | 4 | 1 (hoje) |
| AMANDA FELICIA DE MORAES NETTO | 23 | 13 | 2 (+1 fantasma) | 7 | 0 |
| SUELLEN ALEXANDRE BATISTA | 23 | 13 | **0** | 9 | 1 (hoje) |
| EDNALDA PAULINA DE OLIVEIRA | 22 | 14 | 1 | 6 | 1 (hoje) |
| MAYARA APARECIDA VIANA LUCENA | 19 | 10 | 1 | 6 | **2** |
| LUAN CARLOS DE OLIVEIRA | 7 | 5 | 1 | 0 | 1 |

"Abertos de hoje" é normal — são os caixas em uso agora, às 15h.
A Mayara tem **dois**: o de hoje e o de 18/08 que ficou esquecido.

---

## O que é dinheiro de verdade

Estes são os únicos casos em que o caixa foi conferido corretamente e mesmo
assim o dinheiro contado não bateu. São **7 casos em 5 meses**, somando
**R$ 1.488,00 de falta líquida**:

| Funcionária | Dia | Calculado | Contado | Diferença |
|---|---|---|---|---|
| LUAN CARLOS DE OLIVEIRA | 11/07 (sáb) | 2.805,00 | 1.351,00 | **− 1.454,00** |
| NICOLE FROTA MAGALHAES | 13/07 (seg) | 5.053,50 | 4.528,50 | − 525,00 |
| AMANDA FELICIA DE MORAES NETTO | 13/07 (seg) | 2.941,30 | 2.721,30 | − 220,00 |
| EDNALDA PAULINA DE OLIVEIRA | 18/08 (ter) | 4.575,94 | 4.375,94 | − 200,00 |
| AMANDA FELICIA DE MORAES NETTO | 14/07 (ter) | 2.514,50 | 2.404,50 | − 110,00 |
| MAYARA APARECIDA VIANA LUCENA | 14/07 (ter) | 4.599,50 | 4.489,50 | − 110,00 |
| NICOLE FROTA MAGALHAES | 11/07 (sáb) | 5.769,00 | 6.900,00 | **+ 1.131,00** |

Chama atenção que **11, 13 e 14 de julho** concentram quase tudo, e que a falta
do Luan em 11/07 (R$ 1.454,00) e a sobra da Nicole no **mesmo sábado**
(R$ 1.131,00) andam juntas. Isso tem cara de dinheiro lançado no caixa errado,
não de dinheiro desaparecido — vale conferir os dois cupons de 11/07 lado a lado
antes de tratar como quebra de caixa.

A **Suellen não tem nenhum caso** — os 23 caixas dela sempre fecharam com o
dinheiro batendo.

---

## O que NÃO é dinheiro (resíduo do sistema)

São 32 caixas marcados, mas nenhum deles significa dinheiro faltando. Três
causas, todas já corrigidas no sistema:

**1. Caixa que ficou aberto vários dias e fechou cobrindo só um deles** — 8
caixas, todos entre 01/06 e 23/07. O maior: Suellen, caixa aberto em 01/06 com
movimento em 4 dias diferentes, fechado como se fosse um dia só. Foi a falha
corrigida em 19/08.

**2. Caixa fechado em lote com valor zero** — 5 caixas (um de cada recepcionista). Em 11/08 e 19/08
alguém encerrou caixas pendentes gravando R$ 0,00, e o movimento que estava
dentro nunca passou por conferência. Os maiores são todos de **29/07**: Mayara
R$ 8.372,98, Suellen R$ 6.939,99, Nicole R$ 4.793,97, Ednalda R$ 2.248,49 — o
dia inteiro de quatro recepcionistas.

**3. Lançamento retroativo digitado depois do caixa já fechado** — 19 caixas,
com valores pequenos (de R$ 8,00 a R$ 565,00). Alguém corrigia um atendimento
dias depois e o lançamento entrava num caixa já encerrado, mudando o total por
baixo do fechamento. Também já corrigido: **não acontece nenhum caso desde
04/08**.

---

## Uma sobra que não existe

O caixa da **Amanda de 19/08** aparece na tela com **sobra de R$ 1.554,00**.
Não é dinheiro. Abri os movimentos: a sessão tem só dois recebimentos — Louise
(R$ 9,99) e Nicolas (R$ 290,00) — e **os dois foram estornados minutos depois**,
às 15:28 e 15:29. O caixa vale R$ 0,00. Os R$ 1.554,00 foram o valor que ela
digitou na conferência, que pertencia ao outro caixa dela daquele dia.
E o fechamento ficou gravado com data de **18/08**, um dia antes de o caixa ter
sido aberto — a assinatura da falha antiga.

Esse número deveria ser zerado, senão fica pendurado como sobra da Amanda para
sempre.

---

## Caixas abertos agora

Os mesmos 13 de antes. Em uso normal: Suellen, Ednalda, Nicole e Mayara (hoje).
Os outros 9 continuam parados, somando **R$ 8.395,96**:

| Pessoa | Aberto desde | Dias | Saldo |
|---|---|---|---|
| MAYARA APARECIDA VIANA LUCENA | 18/08 | 6 | **3.909,95** |
| LUAN CARLOS DE OLIVEIRA | 22/08 | 2 | **2.260,99** |
| FADILA PEREIRA | 10/07 | 45 | 1.490,00 |
| ALESSANDRA MAIA | 09/07 | 46 | 450,01 |
| MICHELLE DE AZEVEDO VIEIRA | 20/05 | 96 | 161,00 |
| JEAN XAVIER FERREIRA PINHO | 24/06 | 61 | 91,00 |
| ZENILDA SOARES DA SILVA | 18/08 | 6 | 16,00 |
| TATIANE BARRETO CARVALHO DA SILVA | 10/07 | 45 | 0,00 |
| ÉRICA PAULA | 24/06 | 61 | 0,00 |

Os dois scripts que já preparei resolvem todos eles.

---

## O que fazer com isso

1. **Rodar os dois scripts** já prontos — fecham a Mayara de 18/08 e os 7
   antigos. Isso limpa 8 dos 9 caixas parados.
2. **Conferir os cupons de 11/07 do Luan e da Nicole lado a lado.** A falta de
   R$ 1.454,00 dele e a sobra de R$ 1.131,00 dela no mesmo sábado provavelmente
   são o mesmo dinheiro no caixa errado.
3. **Zerar a sobra fantasma de R$ 1.554,00 da Amanda em 19/08**, que já provei
   não ser dinheiro.
4. **Não cobrar ninguém pelos 32 caixas de "resíduo do sistema".** Nenhum deles
   é quebra de caixa — são as duas falhas que já foram corrigidas.

As faltas reais somam R$ 1.488,00 em cinco meses, e mesmo essas concentram-se em
três dias de julho.

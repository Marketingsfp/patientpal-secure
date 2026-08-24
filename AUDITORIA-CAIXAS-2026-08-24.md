# Auditoria de todos os caixas — 24/08/2026

Feita consultando o banco de produção, **somente leitura**. Nada foi alterado.
Foram conferidos os **145 caixas** existentes (13 abertos, 132 fechados), de
13/04/2026 até hoje.

---

## Resposta curta

**A conta do sistema está certa.** Eu refiz, movimento por movimento, o cálculo
de todos os caixas e comparei com o que ficou gravado no fechamento. De
**21/08 em diante, todo caixa fechado bate exatamente** — nenhum centavo de
diferença.

O que as pessoas estão vendo como "erro" **não é conta errada**: são
**caixas que nunca foram fechados** e ficam pendurados na tela, mais algumas
sobras e faltas antigas (de 18 e 19/08 e de julho) que continuam gravadas e
aparecem na listagem. Enquanto esses caixas não forem encerrados, eles vão
continuar aparecendo como pendência todo dia.

---

## 1. Caixas que continuam abertos (a causa principal do incômodo)

### Recentes — precisam ser fechados

| Pessoa | Abriu | Movimentos | Saldo parado |
|---|---|---|---|
| MAYARA APARECIDA VIANA LUCENA | **18/08** | 70 | **R$ 3.909,95** |
| LUAN CARLOS DE OLIVEIRA | **22/08** | 35 | **R$ 2.260,99** |
| ZENILDA SOARES DA SILVA | 18/08 | 1 | R$ 16,00 |

O da Mayara é o mais sério: são **70 movimentos do dia 18/08** que nunca
entraram em fechamento nenhum. Ela trabalhou normal nos dias seguintes (o caixa
dela de 19, 20 e 24/08 está tudo fechado e conferido) — esse de 18/08 ficou
esquecido aberto.

O do Luan já foi diagnosticado em separado (arquivo
`CAIXA-LUAN-22-08-DIAGNOSTICO.md`): faltam R$ 120,01 em dinheiro que ele
recebeu e não digitou, e por isso o sistema recusa fechar pela tela.

### Antigos — restos de teste / gente que usou uma vez

| Pessoa | Abriu | Movimentos | Saldo |
|---|---|---|---|
| FADILA PEREIRA | 10/07 | 7 | R$ 1.490,00 |
| ALESSANDRA MAIA | 09/07 | 7 | R$ 450,01 |
| MICHELLE DE AZEVEDO VIEIRA | 20/05 | 3 | R$ 161,00 |
| JEAN XAVIER FERREIRA PINHO | 24/06 | 4 | R$ 91,00 |
| TATIANE BARRETO CARVALHO DA SILVA | 10/07 | 9 | R$ 0,00 |
| ÉRICA PAULA | 24/06 | 0 | R$ 0,00 |

Somam R$ 2.192,01 e estão pendurados há mais de um mês.

---

## 2. Caixas fechados com dinheiro que ficou fora da conferência

Aqui o caixa foi encerrado, mas o valor gravado no fechamento foi **zero**,
mesmo tendo movimento dentro. O dinheiro existe no financeiro; o que não existe
é a conferência dele.

| Pessoa | Dia | Movimentos | Valor que ficou fora |
|---|---|---|---|
| AMANDA FELICIA DE MORAES NETTO | 18/08 | 10 recebimentos | **R$ 1.263,99** |
| RODRIGO SABADIM SANTANA | 04/08 | 1 | R$ 113,50 |

O da Amanda foi fechado manualmente por um gestor ("FECHADO POR JOAO PEDRO
NEVES CANTARELA") com valor 0,00, e os R$ 1.263,99 nunca foram conferidos
contra o cupom.

---

## 3. Sobras e faltas que continuam registradas

| Pessoa | Dia | Diferença | O que é |
|---|---|---|---|
| AMANDA FELICIA DE MORAES NETTO | 19/08 | **+ R$ 1.554,00** | caixa com só R$ 299,99 de movimento, fechado com data de 18/08 — é a falha antiga do fechamento de vários dias |
| EDNALDA PAULINA DE OLIVEIRA | 18/08 | **− R$ 200,00** | falta real informada no fechamento |
| NICOLE FROTA MAGALHAES | 19/08 | R$ 119,99 | o cupom do fechamento saiu com R$ 7.985,95, o registro ficou com R$ 8.305,95 e os movimentos hoje somam R$ 8.185,96 — sobra de R$ 119,99 sem lastro |
| JOÃO PEDRO NEVES CANTARELA | 12/08 | − R$ 130,00 | caixa de teste |

Todas as três primeiras são do dia **18 e 19/08**, que foi justamente o período
em que a falha do fechamento de vários dias estava ativa. Ela já foi corrigida:
de 20/08 em diante o problema não se repetiu.

---

## 4. O que eu conferi e está CERTO

Isso aqui é importante, porque descarta as suspeitas mais comuns:

- **Pagamento misto está sendo dividido corretamente.** Nos 9 casos de agosto
  (Sérgio, Raqueliane, Crislane, Raimunda, Luiz Carlos, Jorge, Cecília, Nadir e
  Sérgio de Almeida), a soma das partes bate **exatamente** com o valor do
  financeiro. Não há valor contado duas vezes.
- **Nenhum recebimento duplicado** no caixa.
- **Nenhum recebimento sumido.** De 17 a 24/08, de todos os pagamentos
  confirmados no financeiro, só **um de R$ 12,00** não gerou movimento de caixa.
- **Nenhuma sangria caiu no caixa de outra pessoa.** Todas as 64 sangrias de
  agosto foram entregues à própria operadora (vão para o cofre).
- **Nenhum lançamento retroativo invadiu caixa fechado** depois de 04/08. Antes
  disso havia muito; hoje não há mais.
- **Nenhuma forma de pagamento fechou negativa**, exceto o dinheiro do Luan em
  22/08, que já está diagnosticado.
- **Valor e forma de pagamento batem** entre o caixa e o financeiro em todos os
  1.825 recebimentos de agosto.
- **Os recebimentos de R$ 9,99 não são erro** — é o preço da consulta pelo
  Cartão Consulta + Seguros. Foram 6 hoje, todos legítimos.

---

## 5. Um detalhe do sistema que vale corrigir antes de virar problema

Fechar **o próprio caixa** e fechar **o caixa de outra pessoa** usam duas contas
diferentes no código:

- No próprio caixa, o **troco de abertura fica de fora** do saldo
  ([fechamento.ts](src/lib/caixa/fechamento.ts) + `saldoDoDiaFechamento` em
  [app.caixa.tsx:2432](src/routes/_authenticated/app.caixa.tsx#L2432)).
- Ao fechar o caixa de outra pessoa, ou ao fechar em lote, o troco **entra**
  no saldo (`calcSaldoSessao` em
  [app.caixa.tsx:2541](src/routes/_authenticated/app.caixa.tsx#L2541)).

Hoje isso quase não aparece porque quase ninguém abre caixa com troco (na base
inteira só existem R$ 110,00 de abertura). Mas no dia em que a clínica começar a
deixar troco na gaveta, o mesmo caixa vai mostrar **dois valores diferentes**
conforme quem fecha — e a diferença vai ser exatamente o valor do troco.
Já aconteceu uma vez, em 11/08: caixa com R$ 10,00 de troco gravou R$ 100,00 no
fechamento contra R$ 90,00 de movimento.

---

## 6. O que eu recomendo

Em ordem de importância:

1. **Fechar o caixa da Mayara de 18/08** (R$ 3.909,95), conferindo contra o
   cupom impresso daquele dia. É o maior valor solto.
2. **Conferir os R$ 1.263,99 da Amanda de 18/08**, que foram fechados como zero.
3. **Encerrar os 6 caixas antigos** (maio/junho/julho) que ninguém mais usa.
4. **Fechar o caixa do Luan de 22/08**, achando antes os R$ 120,01 que faltam.
5. **Alinhar as duas contas de fechamento** no código, antes que passem a usar
   troco de abertura.

Nada disso é conta errada do sistema — é serviço de arrumação de caixa que ficou
pendente. A parte que era defeito de verdade (o fechamento que cobria só um dia)
já foi corrigida em 19/08 e não voltou a acontecer.

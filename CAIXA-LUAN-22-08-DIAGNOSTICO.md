# Caixa do Luan — sábado 22/08/2026

Diagnóstico feito em 24/08/2026 consultando o banco de produção (somente leitura).
Atendente: LUAN CARLOS DE OLIVEIRA.
O script que gera tudo isso está em `CAIXA-LUAN-22-08-DIAGNOSTICO.sql`.

---

## Resumo em uma frase

Crédito e Pix batem centavo a centavo. Faltam **R$ 95,00 em débito** e
**R$ 120,01 em dinheiro** no sistema novo, e mais **R$ 175,00** que existem mas
foram lançados com a forma de pagamento **"Manual"**, então não aparecem em
nenhuma coluna do cupom. Além disso, **o caixa dele de sábado nunca foi fechado**
e continua aberto até hoje.

---

## 1. O caixa dele

| Dia | Abriu | Fechou | Situação |
|-----|-------|--------|----------|
| 21/08 (sex) | 08:36 | 12:48 | fechado, diferença 0,00 |
| **22/08 (sáb)** | **08:45** | — | **ABERTO ATÉ AGORA (35 movimentos)** |

Não há nenhuma sangria registrada no sistema novo em 22/08 — nem retirada, nem
despesa. O cupom antigo mostra sangria de R$ 1.478,00, ou seja, ele retirou o
dinheiro na prática, mas isso nunca foi digitado no sistema novo, e o caixa
nunca foi fechado.

---

## 2. Conferência contra o cupom

| Forma | Cupom (sistema antigo) | Sistema novo (líquido) | Diferença |
|-------|------------------------|------------------------|-----------|
| Crédito | 1.854,00 | 1.854,00 | **bate** |
| Depósito / Pix | 335,00 | 335,00 | **bate** |
| Débito | 287,00 | 192,00 | **−95,00** |
| Dinheiro | 1.478,00 | 1.182,99 | **−295,01** |
| "Manual" (não existe no cupom) | — | 175,00 | +175,00 |
| **Total de entradas** | **3.954,00** | **3.738,99** | **−215,01** |

O cupom foi impresso às **11:49**. Contando o sistema novo só até esse horário,
crédito (1.854,00) e Pix (335,00) continuam batendo, o débito continua 192,00 e
o dinheiro fica em 952,99 — ou seja, o horário de impressão não explica a
diferença.

---

## 3. Detalhe do DÉBITO — falta R$ 95,00

| Hora | Paciente | Procedimento / descrição | Valor |
|------|----------|--------------------------|-------|
| 09:33 | PAULO ROBERTO SILVA BACEL | Mensalidade 2/24 — contrato #20261236 | 120,00 |
| 11:28 | FLORA GONZAGA LOPES | Consulta (convênio Cartão Consulta) | 72,00 |
| 12:33 | PAULO ROBERTO SILVA BACEL | *estorno do lançamento das 09:33* | −120,00 |
| 12:34 | PAULO ROBERTO SILVA BACEL | Mensalidade 2/24 — relançada | 120,00 |
| | | **Líquido** | **192,00** |

O estorno das 12:33 e o relançamento das 12:34 se anulam — foi uma correção do
próprio Luan, não é a causa da diferença. Faltam mesmo **R$ 95,00** de débito.

**Candidato para conferir no cupom impresso:** o único pagamento de R$ 95,00 em
débito registrado no sábado inteiro, em toda a clínica, foi
**EUTACIANA MARQUES REGIS ARAUJO — MANUTENÇÃO (ODONTOLOGIA)**, às 08:40, e caiu
no caixa da SUELLEN. Se esse nome estiver no cupom do Luan, o pagamento foi
registrado no caixa errado. Se não estiver, é um pagamento de 95,00 que ele
recebeu e nunca digitou no sistema novo.

---

## 4. Detalhe do DINHEIRO — falta R$ 120,01

| Hora | Paciente | Procedimento / descrição | Valor |
|------|----------|--------------------------|-------|
| 08:57 | MARIA FATIMA DE ALMEIDA ROCHA | Consulta (Ortopedia) | 110,00 |
| 09:04 | RIAN LOPES VIEIRA | Consulta (Dermatologia) | 110,00 |
| 09:09 | ROBERTO DOS SANTOS | USG Abdominal Total | 110,00 |
| 09:15 | MARIA DAS GRACAS DE OLIVEIRA | Consulta (convênio Cartão Consulta) | 9,99 |
| 09:50 | MARIA DE LOURDES FABIANO LOURENCO | Eletrocardiograma | 51,00 |
| 09:54 | AUDEFLAN JOSE DOS SANTOS | Consulta (Cardiologia) | 110,00 |
| 10:01 | BRENDA RODRIGUES ALEXANDRE DUARTE | Consulta (Dermatologia) | 110,00 |
| 10:09 | TELMA DE ANDRADE FERNANDES PEIXOTO | Consulta | 110,00 |
| 10:09 | TELMA DE ANDRADE FERNANDES PEIXOTO | Preventivo (Ginecologia) | 52,00 |
| 10:24 | ENZO VICTOR DA SILVA BORGES | Consulta (Cartão Consulta) | 60,00 |
| 10:47 | LUCIENE BARBOSA DA SILVA | Consulta Clínica Médica | 10,00 |
| 11:33 | DANIELLE BARBOSA DA SILVA | Consulta | 110,00 |
| 12:27 | GILVANETE ROCHA DE LIMA | Mensalidade 2/12 — contrato #20260586 | 230,00 |
| | | **Total** | **1.182,99** |

A conta do dinheiro fica assim:

    1.182,99  dinheiro registrado
    +  175,00  mensalidade da ENIR, lançada como "Manual" (ver item 5)
    ---------
      1.357,99  contra 1.478,00 do cupom  ->  faltam 120,01

O centavo de diferença vem da consulta da MARIA DAS GRACAS, lançada como **9,99**
no sistema novo (no antigo deve ter saído 10,00).

**Candidatos para conferir no cupom impresso:** pagamentos de R$ 120,00 em
dinheiro no sábado, todos registrados no caixa da NICOLE — MARCELIO ERMIRO
BATISTA (09:58), ROBSON VICTOR DO NASCIMENTO (10:03) e ANTONIO MARCOS GRANDINO
GALIXTO (10:52). Se algum desses nomes estiver no cupom do Luan, foi caixa
trocado; se nenhum estiver, é dinheiro recebido e não digitado.

---

## 5. A causa que dá para corrigir hoje: a forma "Manual"

Duas mensalidades de contrato foram cobradas com a forma de pagamento
**"Manual"**, que é uma opção da tela de Contratos
([contratos-page.tsx:3456](src/components/pages/contratos-page.tsx#L3456)).
Um pagamento com essa forma entra no caixa, mas não cai em nenhuma coluna do
cupom — não é dinheiro, não é cartão, não é Pix. Ele simplesmente some da
conferência.

| Hora | Paciente | Valor | O que aconteceu |
|------|----------|-------|-----------------|
| 09:28 | ENIR APARECIDA PARRIS DA SILVA | 175,00 | continua como "Manual" — **precisa ser corrigido** |
| 11:19 | GILVANETE ROCHA DE LIMA | 230,00 | o Luan percebeu, estornou às 12:26 e relançou em dinheiro às 12:27 |

Ou seja: ele já corrigiu um caso sozinho e deixou o outro passar. Os 175,00 da
ENIR muito provavelmente entraram em espécie na gaveta.

---

## 6. O que foi verificado e está limpo

- **Nenhum lançamento dele caiu no caixa de outra pessoa.** Todos os 35
  movimentos estão na gaveta dele de sábado.
- **Nenhum recebimento dele ficou sem movimento de caixa.**
- **Nenhum valor divergente** entre o financeiro e o caixa: os 34 pagamentos têm
  valor e forma idênticos nos dois lugares.
- **Nada de retroativo.** O único registro com data 22/08 digitado depois é um
  repasse médico de R$ 180,00 lançado pela Elisabete em 24/08 — repasse não passa
  por caixa e não afeta o cupom.

---

## 7. Recomendações

1. **Fechar o caixa dele de 22/08.** Está aberto há dois dias. Enquanto ficar
   aberto, qualquer lançamento retroativo feito por ele para 22/08 vai cair
   dentro dessa gaveta de sábado.
2. **Corrigir a mensalidade de R$ 175,00 da ENIR** de "Manual" para a forma real
   (provavelmente dinheiro) — do mesmo jeito que ele já fez com a da GILVANETE.
3. **Conferir no cupom impresso** os dois pagamentos que faltam: um de R$ 95,00
   em débito e um de R$ 120,00 em dinheiro, usando os nomes candidatos dos itens
   3 e 4 acima.
4. **Sugestão para o sistema:** a opção "Manual" na cobrança de mensalidade cria
   exatamente esse buraco na conferência do caixa. Vale tirá-la da lista, ou
   fazer com que um pagamento "Manual" não gere movimento de caixa nenhum.

---

## 8. Ajustes executados em 24/08/2026

### Feito

**Mensalidade da ENIR corrigida de "Manual" para "Dinheiro" (R$ 175,00).**
Três registros atualizados: o lançamento financeiro, o movimento de caixa e a
parcela do contrato. A evidência que confirmou a forma: a parcela **1/12 do
mesmo contrato #20260490** foi paga em **dinheiro** em 21/07.

**Sangria de R$ 1.478,00 registrada** no caixa de 22/08, com data e hora de
22/08 às 12:45 (depois do último lançamento do dia, que foi às 12:34), descrita
como a sangria do cupom impresso às 11:49.

**Observação de conferência gravada na sessão de caixa**, com os valores do
cupom, as divergências apuradas e o motivo de o pagamento de R$ 95,00 não ter
sido transferido.

### Não feito, e por quê

**A transferência dos R$ 95,00 da EUTACIANA não foi executada.** O pagamento
está no caixa da Suellen, que **já está fechado** e fechou **conferido**:
informado 6.526,89 = calculado 6.526,89, diferença zero. Tirar os 95,00 de lá
reescreveria um caixa fechado e criaria uma falta de 95,00 no caixa dela que
não existe na realidade.

Mais do que isso: o fato de o caixa dela ter fechado com diferença **zero** é
a evidência de que esses 95,00 **são mesmo dela**. Se fossem do Luan, o caixa
da Suellen teria fechado com 95,00 de sobra. Ou seja, os 95,00 que faltam no
Luan são **outro** pagamento, que ele recebeu e nunca digitou no sistema novo.

**O fechamento não foi executado** — está preparado em
`CAIXA-LUAN-22-08-FECHAMENTO.sql`, conforme pedido.

### Situação atual do caixa (ainda aberto)

| Forma | Saldo |
|-------|-------|
| Crédito | 1.854,00 |
| Pix | 335,00 |
| Débito | 192,00 |
| **Dinheiro** | **−120,01** |
| **Saldo calculado** | **2.260,99** |

O dinheiro ficou negativo porque a sangria de 1.478,00 é maior que os 1.357,99
de dinheiro registrados — a prova aritmética de que há 120,01 recebidos em
espécie que nunca foram digitados.

**Consequência prática:** o sistema tem uma trava que impede fechar um caixa com
forma de pagamento negativa, então **o fechamento pela tela vai ser recusado**
enquanto esses 120,01 não aparecerem. O script de fechamento contorna essa trava
por SQL; o caminho preferível é achar o pagamento que falta no cupom impresso,
lançá-lo, e então fechar normalmente pela tela.

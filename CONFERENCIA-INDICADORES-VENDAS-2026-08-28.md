# Conferência dos indicadores da tela de Vendas — 28/08/2026

**Somente leitura. Nada foi alterado no banco nem no sistema.**

Cada indicador foi recalculado no banco com **exatamente a mesma regra que o
código usa**, e comparado com o que apareceu na tela.

---

## Resultado em uma linha

Dos seis indicadores, **quatro estão certos e dois estão errados**. Os dois
errados — *A vencer* e *Inadimplentes* — mostram menos do que a realidade,
porque a consulta que os alimenta é cortada em 1.000 linhas pelo banco.

**A clínica tem R$ 65.569,70 a mais em parcelas do mês do que a tela mostra.**

---

## 1. Tabela comparativa

| Indicador | Valor na tela | Valor real no banco | Diferença |
|---|---:|---:|---:|
| **Contratos ativos** (qtd) | 1.882 | 1.882 | — ✅ |
| **Contratos ativos** (R$) | 202.730,70 | 202.730,70 | — ✅ |
| **Pagos no mês** (qtd) | 186 | 186 | — ✅ |
| **Pagos no mês** (R$) | 29.488,50 | 29.488,50 | — ✅ |
| **A vencer** (qtd) | 0 | **140** | **−140** ❌ |
| **A vencer** (R$) | 0,00 | **16.495,45** | **−16.495,45** ❌ |
| **Inadimplentes** (qtd) | 702 | **1.123** | **−421** ❌ |
| **Inadimplentes** (R$) | 82.706,00 | **131.780,25** | **−49.074,25** ❌ |
| **Novos contratos** (qtd) | 27 | 27 | — ✅ |
| **Novos contratos** (R$) | 3.930,00 | 3.930,00 | — ✅ |
| **Cancelados / inativos** | 82 | 82 | — ✅ |
| **Lista "Últimos 30 dias"** | 22 | **29** | **−7** ❌ |

---

## 2. A causa dos dois indicadores errados

Os três indicadores de parcelas (*Pagos no mês*, *A vencer*, *Inadimplentes*)
saem de **uma única consulta** que pede ao banco todas as parcelas com
vencimento dentro do mês.

Em agosto de 2026 existem **1.561 parcelas** com vencimento no mês. O banco,
por padrão, **devolve no máximo 1.000 linhas por consulta** quando ninguém pede
paginação — e essa consulta não pede. Então **561 parcelas ficam de fora**, e
os três indicadores são calculados só sobre as 1.000 primeiras.

### A prova

Refiz a conta no banco cortando de propósito em 1.000 linhas, do mesmo jeito
que o sistema faz hoje. O resultado reproduziu a tela **exatamente**:

| Situação | Simulando o corte em 1.000 | O que está na tela |
|---|---:|---:|
| Pagas | 186 · R$ 29.488,50 | 186 · R$ 29.488,50 |
| Atrasadas | 702 · R$ 82.706,00 | 702 · R$ 82.706,00 |
| A vencer | 0 · R$ 0,00 | 0 · R$ 0,00 |
| Canceladas (ignoradas) | 112 | — |
| **Soma** | **1.000** | — |

Repare que as quatro linhas somam exatamente 1.000 — o tamanho do corte. Não é
coincidência: é o corte.

### Por que "A vencer" deu zero

As parcelas que ainda vão vencer (de 28 a 31 de agosto) estão todas depois da
linha 1.000 na ordem em que o banco devolve. Nenhuma delas chegou à tela. Por
isso o indicador mostra zero num mês em que existem **140 parcelas a vencer,
somando R$ 16.495,45**.

Esse é o erro mais perigoso dos dois, porque zero parece um número legítimo —
ninguém desconfia de um card que diz "não há nada a vencer".

### É o mesmo tipo de problema que corrigi hoje de manhã

Os outros quatro indicadores estavam errados pelo mesmo motivo (contavam só os
500 contratos carregados na tela) e foram corrigidos. Estes três ficaram de
fora porque já consultavam o banco — o que faltou perceber é que também
esbarravam num teto, só que num teto diferente (1.000 linhas por consulta, em
vez de 500 contratos).

**A correção é a mesma que já usei:** pedir as parcelas em páginas de mil até
acabar, em vez de uma consulta só.

---

## 3. Três indicadores medem coisa diferente do que o nome sugere

Isto **não é defeito** — os números batem com a regra escrita no código. Mas o
nome do card induz a outra leitura, e vale decidir se é isso mesmo que a
diretoria quer ver.

### 3.1 "Pagos no mês" conta por vencimento, não por recebimento

O card conta *parcelas que venciam em agosto e estão pagas* — não *dinheiro que
entrou em agosto*.

| Leitura | Quantidade | Valor |
|---|---:|---:|
| Parcelas que **venciam** em agosto e estão pagas (o card de hoje) | 186 | R$ 29.488,50 |
| Parcelas efetivamente **recebidas** em agosto (qualquer vencimento) | 206 | R$ 32.978,50 |

A diferença de R$ 3.490,00 é de gente que pagou em agosto parcela de outro mês.

### 3.2 "Inadimplentes" só enxerga o mês corrente

O card conta apenas parcelas **vencidas dentro de agosto**. Quem está devendo
desde junho não aparece ali.

| Leitura | Quantidade | Valor |
|---|---:|---:|
| Vencidas em agosto (o card de hoje, se não fosse o corte) | 1.123 | R$ 131.780,25 |
| Vencidas de meses anteriores | 1.097 | R$ 121.315,70 |
| **Total realmente vencido e não pago** | **2.220** | **R$ 253.095,95** |

Ou seja: a inadimplência real do Cartão é de **R$ 253 mil**, e o card mostra
R$ 82 mil — uma parte por causa do corte de 1.000 linhas, outra porque ele só
olha o mês.

### 3.3 O corte de dias de atraso do card não é o mesmo da regra de atendimento

- **No card**: a parcela conta como inadimplente **a partir do dia seguinte ao
  vencimento** (1 dia de atraso já entra).
- **No balcão**: o cartão só é bloqueado **depois de 5 dias corridos** de
  atraso — dentro da tolerância o paciente usa o benefício normalmente.

Pelo critério do balcão, os números seriam **2.063 parcelas / R$ 233.750,95**
(contra 2.220 / R$ 253.095,95 contando desde o primeiro dia).

Nenhum dos dois está errado; são perguntas diferentes. Mas hoje um gestor
olhando o card e uma recepcionista olhando a tela do paciente podem chegar a
conclusões opostas sobre a mesma pessoa.

### 3.4 "Novos contratos" conta por data de início, não por data da venda

| Leitura | Quantidade | Valor |
|---|---:|---:|
| Contratos com **início** em agosto (o card de hoje) | 27 | R$ 3.930,00 |
| Contratos **cadastrados** em agosto | 211 | R$ 26.680,00 |

A diferença enorme vem da importação de 18/08: 164 contratos foram cadastrados
naquele dia, mas com data de início em 01/01/2025 ou 01/01/2026. Para efeito de
"quanto vendemos este mês", nenhuma das duas leituras está redonda enquanto
esses lotes não forem regularizados.

---

## 4. A lista de baixo (filtro "Últimos 30 dias")

**A boa notícia:** o filtro de período **não interfere** nos cards do topo.
Confirmado na própria tela — a lista mostra 22 contratos enquanto o card mostra
1.882. Depois da correção de hoje, todos os seis indicadores são calculados no
banco, independentes de qualquer filtro da tela.

**Dois pontos a observar, porém:**

1. **O filtro usa a data de início do contrato, não a data da venda.** Está
   escrito assim no código ("Período (data de início)"). Numa tela chamada
   *Vendas*, "Últimos 30 dias" tende a ser lido como "vendido nos últimos 30
   dias" — que daria **213 contratos**, não 22.

2. **"Mostrando 1–22 de 22 contratos" não é o total real.** São 22 dos **29**
   que atendem ao filtro. Os outros 7 existem, mas não estão entre os 500
   contratos que a tela carrega, então o filtro nunca os viu. A frase dá a
   entender que são todos.

---

## 5. O que eu sugiro

Em ordem de urgência:

1. **Corrigir o corte de 1.000 linhas** nos três indicadores de parcelas. É o
   mesmo conserto que já fiz hoje nos outros quatro, no mesmo arquivo, sem
   mexer em regra nenhuma de cobrança. Enquanto não for feito, *A vencer* e
   *Inadimplentes* continuam mostrando menos do que a realidade — e vão piorar
   conforme o número de parcelas do mês crescer.

2. **Decidir o que "Inadimplentes" deve mostrar**: só o mês (como hoje) ou tudo
   que está vencido (R$ 253 mil). Minha sugestão é tudo que está vencido, que é
   a pergunta que a diretoria faz de verdade — e deixar claro no card qual é o
   corte.

3. **Decidir o critério de "Pagos no mês"**: por vencimento ou por recebimento.
   Para acompanhar caixa, o certo é por recebimento.

4. **Corrigir a frase "Mostrando 1–22 de 22"** para não afirmar um total que
   não é o total, ou fazer o filtro de período consultar o banco inteiro.

Os itens 2, 3 e 4 são decisão sua — mudam o que o número significa. O item 1 é
defeito puro e simples, e eu consigo entregar sem risco.
